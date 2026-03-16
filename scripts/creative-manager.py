#!/usr/bin/env python3
"""
Creative Manager - Detects creative fatigue and manages creative rotation.

Detects:
- Creative fatigue (CTR decline >35% over 7d + frequency > 8)
- Auto-lowers impression share for fatigued creatives on StackAdapt
- Queues pause/rotation recommendations for approval

Platforms: StackAdapt (primary), Google Ads, LinkedIn (proxy metrics)
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'platforms'))

from agent_base import BaseAgent


class CreativeManager(BaseAgent):
    """Agent for detecting creative fatigue and managing creative rotation."""
    
    SLUG = "creative-manager"
    NAME = "Creative Manager"
    AGENT_SLUG = "creative-manager"
    AGENT_NAME = "Creative Manager"
    DESCRIPTION = "Detects creative fatigue and manages impression share rotation"
    PLATFORM = "all"
    SCHEDULE = "Daily 5 AM PST"
    
    CTR_DECLINE_THRESHOLD = 0.35
    FREQUENCY_PROXY_THRESHOLD = 8000  # Impressions as proxy for freq > 8
    FATIGUE_IMPRESSION_SHARE = 20
    
    def __init__(self, dry_run: bool = False):
        super().__init__(dry_run=dry_run)
        self.dry_run = dry_run
        
    def analyze_stackadapt_creatives(self) -> List[Dict]:
        """Analyze StackAdapt native ad creative fatigue."""
        findings = []
        
        try:
            from stackadapt import StackAdaptConnector
            conn = StackAdaptConnector()
            
            if not conn.load_credentials():
                self.log_error("StackAdapt credentials not found")
                return findings
                
            camps = conn.fetch_campaigns_with_groups(active_only=True)
            
            date_to = datetime.now().strftime('%Y-%m-%d')
            date_from_7d = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            date_from_14d = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')
            
            for camp in camps:
                cgid = camp['campaign_group_id']
                context = self.parse_campaign_name(camp['name'])
                
                if not self.check_learning_period(context):
                    continue
                    
                recent = conn.get_creative_metrics(cgid, date_from_7d, date_to, limit=50)
                if not recent:
                    continue
                    
                previous = conn.get_creative_metrics(
                    cgid, date_from_14d, date_from_7d, limit=50
                )
                
                recent_ctr = {c['creative_id']: c for c in recent if c['impressions'] > 500}
                previous_ctr = {c['creative_id']: c for c in previous if c['impressions'] > 500}
                
                for cid, recent_c in recent_ctr.items():
                    if cid in previous_ctr:
                        prev_c = previous_ctr[cid]
                        if prev_c['ctr'] > 0:
                            decline = (prev_c['ctr'] - recent_c['ctr']) / prev_c['ctr']
                            
                            if decline > self.CTR_DECLINE_THRESHOLD:
                                impressions = recent_c['impressions']
                                is_fatigued = impressions > self.FREQUENCY_PROXY_THRESHOLD
                                confidence = min(75 + int(decline * 100), 95)
                                
                                if is_fatigued and context.get('funnel') != 'BOFU':
                                    if self.check_guardrails(camp['name'], {
                                        'ctr_decline': decline, 'impressions': impressions
                                    }):
                                        findings.append({
                                            'platform': 'stackadapt',
                                            'campaign_id': camp['campaign_id'],
                                            'campaign_name': camp['name'],
                                            'campaign_group_id': cgid,
                                            'creative_id': cid,
                                            'creative_name': recent_c.get('name', 'unnamed'),
                                            'action': 'lower_impression_share',
                                            'target_value': self.FATIGUE_IMPRESSION_SHARE,
                                            'reason': f"Creative fatigued: CTR down {decline*100:.0f}%, {impressions} impressions",
                                            'old_ctr': prev_c['ctr'],
                                            'new_ctr': recent_c['ctr'],
                                            'confidence': confidence,
                                            'context': context,
                                            'auto_execute': confidence >= 80,
                                        })
                                else:
                                    findings.append({
                                        'platform': 'stackadapt',
                                        'campaign_id': camp['campaign_id'],
                                        'campaign_name': camp['name'],
                                        'creative_id': cid,
                                        'creative_name': recent_c.get('name', 'unnamed'),
                                        'action': 'recommend_rotation',
                                        'reason': f"CTR declining ({prev_c['ctr']:.2f}% → {recent_c['ctr']:.2f}%)",
                                        'confidence': confidence - 10,
                                        'context': context,
                                        'auto_execute': False,
                                    })
                                    
        except Exception as e:
            self.log_error(f"StackAdapt creative analysis error: {e}")
            
        return findings
        
    def execute_action(self, finding: Dict) -> Dict:
        """Execute a creative management action."""
        if self.dry_run:
            return {'success': True, 'dry_run': True, 'action': finding}
            
        platform = finding.get('platform')
        action = finding.get('action')
        
        try:
            if platform == 'stackadapt' and action == 'lower_impression_share':
                from stackadapt import StackAdaptConnector
                conn = StackAdaptConnector()
                conn.load_credentials()
                
                creative_id = finding.get('creative_id')
                campaign_id = finding.get('campaign_id')
                new_weight = finding.get('target_value', self.FATIGUE_IMPRESSION_SHARE)
                
                result = conn.update_creative_impression_share(
                    campaign_id, creative_id, new_weight
                )
                
                if result.success:
                    return {
                        'success': True,
                        'action': 'lower_impression_share',
                        'creative_id': creative_id,
                        'new_weight': new_weight,
                        'resource': result.resource_name
                    }
                else:
                    return {'success': False, 'error': result.error}
                    
            return {'success': False, 'error': f'Action {action} not implemented for {platform}'}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
            
    def run(self) -> Dict:
        """Run the Creative Manager agent."""
        self.log_run_start()
        
        all_findings = self.analyze_stackadapt_creatives()
        
        auto_actions = [f for f in all_findings if f.get('auto_execute')]
        pending_actions = [f for f in all_findings if not f.get('auto_execute')]
        
        executed = []
        if not self.dry_run:
            for finding in auto_actions:
                result = self.execute_action(finding)
                if result.get('success'):
                    executed.append({'finding': finding, 'result': result})
                    self.log_change(
                        platform=finding['platform'],
                        campaign_id=finding.get('campaign_id'),
                        campaign_name=finding.get('campaign_name'),
                        action_type='creative_impression_share',
                        old_value={'weight': 100},
                        new_value={'weight': finding.get('target_value')},
                        auto_executed=True
                    )
                    
        self.post_telegram_summary(
            findings=all_findings,
            auto_executed=len(executed),
            pending=len(pending_actions)
        )
        
        self.log_run_complete(
            findings_count=len(all_findings),
            recs_count=len(pending_actions),
            auto_executed_count=len(executed)
        )
        
        return {
            'total_findings': len(all_findings),
            'auto_executed': len(executed),
            'pending_approval': len(pending_actions),
            'dry_run': self.dry_run,
        }


def main():
    parser = argparse.ArgumentParser(description='Creative Manager')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    
    agent = CreativeManager(dry_run=args.dry_run)
    result = agent.run()
    print(json.dumps(result, indent=2, default=str))
    sys.exit(0 if not result.get('errors') else 1)


if __name__ == '__main__':
    main()
