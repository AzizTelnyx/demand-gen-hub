#!/usr/bin/env python3
"""Pull all keywords from active Google Ads search campaigns."""

import json, os, csv

def main():
    cred_path = os.path.expanduser("~/.config/google-ads/credentials.json")
    with open(cred_path) as f:
        creds = json.load(f)
    
    from google.ads.googleads.client import GoogleAdsClient
    client = GoogleAdsClient.load_from_dict({
        "developer_token": creds["developer_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "login_customer_id": str(creds.get("login_customer_id", "2893524941")),
        "use_proto_plus": True,
    })
    
    ga = client.get_service("GoogleAdsService")
    customer_id = "2356650573"
    
    query = """
        SELECT 
            campaign.name, 
            ad_group.name, 
            ad_group_criterion.keyword.text, 
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            campaign.id,
            ad_group.id
        FROM keyword_view
        WHERE campaign.status = 'ENABLED'
        AND ad_group_criterion.status != 'REMOVED'
        AND campaign.advertising_channel_type = 'SEARCH'
    """
    
    rows = []
    response = ga.search(customer_id=customer_id, query=query)
    
    MATCH_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "EXACT", 3: "PHRASE", 4: "BROAD"}
    STATUS_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "ENABLED", 3: "PAUSED", 4: "REMOVED"}
    
    for row in response:
        campaign_name = row.campaign.name
        ad_group_name = row.ad_group.name
        keyword_text = row.ad_group_criterion.keyword.text
        match_type_val = row.ad_group_criterion.keyword.match_type
        status_val = row.ad_group_criterion.status
        
        # Handle both proto-plus enum and int
        if isinstance(match_type_val, int):
            match_type = MATCH_MAP.get(match_type_val, str(match_type_val))
        else:
            match_type = match_type_val.name if hasattr(match_type_val, 'name') else str(match_type_val)
        
        if isinstance(status_val, int):
            status = STATUS_MAP.get(status_val, str(status_val))
        else:
            status = status_val.name if hasattr(status_val, 'name') else str(status_val)
        
        rows.append({
            "campaign": campaign_name,
            "ad_group": ad_group_name,
            "keyword": keyword_text,
            "match_type": match_type,
            "status": status,
        })
    
    # Deduplicate (keyword_view can have multiple date rows)
    seen = set()
    unique_rows = []
    for r in rows:
        key = (r["campaign"], r["ad_group"], r["keyword"], r["match_type"])
        if key not in seen:
            seen.add(key)
            unique_rows.append(r)
    
    # Write CSV
    out_path = "/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/keyword_audit_output.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["campaign", "ad_group", "keyword", "match_type", "status"])
        w.writeheader()
        w.writerows(unique_rows)
    
    print(f"Exported {len(unique_rows)} unique keywords to {out_path}")
    
    # Print summary
    campaigns = {}
    for r in unique_rows:
        c = r["campaign"]
        if c not in campaigns:
            campaigns[c] = {"total": 0, "BROAD": 0, "PHRASE": 0, "EXACT": 0}
        campaigns[c]["total"] += 1
        campaigns[c][r["match_type"]] = campaigns[c].get(r["match_type"], 0) + 1
    
    print(f"\n{len(campaigns)} active search campaigns:")
    for c, stats in sorted(campaigns.items()):
        print(f"  {c}: {stats['total']} keywords (B:{stats.get('BROAD',0)} P:{stats.get('PHRASE',0)} E:{stats.get('EXACT',0)})")

if __name__ == "__main__":
    main()
