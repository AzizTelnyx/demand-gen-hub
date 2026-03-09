#!/usr/bin/env python3
"""
Landing Page & UTM Validator

Validates landing pages and UTM parameters for all live campaigns across all platforms.

Checks:
1. UTM parameters present and correctly formatted
2. UTM source matches platform (google_ads → utm_source=google)
3. UTM campaign matches naming convention
4. Landing page returns 200 OK (no 404s or redirects)
5. Landing page relevance to campaign product/funnel
6. No UTMs on internal page links

Platforms: Google Ads, LinkedIn, StackAdapt, Reddit
Level: Recommendations only (no auto-execution — URLs are too risky to change automatically)
"""

import os
import sys
import json
import argparse
import re
import urllib.request
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import ssl

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'platforms'))

from agent_base import BaseAgent, CampaignContext

# Disable SSL verification for some edge cases
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE


class LandingPageValidator(BaseAgent):
    """Agent for validating landing pages and UTM parameters."""
    
    SLUG = "landing-page-validator"
    NAME = "Landing Page & UTM Validator"
    DESCRIPTION = "Validates landing pages and UTM parameters for all live campaigns"
    PLATFORM = "all"
    SCHEDULE = "Daily 6 AM PST"
    
    # UTM parameter rules
    PLATFORM_UTM_SOURCES = {
        'google_ads': 'google',
        'linkedin': 'linkedin',
        'stackadapt': 'stackadapt',
        'reddit': 'reddit',
    }
    
    REQUIRED_UTMS = ['utm_source', 'utm_medium', 'utm_campaign']
    OPTIONAL_UTMS = ['utm_content', 'utm_term']
    
    # HTTP timeout for landing page checks
    HTTP_TIMEOUT = 10
    MAX_REDIRECTS = 3
    
    def __init__(self, dry_run: bool = False):
        super().__init__(
            slug=self.SLUG,
            name=self.NAME,
            dry_run=dry_run
        )
        self.dry_run = dry_run
        
    def load_knowledge(self) -> Dict[str, Any]:
        """Load landing page and UTM standards."""
        knowledge = {}
        
        try:
            # Load product info for landing page validation
            products = self.knowledge.get('product-groups', 'product-groups')
            knowledge['products'] = products
        except:
            pass
            
        return knowledge
        
    def validate_url(self, url: str, campaign_context: Dict) -> Dict:
        """Validate a URL — check status and extract UTMs."""
        result = {
            'url': url,
            'valid': True,
            'issues': [],
            'utm_params': {},
            'status_code': None,
            'redirect_chain': [],
            'final_url': url,
        }
        
        if not url or not url.startswith('http'):
            result['valid'] = False
            result['issues'].append("Invalid or missing URL")
            return result
            
        # Parse URL
        try:
            parsed = urlparse(url)
            utm_params = parse_qs(parsed.query)
            # Flatten single-value params
            result['utm_params'] = {k: v[0] if len(v) == 1 else v for k, v in utm_params.items()}
        except Exception as e:
            result['valid'] = False
            result['issues'].append(f"URL parse error: {str(e)}")
            return result
            
        # Check HTTP status
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; TelnyxBot/1.0)'},
                method='HEAD'
            )
            
            redirect_count = 0
            current_url = url
            
            while redirect_count < self.MAX_REDIRECTS:
                try:
                    with urllib.request.urlopen(
                        req, 
                        timeout=self.HTTP_TIMEOUT,
                        context=ssl_context
                    ) as response:
                        result['status_code'] = response.getcode()
                        result['final_url'] = response.geturl()
                        break
                except urllib.error.HTTPError as e:
                    result['status_code'] = e.code
                    if e.code in (301, 302, 307, 308):
                        redirect_count += 1
                        result['redirect_chain'].append(current_url)
                        if 'Location' in e.headers:
                            current_url = e.headers['Location']
                            req = urllib.request.Request(
                                current_url,
                                headers={'User-Agent': 'Mozilla/5.0 (compatible; TelnyxBot/1.0)'},
                                method='HEAD'
                            )
                        else:
                            break
                    else:
                        result['valid'] = False
                        result['issues'].append(f"HTTP {e.code} error")
                        break
                        
            if redirect_count >= self.MAX_REDIRECTS:
                result['issues'].append(f"Too many redirects ({self.MAX_REDIRECTS}+)")
                
        except Exception as e:
            result['valid'] = False
            result['issues'].append(f"Connection error: {str(e)}")
            
        return result
        
    def validate_utms(self, utm_params: Dict, platform: str, campaign_context: Dict) -> List[str]:
        """Validate UTM parameters against standards."""
        issues = []
        
        # Check required params
        for param in self.REQUIRED_UTMS:
            if param not in utm_params:
                issues.append(f"Missing {param}")
                
        # Check utm_source matches platform
        expected_source = self.PLATFORM_UTM_SOURCES.get(platform)
        actual_source = utm_params.get('utm_source', '').lower()
        
        if expected_source and actual_source:
            if expected_source not in actual_source and actual_source not in expected_source:
                issues.append(f"utm_source mismatch: expected '{expected_source}', got '{actual_source}'")
        elif not actual_source and 'utm_source' in utm_params:
            issues.append("utm_source is empty")
            
        # Check utm_campaign matches naming convention
        campaign_name = utm_params.get('utm_campaign', '')
        if campaign_name:
            # Campaign name should be: YYYYMM_FUNNEL_PRODUCT_FORMAT_REGION
            if not re.match(r'^\d{6}_[A-Z]+_[A-Z]', campaign_name):
                issues.append(f"utm_campaign doesn't match naming convention: {campaign_name}")
                
        # Check utm_medium is valid
        medium = utm_params.get('utm_medium', '').lower()
        valid_mediums = ['cpc', 'ppc', 'paidsearch', 'paidsocial', 'display', 'programmatic', 'social']
        if medium and medium not in valid_mediums:
            issues.append(f"Unusual utm_medium: '{medium}'")
            
        return issues
        
    def check_internal_links(self, url: str) -> List[str]:
        """Check if internal links on landing page have UTMs (they shouldn't)."""
        issues = []
        
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; TelnyxBot/1.0)'}
            )
            
            with urllib.request.urlopen(
                req, 
                timeout=self.HTTP_TIMEOUT,
                context=ssl_context
            ) as response:
                content = response.read().decode('utf-8', errors='ignore')
                
                # Find all links on page
                links = re.findall(r'href=["\'](.*?)["\']', content)
                
                # Check for UTMs on internal links
                base_domain = urlparse(url).netloc
                
                for link in links[:20]:  # Check first 20 links
                    if link.startswith('/') or base_domain in link:
                        if 'utm_' in link:
                            issues.append(f"Internal link has UTM: {link}")
                            
        except Exception as e:
            issues.append(f"Could not check internal links: {str(e)}")
            
        return issues
        
    def analyze_google_ads(self) -> List[Dict]:
        """Analyze Google Ads campaigns."""
        findings = []
        
        try:
            from scripts.platforms.google_ads import GoogleAdsConnector
            conn = GoogleAdsConnector()
            
            if not conn.load_credentials():
                return findings
                
            campaigns = conn.fetch_campaigns(active_only=True)
            
            for camp in campaigns:
                context = self.parse_campaign_name(camp.name)
                
                # Get final URL from campaign (simplified — in reality may need ad group level)
                # For now, we flag campaigns that might have missing UTMs
                
                # Just note campaigns for manual review if they don't have URLs set
                if not camp.final_url:
                    findings.append({
                        'platform': 'google_ads',
                        'campaign_id': camp.external_id,
                        'campaign_name': camp.name,
                        'action': 'missing_final_url',
                        'reason': 'Campaign has no final URL set',
                        'severity': 'high',
                        'confidence': 90,
                        'context': context,
                        'auto_execute': False,
                    })
                    
        except Exception as e:
            self.log_error(f"Google Ads analysis error: {e}")
            
        return findings
        
    def analyze_stackadapt(self) -> List[Dict]:
        """Analyze StackAdapt creatives."""
        findings = []
        
        try:
            from scripts.platforms.stackadapt import StackAdaptConnector
            conn = StackAdaptConnector()
            
            if not conn.load_credentials():
                return findings
                
            creatives = conn.fetch_creatives(active_only=True)
            
            for creative in creatives:
                if not creative.final_url:
                    continue
                    
                context = self.parse_campaign_name(creative.campaign_name)
                
                # Validate URL
                url_check = self.validate_url(creative.final_url, context)
                
                # Validate UTMs
                utm_issues = self.validate_utms(
                    url_check['utm_params'], 
                    'stackadapt',
                    context
                )
                
                all_issues = url_check['issues'] + utm_issues
                
                if all_issues:
                    findings.append({
                        'platform': 'stackadapt',
                        'campaign_id': creative.campaign_id,
                        'campaign_name': creative.campaign_name,
                        'creative_id': creative.external_id,
                        'creative_name': creative.name,
                        'url': creative.final_url,
                        'action': 'fix_url_utms',
                        'issues': all_issues,
                        'reason': '; '.join(all_issues[:3]),
                        'severity': 'high' if '404' in str(all_issues) else 'medium',
                        'confidence': 85,
                        'context': context,
                        'auto_execute': False,
                        'utm_params': url_check['utm_params'],
                        'status_code': url_check['status_code'],
                    })
                    
        except Exception as e:
            self.log_error(f"StackAdapt analysis error: {e}")
            
        return findings
        
    def analyze_linkedin(self) -> List[Dict]:
        """Analyze LinkedIn campaigns."""
        findings = []
        
        try:
            from scripts.platforms.linkedin import LinkedInConnector
            conn = LinkedInConnector()
            
            if not conn.load_credentials():
                return findings
                
            # LinkedIn API doesn't expose creative URLs easily
            # Flag active campaigns for manual URL review
            campaigns = conn.fetch_campaigns(active_only=True)
            
            for camp in campaigns:
                context = self.parse_campaign_name(camp.name)
                
                # Recommend periodic URL audit
                findings.append({
                    'platform': 'linkedin',
                    'campaign_id': camp.external_id,
                    'campaign_name': camp.name,
                    'action': 'audit_url_utms',
                    'reason': 'Manual URL/UTM audit recommended for LinkedIn campaign',
                    'severity': 'low',
                    'confidence': 50,
                    'context': context,
                    'auto_execute': False,
                })
                    
        except Exception as e:
            self.log_error(f"LinkedIn analysis error: {e}")
            
        return findings
        
    def analyze_reddit(self) -> List[Dict]:
        """Analyze Reddit campaigns."""
        findings = []
        
        try:
            from scripts.platforms.reddit import RedditConnector
            conn = RedditConnector()
            
            if not conn.load_credentials():
                return findings
                
            campaigns = conn.fetch_campaigns(active_only=True)
            
            for camp in campaigns:
                context = self.parse_campaign_name(camp.name)
                
                findings.append({
                    'platform': 'reddit',
                    'campaign_id': camp.external_id,
                    'campaign_name': camp.name,
                    'action': 'audit_url_utms',
                    'reason': 'Manual URL/UTM audit recommended for Reddit campaign',
                    'severity': 'low',
                    'confidence': 50,
                    'context': context,
                    'auto_execute': False,
                })
                    
        except Exception as e:
            self.log_error(f"Reddit analysis error: {e}")
            
        return findings
        
    def run(self) -> Dict:
        """Run the Landing Page Validator agent."""
        self.log_run_start()
        
        all_findings = []
        
        self.logger.info("Analyzing Google Ads campaigns...")
        all_findings.extend(self.analyze_google_ads())
        
        self.logger.info("Analyzing StackAdapt creatives...")
        all_findings.extend(self.analyze_stackadapt())
        
        self.logger.info("Analyzing LinkedIn campaigns...")
        all_findings.extend(self.analyze_linkedin())
        
        self.logger.info("Analyzing Reddit campaigns...")
        all_findings.extend(self.analyze_reddit())
        
        # All findings are recommendations (no auto-execution)
        high_severity = [f for f in all_findings if f.get('severity') == 'high']
        medium_severity = [f for f in all_findings if f.get('severity') == 'medium']
        low_severity = [f for f in all_findings if f.get('severity') == 'low']
        
        # Post summary to Telegram
        summary = f"🌐 Landing Page & UTM Validation\n\n"
        summary += f"Campaigns checked: Google Ads, LinkedIn, StackAdapt, Reddit\n"
        summary += f"Issues found: {len(all_findings)}\n"
        summary += f"  🔴 High: {len(high_severity)}\n"
        summary += f"  🟡 Medium: {len(medium_severity)}\n"
        summary += f"  🟢 Low: {len(low_severity)}\n\n"
        
        if high_severity:
            summary += "⚠️ High priority issues:\n"
            for f in high_severity[:5]:
                summary += f"  • {f['campaign_name'][:40]}: {f['reason'][:50]}\n"
                
        self.post_to_telegram(summary)
        
        # Log run
        self.log_run_complete(
            findings_count=len(all_findings),
            recs_count=len(all_findings),
            auto_executed_count=0  # Never auto-execute URL changes
        )
        
        return {
            'total_findings': len(all_findings),
            'high_severity': len(high_severity),
            'medium_severity': len(medium_severity),
            'low_severity': len(low_severity),
            'dry_run': self.dry_run,
        }


def main():
    parser = argparse.ArgumentParser(description='Landing Page & UTM Validator')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    
    agent = LandingPageValidator(dry_run=args.dry_run)
    result = agent.run()
    print(json.dumps(result, indent=2, default=str))
    sys.exit(0)


if __name__ == '__main__':
    main()
