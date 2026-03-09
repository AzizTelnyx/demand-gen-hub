#!/usr/bin/env python3
"""
Keyword Research via Google Ads Keyword Planner API.

Usage:
  # Keyword ideas mode (default):
  echo '{"seed_keywords":["voice ai"],"target_countries":[2840]}' | python3 keyword-research.py

  # Existing keywords mode:
  python3 keyword-research.py --mode existing-keywords --customer-id 2356650573

Output: JSON to stdout
"""

import sys
import json
import os
import argparse
from pathlib import Path

def load_credentials():
    cred_path = Path.home() / ".config" / "google-ads" / "credentials.json"
    if not cred_path.exists():
        raise FileNotFoundError(f"Google Ads credentials not found at {cred_path}")
    with open(cred_path) as f:
        return json.load(f)

def get_client(creds):
    from google.ads.googleads.client import GoogleAdsClient
    
    config = {
        "developer_token": creds["developer_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "use_proto_plus": True,
    }
    if "login_customer_id" in creds:
        config["login_customer_id"] = str(creds["login_customer_id"])
    
    return GoogleAdsClient.load_from_dict(config)

def keyword_ideas(client, customer_id, seed_keywords, target_countries):
    """Get keyword ideas from Keyword Planner."""
    kp_service = client.get_service("KeywordPlanIdeaService")
    
    request = client.get_type("GenerateKeywordIdeasRequest")
    request.customer_id = str(customer_id)
    request.language = "languageConstants/1000"  # English
    
    # Set geo targets
    for country_id in target_countries:
        request.geo_target_constants.append(f"geoTargetConstants/{country_id}")
    
    # Seed keywords
    request.keyword_seed.keywords.extend(seed_keywords)
    
    # Include adult keywords = False
    request.keyword_plan_network = client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH
    
    results = []
    try:
        response = kp_service.generate_keyword_ideas(request=request)
        
        for idea in response:
            metrics = idea.keyword_idea_metrics
            result = {
                "keyword": idea.text,
                "avg_monthly_searches": metrics.avg_monthly_searches or 0,
                "competition": metrics.competition.name if metrics.competition else "UNKNOWN",
                "competition_index": metrics.competition_index or 0,
                "avg_cpc": 0,
            }
            
            # Get CPC (low and high range)
            if metrics.low_top_of_page_bid_micros:
                result["low_cpc"] = metrics.low_top_of_page_bid_micros / 1_000_000
            if metrics.high_top_of_page_bid_micros:
                result["high_cpc"] = metrics.high_top_of_page_bid_micros / 1_000_000
                result["avg_cpc"] = (
                    (result.get("low_cpc", 0) + result["high_cpc"]) / 2
                )
            
            results.append(result)
    except Exception as e:
        print(json.dumps({"error": str(e), "keywords": []}))
        sys.exit(1)
    
    # Sort by volume descending
    results.sort(key=lambda x: x["avg_monthly_searches"], reverse=True)
    
    return results

def get_per_country_data(client, customer_id, keywords, countries):
    """Get per-country breakdown for top keywords."""
    kp_service = client.get_service("KeywordPlanIdeaService")
    per_country = {}
    
    # Only do per-country for top keywords to save API calls
    top_keywords = keywords[:50]
    
    for country_id in countries:
        try:
            request = client.get_type("GenerateKeywordIdeasRequest")
            request.customer_id = str(customer_id)
            request.language = "languageConstants/1000"
            request.geo_target_constants.append(f"geoTargetConstants/{country_id}")
            request.keyword_seed.keywords.extend([kw["keyword"] for kw in top_keywords])
            request.keyword_plan_network = client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH
            
            response = kp_service.generate_keyword_ideas(request=request)
            
            for idea in response:
                kw_text = idea.text
                metrics = idea.keyword_idea_metrics
                if kw_text not in per_country:
                    per_country[kw_text] = {}
                per_country[kw_text][str(country_id)] = {
                    "avg_monthly_searches": metrics.avg_monthly_searches or 0,
                    "competition": metrics.competition.name if metrics.competition else "UNKNOWN",
                }
        except Exception as e:
            # Non-fatal: we have aggregate data, per-country is bonus
            print(f"Warning: per-country lookup failed for {country_id}: {e}", file=sys.stderr)
    
    return per_country

def existing_keywords(client, customer_id):
    """Get all existing keywords (non-removed) from the account."""
    ga_service = client.get_service("GoogleAdsService")
    
    query = """
        SELECT
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            campaign.name,
            campaign.status
        FROM ad_group_criterion
        WHERE ad_group_criterion.type = 'KEYWORD'
            AND campaign.status != 'REMOVED'
            AND ad_group_criterion.status != 'REMOVED'
    """
    
    results = []
    try:
        response = ga_service.search(customer_id=str(customer_id), query=query)
        for row in response:
            results.append({
                "keyword": row.ad_group_criterion.keyword.text,
                "matchType": row.ad_group_criterion.keyword.match_type.name,
                "status": row.ad_group_criterion.status.name,
                "campaignName": row.campaign.name,
                "campaignStatus": row.campaign.status.name,
            })
    except Exception as e:
        print(json.dumps({"error": str(e), "keywords": []}))
        sys.exit(1)
    
    return results

def main():
    parser = argparse.ArgumentParser(description="Keyword Research via Google Ads API")
    parser.add_argument("--mode", default="ideas", choices=["ideas", "existing-keywords"])
    parser.add_argument("--customer-id", default="2356650573")
    args = parser.parse_args()
    
    creds = load_credentials()
    client = get_client(creds)
    
    if args.mode == "existing-keywords":
        kws = existing_keywords(client, args.customer_id)
        print(json.dumps({"keywords": kws, "count": len(kws)}))
        return
    
    # Ideas mode — read input from stdin
    input_data = json.load(sys.stdin)
    seed_keywords = input_data.get("seed_keywords", [])
    target_countries = input_data.get("target_countries", [2840])
    customer_id = input_data.get("customer_id", args.customer_id)
    
    if not seed_keywords:
        print(json.dumps({"error": "No seed_keywords provided", "keywords": []}))
        sys.exit(1)
    
    # Get keyword ideas
    keywords = keyword_ideas(client, customer_id, seed_keywords, target_countries)
    
    # Get per-country data for top keywords
    per_country = {}
    if len(target_countries) > 1 and len(keywords) > 0:
        per_country = get_per_country_data(client, customer_id, keywords, target_countries)
    
    # Merge per-country data
    for kw in keywords:
        kw["per_country"] = per_country.get(kw["keyword"], {})
    
    output = {
        "keywords": keywords,
        "count": len(keywords),
        "seed_keywords": seed_keywords,
        "target_countries": target_countries,
    }
    
    print(json.dumps(output))

if __name__ == "__main__":
    main()
