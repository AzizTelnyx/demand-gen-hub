#!/usr/bin/env python3
"""Sync Salesforce campaigns, opportunities, and accounts to local DB."""

import subprocess
import json
import psycopg2
from datetime import datetime, timezone
import re

DB_URL = "postgresql://azizalsinafi@localhost:5432/dghub"

def sf_query(soql):
    result = subprocess.run(
        ["sf", "data", "query", "--target-org", "telnyx-prod", "--query", soql, "--result-format", "json"],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        print(f"  SF query error: {result.stderr[:200]}")
        return []
    data = json.loads(result.stdout)
    return data.get("result", {}).get("records", [])

def clean_domain(raw):
    """Normalize a domain: strip protocol, www, trailing slash."""
    if not raw:
        return None
    d = raw.lower().strip()
    d = re.sub(r'^https?://', '', d)
    d = re.sub(r'^www\.', '', d)
    d = d.rstrip('/')
    d = d.split('/')[0]  # remove path
    return d if d else None

def sync():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    now = datetime.now(timezone.utc)

    # 1. Sync SF Campaigns
    print("Syncing Salesforce campaigns...")
    campaigns = sf_query("""
        SELECT Id, Name, Type, Status, NumberOfLeads, NumberOfContacts,
               NumberOfOpportunities, AmountAllOpportunities
        FROM Campaign WHERE NumberOfOpportunities > 0
        ORDER BY AmountAllOpportunities DESC NULLS LAST LIMIT 500
    """)
    
    sf_id_to_db_id = {}
    for c in campaigns:
        sf_id = c["Id"]
        cur.execute("""
            INSERT INTO "SFCampaign" (id, "sfId", name, type, status, "numberOfOpps", "totalAmount",
                "numberOfLeads", "numberOfContacts", "lastSyncedAt", "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT ("sfId") DO UPDATE SET
                name = EXCLUDED.name, type = EXCLUDED.type, status = EXCLUDED.status,
                "numberOfOpps" = EXCLUDED."numberOfOpps", "totalAmount" = EXCLUDED."totalAmount",
                "numberOfLeads" = EXCLUDED."numberOfLeads", "numberOfContacts" = EXCLUDED."numberOfContacts",
                "lastSyncedAt" = EXCLUDED."lastSyncedAt", "updatedAt" = EXCLUDED."updatedAt"
            RETURNING id
        """, (sf_id, c.get("Name", ""), c.get("Type"), c.get("Status"),
              c.get("NumberOfOpportunities", 0), c.get("AmountAllOpportunities") or 0,
              c.get("NumberOfLeads", 0), c.get("NumberOfContacts", 0),
              now, now, now))
        sf_id_to_db_id[sf_id] = cur.fetchone()[0]

    print(f"  Synced {len(sf_id_to_db_id)} SF campaigns")

    # 2. Sync Accounts (with domains for ad matching)
    print("Syncing accounts...")
    accounts = sf_query("""
        SELECT Id, Name, Website, cbit__ClearbitDomain__c, clean_website__c,
               Industry, Sub_Industry__c, NumberOfEmployees, AnnualRevenue,
               firmoScoreTierFormula__c, Sales_Segment__c, Type, ABM_Segmentation_List__c
        FROM Account
        WHERE Website != null OR cbit__ClearbitDomain__c != null
        ORDER BY AnnualRevenue DESC NULLS LAST
        LIMIT 5000
    """)

    acct_domain_map = {}  # sfId -> cleanDomain
    for a in accounts:
        sf_id = a["Id"]
        raw_domain = a.get("cbit__ClearbitDomain__c") or a.get("clean_website__c") or a.get("Website")
        domain = clean_domain(raw_domain)
        acct_domain_map[sf_id] = domain

        cur.execute("""
            INSERT INTO "SFAccount" (id, "sfId", name, domain, "cleanDomain", website, industry,
                "subIndustry", employees, "annualRevenue", "firmoTier", "salesSegment",
                "accountType", "abmSegment", "lastSyncedAt", "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT ("sfId") DO UPDATE SET
                name = EXCLUDED.name, domain = EXCLUDED.domain, "cleanDomain" = EXCLUDED."cleanDomain",
                website = EXCLUDED.website, industry = EXCLUDED.industry, "subIndustry" = EXCLUDED."subIndustry",
                employees = EXCLUDED.employees, "annualRevenue" = EXCLUDED."annualRevenue",
                "firmoTier" = EXCLUDED."firmoTier", "salesSegment" = EXCLUDED."salesSegment",
                "accountType" = EXCLUDED."accountType", "abmSegment" = EXCLUDED."abmSegment",
                "lastSyncedAt" = EXCLUDED."lastSyncedAt", "updatedAt" = EXCLUDED."updatedAt"
        """, (sf_id, a.get("Name", ""), raw_domain, domain, a.get("Website"),
              a.get("Industry"), a.get("Sub_Industry__c"),
              a.get("NumberOfEmployees"), a.get("AnnualRevenue"),
              a.get("firmoScoreTierFormula__c"), a.get("Sales_Segment__c"),
              a.get("Type"), a.get("ABM_Segmentation_List__c"),
              now, now, now))

    print(f"  Synced {len(accounts)} accounts")

    # 3. Sync Opportunities (with account info + attribution fields)
    print("Syncing opportunities...")
    opps = sf_query("""
        SELECT Id, Name, Amount, StageName, CloseDate, IsClosed, IsWon,
               LeadSource, CampaignId, CreatedDate, Type,
               Opportunity_Source__c, Opportunity_Source_Detail__c,
               Account.Id, Account.Name, Account.Website, Account.cbit__ClearbitDomain__c
        FROM Opportunity
        WHERE CreatedDate >= 2025-01-01T00:00:00Z AND Amount > 0
        ORDER BY Amount DESC LIMIT 5000
    """)

    opp_count = 0
    for o in opps:
        sf_id = o["Id"]
        campaign_db_id = sf_id_to_db_id.get(o.get("CampaignId")) if o.get("CampaignId") else None

        close_date = None
        if o.get("CloseDate"):
            try: close_date = datetime.strptime(o["CloseDate"], "%Y-%m-%d")
            except: pass

        created_date = None
        if o.get("CreatedDate"):
            try: created_date = datetime.fromisoformat(o["CreatedDate"].replace("+0000", "+00:00"))
            except: pass

        # Account domain
        acct = o.get("Account") or {}
        acct_sf_id = acct.get("Id")
        acct_name = acct.get("Name")
        acct_raw_domain = acct.get("cbit__ClearbitDomain__c") or acct.get("Website")
        acct_domain = clean_domain(acct_raw_domain)

        cur.execute("""
            INSERT INTO "SFOpportunity" (id, "sfId", name, amount, "stageName", "closeDate",
                "isClosed", "isWon", "leadSource", "oppSource", "oppSourceDetail", "oppType",
                "accountSfId", "accountName", "accountDomain",
                "campaignId", "createdDate", "lastSyncedAt", "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT ("sfId") DO UPDATE SET
                name = EXCLUDED.name, amount = EXCLUDED.amount, "stageName" = EXCLUDED."stageName",
                "closeDate" = EXCLUDED."closeDate", "isClosed" = EXCLUDED."isClosed",
                "isWon" = EXCLUDED."isWon", "leadSource" = EXCLUDED."leadSource",
                "oppSource" = EXCLUDED."oppSource", "oppSourceDetail" = EXCLUDED."oppSourceDetail",
                "oppType" = EXCLUDED."oppType", "accountSfId" = EXCLUDED."accountSfId",
                "accountName" = EXCLUDED."accountName", "accountDomain" = EXCLUDED."accountDomain",
                "campaignId" = EXCLUDED."campaignId", "createdDate" = EXCLUDED."createdDate",
                "lastSyncedAt" = EXCLUDED."lastSyncedAt", "updatedAt" = EXCLUDED."updatedAt"
        """, (sf_id, o.get("Name", ""), o.get("Amount") or 0, o.get("StageName", ""),
              close_date, o.get("IsClosed", False), o.get("IsWon", False),
              o.get("LeadSource"), o.get("Opportunity_Source__c"), o.get("Opportunity_Source_Detail__c"),
              o.get("Type"), acct_sf_id, acct_name, acct_domain,
              campaign_db_id, created_date, now, now, now))
        opp_count += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"  Synced {opp_count} opportunities")
    print("Done.")

if __name__ == "__main__":
    sync()
