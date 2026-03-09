#!/usr/bin/env python3
"""
Approve or reject a pending negative keyword recommendation.
Usage:
  python approve-negative.py --action approve --term "search term" --campaign-id 12345
  python approve-negative.py --action reject --term "search term"
"""

import argparse
import json
import os
import sys
import psycopg2

DB_URL = "postgresql://localhost:5432/dghub"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", required=True, choices=["approve", "reject"])
    parser.add_argument("--term", required=True, help="Search term to approve/reject")
    parser.add_argument("--campaign-id", help="Campaign ID (for approve)")
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Find pending recommendation matching this term
    cur.execute(
        """SELECT id, action, "targetId", impact FROM "Recommendation" 
           WHERE status='pending' AND type='add-negative' AND action LIKE %s 
           LIMIT 1""",
        (f'%{args.term}%',)
    )
    row = cur.fetchone()

    if not row:
        print(f"NOT_FOUND: No pending recommendation for '{args.term}'")
        conn.close()
        return

    rec_id, action_text, target_id, impact_json = row
    meta = json.loads(impact_json) if impact_json else {}
    campaign_id = args.campaign_id or target_id
    match_type = meta.get("match_type", "EXACT")

    if args.action == "reject":
        cur.execute('UPDATE "Recommendation" SET status=%s WHERE id=%s', ("rejected", rec_id))
        conn.commit()
        conn.close()
        print(f"REJECTED: {args.term}")
        return

    # Approve — apply to Google Ads
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from google.ads.googleads.client import GoogleAdsClient

        creds_path = os.path.expanduser("~/.config/google-ads/credentials.json")
        client = GoogleAdsClient.load_from_storage(creds_path)
        service = client.get_service("CampaignCriterionService")

        operation = client.get_type("CampaignCriterionOperation")
        criterion = operation.create
        criterion.campaign = f"customers/2356650573/campaigns/{campaign_id}"
        criterion.negative = True
        criterion.keyword.text = args.term
        criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum[match_type].value

        response = service.mutate_campaign_criteria(
            customer_id="2356650573", operations=[operation]
        )

        resource_name = response.results[0].resource_name
        cur.execute('UPDATE "Recommendation" SET status=%s WHERE id=%s', ("approved", rec_id))
        conn.commit()
        print(f"APPROVED: {args.term} → {resource_name}")

    except Exception as e:
        print(f"FAILED: {e}")

    conn.close()

if __name__ == "__main__":
    main()
