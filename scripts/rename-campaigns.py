#!/usr/bin/env python3
"""Rename campaigns on Google Ads, Reddit, and StackAdapt to match naming standard.
LinkedIn campaigns listed for manual rename.

Usage:
  python3 scripts/rename-campaigns.py --dry-run    # Preview changes
  python3 scripts/rename-campaigns.py              # Execute renames
"""

import json, os, sys, time, argparse
import psycopg2
import requests

PSQL_DB = "dghub"
GOOGLE_ADS_CUSTOMER_ID = "2356650573"

# ── Rename Maps ──────────────────────────────────────────────

GOOGLE_RENAMES = {
    # platformId → new name
    "15219693110": "202104 MOFU SMS SA EMEA",
    "15213987345": "202104 MOFU Voice API SA EMEA",
    "16883024306": "202204 MOFU Numbers SA EMEA",
    "18525082043": "202210 MOFU Voice API RT GLOBAL",
    "21778360532": "202211 TOFU Voice API Twilio SA AMER",
    "20304732701": "202305 TOFU Voice API Twilio SA EMEA",
    "20315106470": "202306 BOFU Voice API Twilio DA GLOBAL",
    "20469421648": "202308 BOFU Voice API Twilio RLSA GLOBAL",
    "20642614284": "202310 MOFU IoT SIM SA APAC-AU",
    "23559393583": "202310 MOFU IoT SIM SA APAC-SEA",
    "22634140704": "202506 BOFU AI Agent DA GLOBAL",
    "22896402680": "202508 BRAND AI Agent Commercial VA GLOBAL",
    "23129611907": "202510 BRAND AI Agent Halloween VA GLOBAL",
    "23277159104": "202511 TOFU AI Agent TTS SA GLOBAL",
    "23372928600": "202512 TOFU AI Agent STT SA GLOBAL",
    "23546680743": "202602 BRAND ClawdTalk SA GLOBAL",
    "23574277866": "202602 TOFU AI Agent ElevenLabs SA AMER",
    "23583187406": "202602 TOFU AI Agent ElevenLabs SA APAC",
    "23584242697": "202602 TOFU AI Agent ElevenLabs SA EMEA",
    "23583479504": "202602 TOFU AI Agent LiveKit SA AMER",
    "23577831282": "202602 TOFU AI Agent LiveKit SA APAC",
    "23583479729": "202602 TOFU AI Agent LiveKit SA EMEA",
    "23577831258": "202602 TOFU Voice API Twilio SA APAC",
    "23584242475": "202602 TOFU AI Agent Vapi SA AMER",
    "23583186449": "202602 TOFU AI Agent Vapi SA APAC",
    "23584242652": "202602 TOFU AI Agent Vapi SA EMEA",
}

REDDIT_RENAMES = {
    "1790054843043494725": "202410 TOFU Voice API Twilio SI GLOBAL",
    "2165389330854420124": "202502 TOFU AI Agent SI GLOBAL",
    "2261790002976778314": "202506 TOFU AI Agent ElevenLabs SI GLOBAL",
    "2449802760087590045": "202508 TOFU AI Agent Vapi SI GLOBAL",
    "2449802722443566614": "202511 TOFU AI Agent TTS SI GLOBAL",
}

STACKADAPT_RENAMES = {
    "2882131": "202510 TOFU AI Agent DA GLOBAL",
    "2978014": "202511 MOFU AI Agent DA GLOBAL",
    "3105131": "202601 TOFU AI Agent Sabre NA GLOBAL",
    "3105136": "202601 TOFU AI Agent Travel NA GLOBAL",
}

# ── Google Ads ───────────────────────────────────────────────

def rename_google_ads(dry_run=True):
    print("\n═══ Google Ads ═══")
    from google.ads.googleads.client import GoogleAdsClient
    from google.protobuf import field_mask_pb2

    yaml_path = os.path.expanduser("~/.config/google-ads/google-ads.yaml")
    creds_path = os.path.expanduser("~/.config/google-ads/credentials.json")
    if os.path.exists(yaml_path):
        client = GoogleAdsClient.load_from_storage(yaml_path)
    else:
        with open(creds_path) as f:
            creds = json.load(f)
        client = GoogleAdsClient.load_from_dict({
            "developer_token": creds.get("developer_token"),
            "client_id": creds.get("client_id"),
            "client_secret": creds.get("client_secret"),
            "refresh_token": creds.get("refresh_token"),
            "login_customer_id": creds.get("login_customer_id", GOOGLE_ADS_CUSTOMER_ID),
            "use_proto_plus": True,
        })

    campaign_service = client.get_service("CampaignService")

    # Verify current names first
    ga_service = client.get_service("GoogleAdsService")
    ids = "','".join(GOOGLE_RENAMES.keys())
    query = f"""
        SELECT campaign.id, campaign.name 
        FROM campaign 
        WHERE campaign.id IN ('{ids}')
    """
    # Fetch current names
    current_names = {}
    try:
        response = ga_service.search(customer_id=GOOGLE_ADS_CUSTOMER_ID, query=query)
        for row in response:
            current_names[str(row.campaign.id)] = row.campaign.name
    except Exception as e:
        print(f"  ⚠️ Could not verify current names: {e}")

    operations = []
    for platform_id, new_name in GOOGLE_RENAMES.items():
        current = current_names.get(platform_id, "?")
        if current == new_name:
            print(f"  ⏭ Already correct: {new_name}")
            continue
        print(f"  {'[DRY] ' if dry_run else ''}Rename: {current} → {new_name}")
        if not dry_run:
            operation = client.get_type("CampaignOperation")
            campaign = operation.update
            campaign.resource_name = campaign_service.campaign_path(GOOGLE_ADS_CUSTOMER_ID, platform_id)
            campaign.name = new_name
            operation.update_mask = field_mask_pb2.FieldMask(paths=["name"])
            operations.append(operation)

    if not dry_run and operations:
        # Batch in groups of 5 to avoid rate limits
        for i in range(0, len(operations), 5):
            batch = operations[i:i+5]
            try:
                response = campaign_service.mutate_campaigns(
                    customer_id=GOOGLE_ADS_CUSTOMER_ID, operations=batch
                )
                for result in response.results:
                    print(f"  ✅ Renamed: {result.resource_name}")
            except Exception as e:
                print(f"  ❌ Batch {i//5+1} failed: {e}")
            time.sleep(1)
    
    print(f"  Total: {len(GOOGLE_RENAMES)} planned, {len(operations)} to execute")


# ── StackAdapt ───────────────────────────────────────────────

def rename_stackadapt(dry_run=True):
    print("\n═══ StackAdapt ═══")
    creds_path = os.path.expanduser("~/.config/stackadapt/credentials.json")
    if not os.path.exists(creds_path):
        print("  ⚠️ No StackAdapt credentials found")
        return
    
    with open(creds_path) as f:
        creds = json.load(f)
    
    gql = creds.get("graphql", {})
    api_token = gql.get("token")
    if not api_token:
        print("  ⚠️ No GraphQL token in credentials")
        return
    
    headers = {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}
    base_url = "https://api.stackadapt.com/graphql"
    
    for platform_id, new_name in STACKADAPT_RENAMES.items():
        print(f"  {'[DRY] ' if dry_run else ''}Rename campaign {platform_id} → {new_name}")
        if not dry_run:
            # StackAdapt uses GraphQL
            mutation = """
            mutation UpsertCampaign($id: Int!, $name: String!) {
                upsertCampaign(input: { id: $id, name: $name }) {
                    id name
                }
            }
            """
            try:
                resp = requests.post(base_url, headers=headers, json={
                    "query": mutation,
                    "variables": {"id": int(platform_id), "name": new_name}
                }, timeout=15)
                if resp.ok:
                    data = resp.json()
                    if data.get("data", {}).get("updateCampaign"):
                        print(f"  ✅ Renamed: {new_name}")
                    else:
                        print(f"  ❌ Failed: {data.get('errors', data)}")
                else:
                    print(f"  ❌ HTTP {resp.status_code}: {resp.text[:200]}")
            except Exception as e:
                print(f"  ❌ Error: {e}")
            time.sleep(0.5)


# ── Reddit ───────────────────────────────────────────────────

def rename_reddit(dry_run=True):
    print("\n═══ Reddit ═══")
    creds_path = os.path.expanduser("~/.config/reddit-ads/credentials.json")
    if not os.path.exists(creds_path):
        print("  ⚠️ No Reddit credentials found")
        return
    
    with open(creds_path) as f:
        creds = json.load(f)
    
    access_token = creds.get("access_token")
    if not access_token:
        print("  ⚠️ No access token in credentials")
        return
    
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    
    for platform_id, new_name in REDDIT_RENAMES.items():
        print(f"  {'[DRY] ' if dry_run else ''}Rename campaign {platform_id} → {new_name}")
        if not dry_run:
            try:
                url = f"https://ads-api.reddit.com/api/v3/campaigns/{platform_id}"
                resp = requests.put(url, headers=headers, json={"name": new_name}, timeout=15)
                if resp.ok:
                    print(f"  ✅ Renamed: {new_name}")
                else:
                    print(f"  ❌ HTTP {resp.status_code}: {resp.text[:200]}")
            except Exception as e:
                print(f"  ❌ Error: {e}")
            time.sleep(0.5)


# ── DB Update ────────────────────────────────────────────────

def update_db(dry_run=True):
    """Update campaign names in local DB to match."""
    print("\n═══ Database ═══")
    conn = psycopg2.connect(dbname=PSQL_DB)
    cur = conn.cursor()
    
    all_renames = {}
    for platform, renames in [("google_ads", GOOGLE_RENAMES), ("reddit", REDDIT_RENAMES), ("stackadapt", STACKADAPT_RENAMES)]:
        for pid, new_name in renames.items():
            all_renames[(platform, pid)] = new_name
    
    updated = 0
    for (platform, pid), new_name in all_renames.items():
        cur.execute(
            'SELECT name FROM "Campaign" WHERE "platformId" = %s AND platform = %s',
            (pid, platform)
        )
        row = cur.fetchone()
        if not row:
            print(f"  ⚠️ Not found in DB: {platform}/{pid}")
            continue
        if row[0] == new_name:
            continue
        print(f"  {'[DRY] ' if dry_run else ''}DB: {row[0]} → {new_name}")
        if not dry_run:
            cur.execute(
                'UPDATE "Campaign" SET name = %s, "updatedAt" = NOW() WHERE "platformId" = %s AND platform = %s',
                (new_name, pid, platform)
            )
            updated += 1
    
    if not dry_run:
        conn.commit()
    conn.close()
    print(f"  Updated: {updated} rows")


# ── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without executing")
    parser.add_argument("--platform", choices=["google", "reddit", "stackadapt", "db", "all"], default="all")
    args = parser.parse_args()
    
    dry = args.dry_run
    if dry:
        print("🔍 DRY RUN — no changes will be made\n")
    else:
        print("🚀 EXECUTING — changes will be applied\n")
    
    if args.platform in ("google", "all"):
        rename_google_ads(dry)
    if args.platform in ("stackadapt", "all"):
        rename_stackadapt(dry)
    if args.platform in ("reddit", "all"):
        rename_reddit(dry)
    if args.platform in ("db", "all"):
        update_db(dry)
    
    print("\n" + "═"*50)
    if dry:
        print("Dry run complete. Run without --dry-run to execute.")
    else:
        print("Done! Run a campaign sync to verify: python3 scripts/sync_local.py")


if __name__ == "__main__":
    main()
