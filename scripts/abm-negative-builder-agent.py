#!/usr/bin/env python3
"""
ABM Negative Builder Agent
============================
Monthly builder of exclusion lists from irrelevant-domain patterns.

Scans all ABM accounts and identifies domains that should be excluded from
specific products (categoryd exclusions) or globally.

Exclusion sources:
1. Irrelevance patterns — domains consistently scoring low across multiple campaigns
2. Competitor domains — auto-excluded (seeded from knowledge base)
3. Spam/junk domains — obviously non-B2B (personal email domains, parked sites)
4. Mismatched vertical — e.g., a restaurant domain in an enterprise SaaS segment

Exclusion categorys:
- `*` — global (exclude from all campaigns)
- `AI Agent` — product-categoryd (exclude from AI Agent campaigns only)
- `AI Agent/Healthcare` — variant-categoryd (exclude from specific variant only)

Output: Upserts to ABMExclusion table + posts summary to Telegram

Run: python3 scripts/abm-negative-builder-agent.py [--dry-run]
Cron: Monthly 1st Sunday 6 AM PST
"""

import json
import os
import sys
import argparse
import psycopg2
from datetime import datetime, timezone
from collections import defaultdict

AGENT_SLUG = "abm-negative-builder"
AGENT_NAME = "ABM Negative Builder Agent"

DB_URL = "postgresql://localhost:5432/dghub"
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/abm-negative-builder")
os.makedirs(LOG_DIR, exist_ok=True)

LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
LITELLM_MODEL = "gpt-4.1-mini"

# Domains that are obviously not B2B targets
JUNK_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
    "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
    "qq.com", "163.com", "126.com", "sina.com", "sohu.com",
    "googlemail.com", "gmx.de", "web.de", "t-online.de",
    "example.com", "test.com", "localhost", "",
}

# Patterns that indicate junk/personal domains
JUNK_PATTERNS = [
    ".wordpress.com", ".blogspot.", ".wixsite.", ".weebly.",
    ".github.io", ".netlify.app", ".herokuapp.com",
    "tempmail", "guerrillamail", "mailinator",
]

# Product keywords for relevance checking (same as pruner)
PRODUCT_KEYWORDS = {
    "AI Agent": ["ai agent", "ai voice", "voice ai", "conversational ai", "llm", "chatbot",
                 "voicebot", "virtual agent", "autonomous agent"],
    "Voice API": ["voice api", "voip", "sip", "pbx", "call routing", "ivr", "telephony", "cpaas"],
    "SMS": ["sms api", "messaging", "text messaging", "a2p", "messaging api"],
    "SIP": ["sip trunk", "sip trunking", "voip gateway", "pbx", "unified communications"],
    "IoT SIM": ["iot sim", "iot connectivity", "cellular iot", "m2m", "esim"],
}


def get_db():
    """Get database connection."""
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    return conn


def log(msg, level="INFO"):
    """Log to both console and file."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{ts}] [{level}] {msg}"
    print(line)
    log_file = os.path.join(LOG_DIR, f"neg-builder-{datetime.now().strftime('%Y%m%d')}.log")
    with open(log_file, "a") as f:
        f.write(line + "\n")


def is_junk_domain(domain):
    """Check if a domain is obviously not a B2B target."""
    if not domain:
        return True
    domain_lower = domain.lower().strip()
    
    # Exact match
    if domain_lower in JUNK_DOMAINS:
        return True
    
    # Pattern match
    for pattern in JUNK_PATTERNS:
        if pattern in domain_lower:
            return True
    
    # Single-level domains (no dot or just TLD)
    if "." not in domain_lower or domain_lower.count(".") < 1:
        return True
    
    return False


def compute_relevance_for_product(account, product):
    """Quick relevance check for a specific product. Returns 0-1."""
    desc = (account.get("clearbitDesc") or "").lower()
    tags = account.get("clearbitTags") or ""
    industry = (account.get("industry") or "").lower()
    
    if not desc and not tags and not industry:
        return 0.5  # No data — can't judge
    
    score = 0.0
    kw = PRODUCT_KEYWORDS.get(product, [])
    
    if desc and kw:
        matches = sum(1 for k in kw if k in desc)
        if matches > 0:
            score += 0.5 * min(matches / 2.0, 1.0)
    
    # B2B SaaS/tech signal
    b2b_terms = ["software", "platform", "saas", "cloud", "api", "enterprise",
                 "b2b", "technology", "infrastructure"]
    if desc:
        if any(t in desc for t in b2b_terms):
            score += 0.2
    
    # Industry signal
    if industry:
        tech_industries = ["software", "technology", "information", "telecommunications"]
        if any(t in industry for t in tech_industries):
            score += 0.3
    
    return min(score, 1.0)


def run_negative_builder(dry_run=False):
    """Main negative builder execution."""
    log(f"=== ABM Negative Builder starting (dry_run={dry_run}) ===")
    
    conn = get_db()
    cur = conn.cursor()
    
    results = {
        "junk_domains_found": 0,
        "irrelevant_global": 0,
        "irrelevant_product_categoryd": 0,
        "already_excluded": 0,
        "new_exclusions_added": 0,
        "exclusions_by_category": defaultdict(int),
        "exclusion_details": [],
    }
    
    # 1. Get all existing exclusions
    cur.execute('SELECT domain, category FROM "ABMExclusion"')
    existing = {(row[0], row[1]) for row in cur.fetchall()}
    log(f"Existing exclusions: {len(existing)}")
    
    # 2. Find and flag junk domains
    cur.execute('SELECT id, domain, company FROM "ABMAccount"')
    all_accounts = cur.fetchall()
    log(f"Total accounts to scan: {len(all_accounts)}")
    
    junk_to_exclude = []
    for acct_id, domain, company in all_accounts:
        if is_junk_domain(domain):
            junk_to_exclude.append((domain, "*", "junk_domain"))
            results["junk_domains_found"] += 1
    
    if junk_to_exclude:
        log(f"Found {len(junk_to_exclude)} junk domains to exclude globally")
    
    # 3. Find irrelevant domains per product
    # Get all accounts with enrichment data
    cur.execute("""
        SELECT id, domain, company, "clearbitDesc", "clearbitTags", 
               "clearbitTech", industry, "employeeCount"
        FROM "ABMAccount"
        WHERE domain IS NOT NULL
    """)
    enriched_accounts = cur.fetchall()
    log(f"Accounts with data: {len(enriched_accounts)}")
    
    # Get all products from segments
    cur.execute('SELECT DISTINCT "parsedProduct" FROM "ABMCampaignSegment" WHERE "parsedProduct" IS NOT NULL')
    products = [row[0] for row in cur.fetchall()]
    log(f"Products found: {products}")
    
    irrelevant_by_product = defaultdict(list)
    
    for acct in enriched_accounts:
        acct_id, domain, company, desc, tags, tech, industry, emp_count = acct
        account_data = {
            "clearbitDesc": desc,
            "clearbitTags": tags,
            "clearbitTech": tech,
            "industry": industry,
            "employeeCount": emp_count,
        }
        
        for product in products:
            relevance = compute_relevance_for_product(account_data, product)
            
            if relevance < 0.15:
                # Very low relevance — exclude from this product's campaigns
                irrelevant_by_product[product].append({
                    "domain": domain,
                    "company": company,
                    "relevance": round(relevance, 3),
                    "reason": f"Very low relevance ({relevance:.2f}) to {product}",
                })
    
    # 4. Build exclusion list
    new_exclusions = []
    
    # Junk domains → global exclusion
    for domain, category, reason in junk_to_exclude:
        key = (domain, category)
        if key not in existing:
            new_exclusions.append({
                "domain": domain,
                "category": category,
                "reason": reason,
                "source": "negative_builder",
            })
    
    # Irrelevant by product → product-categoryd exclusion
    for product, accounts in irrelevant_by_product.items():
        log(f"Product '{product}': {len(accounts)} irrelevant domains")
        for acct in accounts:
            category = product
            key = (acct["domain"], category)
            if key not in existing:
                new_exclusions.append({
                    "domain": acct["domain"],
                    "category": category,
                    "reason": acct["reason"],
                    "source": "negative_builder",
                })
            else:
                results["already_excluded"] += 1
    
    # Deduplicate new exclusions (same domain+category)
    seen = set()
    deduped = []
    for exc in new_exclusions:
        key = (exc["domain"], exc["category"])
        if key not in seen and key not in existing:
            seen.add(key)
            deduped.append(exc)
    
    log(f"New exclusions to add: {len(deduped)} (after dedup)")
    
    # 5. Execute or preview
    if dry_run:
        log("DRY RUN — no changes made")
        for exc in deduped[:50]:
            log(f"  Would exclude: {exc['domain']} (category={exc['category']}, reason={exc['reason']})")
        if len(deduped) > 50:
            log(f"  ... and {len(deduped) - 50} more")
    else:
        for exc in deduped:
            try:
                cur.execute(
                    '''INSERT INTO "ABMExclusion" (domain, category, reason, "notes", "addedAt")
                       VALUES (%s, %s, %s, %s, NOW())
                       ON CONFLICT DO NOTHING''',
                    (exc["domain"], exc["category"], exc["reason"], exc["source"])
                )
                results["new_exclusions_added"] += 1
                results["exclusions_by_category"][exc["category"]] += 1
            except Exception as e:
                log(f"Failed to add exclusion {exc['domain']}: {e}", "WARN")
        
        log(f"Added {results['new_exclusions_added']} new exclusions")
    
    # 6. Summary
    results["junk_domains_found"] = len(junk_to_exclude)
    results["irrelevant_product_categoryd"] = sum(len(v) for v in irrelevant_by_product.values())
    results["exclusion_details"] = deduped[:20]  # First 20 for summary
    
    log(f"\n=== Negative Builder Summary ===")
    log(f"Junk domains: {results['junk_domains_found']}")
    log(f"Product-categoryd irrelevant: {results['irrelevant_product_categoryd']}")
    log(f"Already excluded: {results['already_excluded']}")
    log(f"New exclusions: {results['new_exclusions_added']}")
    for category, count in sorted(results["exclusions_by_category"].items()):
        log(f"  {category}: {count}")
    
    # Log to AgentRun
    log_agent_run(results, dry_run)
    
    # Post summary to Telegram
    post_summary_to_telegram(results)
    
    cur.close()
    conn.close()
    
    return results


def log_agent_run(results, dry_run):
    """Log the run to AgentRun table."""
    try:
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute('SELECT id FROM "Agent" WHERE slug = %s', (AGENT_SLUG,))
        agent_row = cur.fetchone()
        if not agent_row:
            cur.execute(
                'INSERT INTO "Agent" (id, slug, name, "createdAt") VALUES (%s, %s, %s, NOW())',
                (AGENT_SLUG, AGENT_SLUG, AGENT_NAME)
            )
        
        import uuid
        cur.execute(
            '''INSERT INTO "AgentRun" (id, "agentId", status, "startedAt", "completedAt", metadata)
               VALUES (%s, %s, %s, NOW(), NOW(), %s)''',
            (str(uuid.uuid4()), AGENT_SLUG, "done" if not dry_run else "dry_run",
             json.dumps({"dry_run": dry_run, "new_exclusions": results["new_exclusions_added"],
                         "junk_found": results["junk_domains_found"]}))
        )
        
        cur.close()
        conn.close()
    except Exception as e:
        log(f"Failed to log agent run: {e}", "WARN")


def post_summary_to_telegram(results):
    """Post exclusion summary to Telegram."""
    try:
        import urllib.request
        
        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo")
        chat_id = "-1003786506284"
        thread_id = 164
        
        lines = [
            f"🚫 **ABM Negative Builder Report**",
            f"Junk domains: {results['junk_domains_found']}",
            f"Product-categoryd irrelevant: {results['irrelevant_product_categoryd']}",
            f"New exclusions added: {results['new_exclusions_added']}",
        ]
        
        for category, count in sorted(results["exclusions_by_category"].items()):
            lines.append(f"  • {category}: {count}")
        
        if results["exclusion_details"]:
            lines.append("\nTop exclusions:")
            for exc in results["exclusion_details"][:10]:
                lines.append(f"  • `{exc['domain']}` ({exc['category']}) — {exc['reason']}")
        
        msg = "\n".join(lines)[:4000]
        
        data = json.dumps({
            "chat_id": chat_id,
            "message_thread_id": thread_id,
            "text": msg,
            "parse_mode": "Markdown",
        }).encode()
        
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=10)
        log("Posted summary to Telegram")
    except Exception as e:
        log(f"Failed to post to Telegram: {e}", "WARN")


def main():
    parser = argparse.ArgumentParser(description="ABM Negative Builder Agent")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    args = parser.parse_args()
    
    run_negative_builder(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
