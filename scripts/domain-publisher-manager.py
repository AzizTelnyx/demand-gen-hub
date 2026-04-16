#!/usr/bin/env python3
"""
Domain & Publisher Manager - Manages domain exclusions for StackAdapt programmatic.

Auto-excludes domains with:
- >$200 spend + 0 conversions
- <30% viewability + 10K+ impressions
- In blocklist (competitors, tech giants)
- Bot/fraud indicators

Queues allow-list changes for approval.
Platform: StackAdapt (primary focus)
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import re

# Ensure lib is in path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'platforms'))

from agent_base import BaseAgent
from blocklists import is_blocked_domain, get_all_blocked


class DomainPublisherManager(BaseAgent):
    """Agent for managing StackAdapt domain exclusions and publisher quality."""
    
    SLUG = "domain-publisher-manager"
    NAME = "Domain & Publisher Manager"
    AGENT_SLUG = "domain-publisher-manager"
    AGENT_NAME = "Domain & Publisher Manager"
    DESCRIPTION = "Manages domain exclusions for programmatic display quality"
    PLATFORM = "stackadapt"
    SCHEDULE = "Daily 5:30 AM PST"
    
    # Domain quality thresholds
    SPEND_NO_CONV_THRESHOLD = 200  # $200 spend, 0 conversions
    VIEWABILITY_THRESHOLD = 0.30   # 30%
    VIEWABILITY_IMPRESSION_THRESHOLD = 10000  # 10K impressions
    
    def __init__(self, dry_run: bool = False):
        super().__init__(dry_run=dry_run)
        self.dry_run = dry_run
        self.blocked_domains = get_all_blocked()
        
    def load_knowledge(self) -> Dict[str, Any]:
        """Load strategy and ICP knowledge for domain relevance."""
        knowledge = {}
        
        # Load strategy for ICP/publisher relevance
        try:
            strategy = self.knowledge.get('strategy', 'telnyx-strategy')
            knowledge['strategy'] = strategy
            knowledge['target_verticals'] = strategy.get('target_verticals', [])
        except:
            knowledge['target_verticals'] = []
            
        # Load product groups
        try:
            products = self.knowledge.get('product-groups', 'product-groups')
            knowledge['products'] = products
        except:
            pass
            
        return knowledge
        
    def analyze_domain_quality(self, domain: str, metrics: Dict) -> Dict:
        """Analyze domain quality and return flags."""
        flags = []
        confidence = 50  # Base confidence
        
        spend = metrics.get('spend', 0)
        conversions = metrics.get('conversions', 0)
        viewability = metrics.get('viewability', 0)
        impressions = metrics.get('impressions', 0)
        ctr = metrics.get('ctr', 0)
        
        # Check 1: High spend, no conversions
        if spend >= self.SPEND_NO_CONV_THRESHOLD and conversions == 0:
            flags.append(f"${spend:.0f} spend, 0 conversions")
            confidence += 20
            
        # Check 2: Low viewability with high impressions
        if viewability < self.VIEWABILITY_THRESHOLD and impressions > self.VIEWABILITY_IMPRESSION_THRESHOLD:
            flags.append(f"{viewability*100:.0f}% viewability on {impressions} impressions")
            confidence += 15
            
        # Check 3: Blocked domain
        if is_blocked_domain(domain):
            flags.append("Domain in blocklist (competitor/tech giant)")
            confidence = 95  # Highest confidence
            
        # Check 4: Bot/fraud indicators
        if ctr < 0.001 and impressions > 5000:  # < 0.1% CTR with volume = suspicious
            flags.append(f"Suspiciously low CTR ({ctr*100:.3f}%)")
            confidence += 10
            
        # Check 5: Consumer/B2C indicator domains
        consumer_patterns = [
            r'tiktok\.com', r'instagram\.com', r'facebook\.com',
            r'youtube\.com', r'twitch\.tv', r'reddit\.com',
            r'buzzfeed\.com', r'vice\.com',
        ]
        for pattern in consumer_patterns:
            if re.search(pattern, domain, re.I):
                flags.append("Consumer/B2C domain")
                confidence += 10
                break
                
        return {
            'domain': domain,
            'flags': flags,
            'confidence': min(confidence, 95),
            'metrics': metrics,
            'should_exclude': confidence >= 80 or len(flags) >= 2
        }
        
    def analyze_stackadapt_domains(self) -> List[Dict]:
        """Analyze StackAdapt domain-level performance."""
        findings = []
        
        try:
            from platforms.stackadapt import StackAdaptConnector
            conn = StackAdaptConnector()
            
            if not conn.load_credentials():
                self.log_error("StackAdapt credentials not found")
                return findings
                
            # Get active campaigns with groups
            camps = conn.fetch_campaigns_with_groups(active_only=True)
            self.logger.info(f"Analyzing {len(camps)} StackAdapt campaigns")
            
            date_to = datetime.now().strftime('%Y-%m-%d')
            date_from = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')
            
            for camp in camps:
                cgid = camp['campaign_group_id']
                context = self.parse_campaign_name(camp['name'])
                
                # Skip if campaign too new
                if not self.check_learning_period(context):
                    continue
                    
                # Get domain report
                domains = conn.get_domain_report(cgid, date_from, date_to, limit=100)
                
                if not domains:
                    continue
                    
                excluded_domains = []
                
                for d in domains:
                    domain = d.get('domain', '')
                    if not domain:
                        continue
                        
                    analysis = self.analyze_domain_quality(domain, d)
                    
                    if analysis['should_exclude'] and analysis['confidence'] >= 80:
                        # Check guardrails
                        if self.check_guardrails(camp['name'], {
                            'domain_exclude': domain,
                            'spend': d.get('spend', 0)
                        }):
                            excluded_domains.append({
                                'domain': domain,
                                'confidence': analysis['confidence'],
                                'flags': analysis['flags'],
                                'metrics': d
                            })
                            
                if excluded_domains:
                    # Sort by confidence
                    excluded_domains.sort(key=lambda x: x['confidence'], reverse=True)
                    
                    # Limit to top 10 per campaign group
                    excluded_domains = excluded_domains[:10]
                    
                    # Build finding
                    domain_list = [d['domain'] for d in excluded_domains]
                    total_spend_at_risk = sum(d['metrics']['spend'] for d in excluded_domains)
                    
                    findings.append({
                        'platform': 'stackadapt',
                        'campaign_id': camp['campaign_id'],
                        'campaign_name': camp['name'],
                        'campaign_group_id': cgid,
                        'action': 'exclude_domains',
                        'domains': domain_list,
                        'domain_details': excluded_domains,
                        'reason': f"Quality issues on {len(domain_list)} domains (${total_spend_at_risk:.0f} spend)",
                        'confidence': max(d['confidence'] for d in excluded_domains),
                        'spend_at_risk': total_spend_at_risk,
                        'context': context,
                        'auto_execute': True,  # Level 3 auto
                    })
                    
        except Exception as e:
            self.log_error(f"StackAdapt domain analysis error: {e}")
            
        return findings
        
    def execute_action(self, finding: Dict) -> Dict:
        """Execute domain exclusion."""
        if self.dry_run:
            return {'success': True, 'dry_run': True, 'action': finding}
            
        platform = finding.get('platform')
        action = finding.get('action')
        
        try:
            if platform == 'stackadapt' and action == 'exclude_domains':
                from platforms.stackadapt import StackAdaptConnector
                conn = StackAdaptConnector()
                conn.load_credentials()
                
                cgid = finding.get('campaign_group_id')
                domains = finding.get('domains', [])
                
                if not domains:
                    return {'success': True, 'message': 'No domains to exclude'}
                    
                result = conn.exclude_domains(cgid, domains)
                
                if result.success:
                    return {
                        'success': True,
                        'action': 'exclude_domains',
                        'domains': domains,
                        'campaign_group_id': cgid,
                        'resource': result.resource_name
                    }
                else:
                    return {'success': False, 'error': result.error}
                    
            return {'success': False, 'error': f'Action {action} not implemented for {platform}'}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
            
    def run(self) -> Dict:
        """Run the Domain Publisher Manager."""
        self.log_run_start()
        
        # Load knowledge
        knowledge = self.load_knowledge()
        self.logger.info(f"Loaded {len(knowledge)} knowledge sections")
        self.logger.info(f"Blocklists: {len(self.blocked_domains)} blocked domains")
        
        # Analyze domains
        all_findings = []
        
        self.logger.info("Analyzing StackAdapt domains...")
        stackadapt_findings = self.analyze_stackadapt_domains()
        all_findings.extend(stackadapt_findings)
        self.logger.info(f"  Found {len(stackadapt_findings)} domain issues")
        
        # Categorize
        auto_actions = [f for f in all_findings if f.get('auto_execute')]
        
        # Execute auto actions
        executed = []
        if not self.dry_run:
            for finding in auto_actions:
                result = self.execute_action(finding)
                if result.get('success'):
                    executed.append({
                        'finding': finding,
                        'result': result
                    })
                    # Log change
                    for domain in finding.get('domains', []):
                        self.log_change(
                            platform='stackadapt',
                            campaign_id=finding.get('campaign_id'),
                            campaign_name=finding.get('campaign_name'),
                            action_type='domain_exclude',
                            old_value={'domain': domain, 'status': 'allowed'},
                            new_value={'domain': domain, 'status': 'excluded'},
                            auto_executed=True
                        )
                        
        # Post summary
        total_excluded = sum(len(f.get('domains', [])) for f in executed)
        
        self.post_telegram_summary(
            findings=all_findings,
            auto_executed=total_excluded,
            pending=0
        )
        
        # Log completion
        self.log_run_complete(
            findings_count=len(all_findings),
            recs_count=0,
            auto_executed_count=total_excluded
        )
        
        return {
            'total_findings': len(all_findings),
            'domains_excluded': total_excluded,
            'campaigns_affected': len(executed),
            'dry_run': self.dry_run
        }


def main():
    parser = argparse.ArgumentParser(description='Domain & Publisher Manager')
    parser.add_argument('--dry-run', action='store_true', help='Run without making changes')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    args = parser.parse_args()
    
    agent = DomainPublisherManager(dry_run=args.dry_run)
    
    if args.verbose:
        import logging
        logging.basicConfig(level=logging.DEBUG)
    
    result = agent.run()
    
    print(json.dumps(result, indent=2, default=str))
    
    if result.get('errors'):
        sys.exit(1)
    
    sys.exit(0)


if __name__ == '__main__':
    main()
