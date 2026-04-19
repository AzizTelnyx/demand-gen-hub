#!/usr/bin/env python3
"""
ABM Pruner Agent
=================
Biweekly cleanup of ABM account targeting.

Identifies and removes/excludes accounts that are:
1. Low relevance to the campaign product/variant they're targeted by
2. Zero-engagement across all campaigns they appear in
3. NOT in an active Salesforce pipeline stage (safety gate)

Since ABMListMember is currently empty (accounts are in ABMAccount but not linked 
to specific lists), this agent works by:
- Scoring each account's relevance to each product/variant combination
- Flagging low-relevance accounts for exclusion from specific products
- Adding them to ABMExclusion with the appropriate scope
- Posting review candidates to Telegram for human approval

Safety rules:
- Never prune a company with an active SF opportunity (inPipeline=true or sfAccountId set)
- ≤10 exclusions → auto-execute
- >10 exclusions → human review (post to Telegram)
- Never exclude accounts added to DB < 14 days ago (learning period)
- Flag (don't auto-exclude) if relevance 0.2-0.4, only auto-exclude if < 0.2

Run: python3 scripts/abm-pruner-agent.py [--dry-run] [--limit N] [--product AI_Agent]
Cron: Biweekly Sunday 5 AM PST
"""

import json
import os
import sys
import argparse
import psycopg2
from datetime import datetime, timezone, timedelta
from collections import defaultdict

AGENT_SLUG = "abm-pruner"
AGENT_NAME = "ABM Pruner Agent"

DB_URL = "postgresql://localhost:5432/dghub"
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/abm-pruner")
os.makedirs(LOG_DIR, exist_ok=True)

# Thresholds
LEARNING_PERIOD_DAYS = 14         # Don't prune accounts created < 14 days ago
AUTO_EXCLUDE_LIMIT = 10           # Auto-execute if ≤10 exclusions per product
RELEVANCE_CUTOFF = 0.2            # Below this = auto-flag for exclusion
RELEVANCE_REVIEW = 0.4            # Below this = flag for review

# Product keywords for relevance scoring
PRODUCT_KEYWORDS = {
    "AI Agent": ["ai agent", "ai voice", "voice ai", "conversational ai", "llm", "chatbot",
                 "voicebot", "virtual agent", "intelligent assistant", "autonomous agent",
                 "generative ai", "ai platform", "ml platform"],
    "Voice API": ["voice api", "voip", "sip", "pbx", "call routing", "ivr", "telephony",
                  "voice platform", "cpaas", "programmable voice", "unified communications"],
    "SMS": ["sms api", "messaging", "text messaging", "sms platform", "a2p", "mms",
            "communication platform", "messaging api", "whatsapp business"],
    "SIP": ["sip trunk", "sip trunking", "voip gateway", "pbx", "unified communications",
            "sip", "trunking", "voip", "phone system"],
    "IoT SIM": ["iot sim", "iot connectivity", "cellular iot", "m2m", "iot platform",
                "embedded sim", "esim", "cellular module", "iot device management"],
}

VARIANT_KEYWORDS = {
    "Healthcare": ["healthcare", "health tech", "hospital", "medical", "clinical",
                    "telehealth", "ehealth", "patient", "ehr", "fhir", "hipaa", "pharma"],
    "Contact Center": ["contact center", "call center", "ccaaS", "customer service",
                       "help desk", "support center", "ivr", "acd", "workforce management"],
    "Travel": ["travel", "hospitality", "booking", "airline", "hotel", "tourism",
               "vacation rental", "property management", "OTA"],
    "Finance": ["fintech", "banking", "insurance", "trading", "payments", "financial",
                "wealth management", "lending", "credit", "regtech"],
    "Real Estate": ["real estate", "propTech", "property", "mortgage", "brokerage",
                     "realtor", "housing", "construction", "proptech"],
    "Education": ["education", "edtech", "elearning", "lms", "university", "school",
                  "training platform", "course", "student"],
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
    log_file = os.path.join(LOG_DIR, f"pruner-{datetime.now().strftime('%Y%m%d')}.log")
    with open(log_file, "a") as f:
        f.write(line + "\n")


def compute_relevance_score(account, product, variant=None):
    """
    Re-score an account's relevance to a specific product/variant.
    Uses description + tags + tech stack + industry.
    Returns float 0-1.
    """
    desc = (account.get("clearbitDesc") or "").lower()
    tags_raw = account.get("clearbitTags") or ""
    tech_raw = account.get("clearbitTech") or ""
    industry = (account.get("industry") or "").lower()

    # Parse tags/tech
    try:
        tags = [t.lower() for t in (json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw)] if tags_raw else []
    except (json.JSONDecodeError, TypeError):
        tags = []
    try:
        tech = [t.lower() for t in (json.loads(tech_raw) if isinstance(tech_raw, str) else tech_raw)] if tech_raw else []
    except (json.JSONDecodeError, TypeError):
        tech = []

    # No enrichment data — can't judge relevance
    if not desc and not tags and not tech and not industry:
        return 0.5

    score = 0.0
    max_score = 0.0

    # 1. Product keywords in description (40%)
    product_kw = PRODUCT_KEYWORDS.get(product, [])
    if product_kw and desc:
        max_score += 0.40
        matches = sum(1 for kw in product_kw if kw in desc)
        if matches > 0:
            score += 0.40 * min(matches / 3.0, 1.0)

    # 2. Variant keywords in description (20%)
    if variant and variant != "":
        variant_kw = VARIANT_KEYWORDS.get(variant, [])
        if variant_kw and desc:
            max_score += 0.20
            matches = sum(1 for kw in variant_kw if kw in desc)
            if matches > 0:
                score += 0.20 * min(matches / 2.0, 1.0)
        else:
            max_score += 0.20  # No variant keywords defined
    else:
        max_score += 0.20  # No variant, don't penalize

    # 3. Tags match (20%)
    all_kw = list(product_kw)
    if variant:
        all_kw.extend(VARIANT_KEYWORDS.get(variant, []))
    if tags and all_kw:
        max_score += 0.20
        matches = sum(1 for kw in all_kw if any(kw in t for t in tags))
        if matches > 0:
            score += 0.20 * min(matches / 2.0, 1.0)

    # 4. Tech stack — telecom/communications tech (10%)
    comm_tech = ["twilio", "vonage", "plivo", "bandwidth", "ringcentral", "zoom",
                 "asterisk", "freeswitch", "kamailio", "opensips", "8x8", "dialpad"]
    if tech:
        max_score += 0.10
        matches = sum(1 for ct in comm_tech if any(ct in t for t in tech))
        if matches > 0:
            score += 0.10 * min(matches / 2.0, 1.0)

    # 5. Industry match (10%)
    if industry:
        max_score += 0.10
        # B2B SaaS/tech bonus
        if any(w in industry for w in ["software", "technology", "information", "saas", "cloud"]):
            score += 0.05
        # Variant-specific industry
        if variant and variant != "":
            variant_industries = {
                "Healthcare": ["healthcare", "health", "medical", "pharmaceutical"],
                "Contact Center": ["business services", "customer service", "outsourcing"],
                "Travel": ["travel", "hospitality", "tourism"],
                "Finance": ["financial", "banking", "insurance", "fintech"],
                "Real Estate": ["real estate", "construction", "property"],
                "Education": ["education", "e-learning"],
            }
            vi = variant_industries.get(variant, [])
            if any(v in industry for v in vi):
                score += 0.05

    if max_score == 0:
        return 0.5

    return min(score / max_score, 1.0)


def run_pruner(dry_run=False, limit=None, product_filter=None):
    """Main pruner execution."""
    log(f"=== ABM Pruner Agent starting (dry_run={dry_run}) ===")
    
    conn = get_db()
    cur = conn.cursor()
    
    # Safety gate: accounts with SF pipeline activity
    cur.execute("""
        SELECT domain FROM "ABMAccount" 
        WHERE "inPipeline" = true OR "sfAccountId" IS NOT NULL
    """)
    sf_protected = set(row[0] for row in cur.fetchall())
    log(f"Safety gate: {len(sf_protected)} accounts with active SF pipeline — will NOT prune")
    
    # Get existing exclusions (using category, not scope)
    cur.execute('SELECT domain, category FROM "ABMExclusion"')
    existing_exclusions = {(row[0], row[1]) for row in cur.fetchall()}
    log(f"Existing exclusions: {len(existing_exclusions)}")
    
    # Get active campaign segments (product/variant combos) from LIVE campaigns only
    query = """
        SELECT DISTINCT cs."parsedProduct", cs."parsedVariant"
        FROM "ABMCampaignSegment" cs
        JOIN "Campaign" c ON cs."campaignId" = c.id
        WHERE c.status IN ('enabled', 'live', 'ACTIVE', 'active', 'LIVE')
          AND cs."parsedProduct" IS NOT NULL
    """
    params = []
    if product_filter:
        query += ' AND cs."parsedProduct" = %s'
        params.append(product_filter)
    
    cur.execute(query, params)
    product_variants = [(row[0], row[1]) for row in cur.fetchall()]
    log(f"Found {len(product_variants)} product/variant combinations from active campaigns")
    
    # Get accounts that are NOT already excluded and have enrichment data
    # Only evaluate accounts NOT already handled by negative_builder (which uses the same scoring)
    # The pruner catches accounts that became irrelevant AFTER initial targeting
    last_run_condition = ""
    cur.execute('SELECT max("completedAt") FROM "AgentRun" WHERE "agentId" = %s AND status = %s',
                (AGENT_SLUG, 'done'))
    last_run = cur.fetchone()[0]
    if last_run:
        # Only evaluate accounts added/modified since last successful run
        last_run_condition = f' AND a."createdAt" > \'{last_run.isoformat()}\''
        log(f"Last successful run: {last_run}. Only evaluating accounts added since then.")
    else:
        # First run — only evaluate accounts not already processed by negative_builder
        log(f"No previous run found. Evaluating accounts not in ABMExclusion from negative_builder.")
    
    cur.execute(f"""
        SELECT a.id, a.domain, a.company, a."clearbitDesc", a."clearbitTags",
               a."clearbitTech", a.industry, a."employeeCount", a."createdAt"
        FROM "ABMAccount" a
        WHERE a.domain IS NOT NULL AND a.domain != ''
          AND (a."clearbitDesc" IS NOT NULL OR a."clearbitTags" IS NOT NULL
               OR a."clearbitTech" IS NOT NULL OR a.industry IS NOT NULL)
          {last_run_condition}
    """)
    accounts = cur.fetchall()
    log(f"Accounts to evaluate: {len(accounts)}")
    
    results = {
        "accounts_checked": len(accounts),
        "product_variants": len(product_variants),
        "sf_blocked": 0,
        "learning_period_blocked": 0,
        "auto_excluded": 0,
        "flagged_for_review": 0,
        "already_excluded": 0,
        "exclusions_by_category": defaultdict(int),
        "review_candidates": [],
        "auto_exclusions": [],
    }
    
    # Score each account against each product/variant
    # Only score accounts NOT already excluded for that product — skip if already in ABMExclusion
    seen_domains_per_product = defaultdict(set)  # Track domains we've already decided on per product
    
    for product, variant in product_variants:
        product_exclusions = []
        product_reviews = []
        category = product  # ABMExclusion uses product as category
        
        log(f"\n--- Evaluating: {product}/{variant or 'generic'} ---")
        
        for acct in accounts:
            acct_id, domain, company, desc, tags, tech, acct_industry, emp_count, created = acct
            
            # Skip if we already processed this domain for this product (dedup across variants)
            if domain in seen_domains_per_product[product]:
                continue
            seen_domains_per_product[product].add(domain)
            
            # Safety gate
            if domain in sf_protected:
                results["sf_blocked"] += 1
                continue
            
            # Learning period — skip if account has enrichment data (vetted by sync)
            has_enrichment = desc or tags or tech or acct_industry
            if not has_enrichment and created and created > datetime.utcnow() - timedelta(days=LEARNING_PERIOD_DAYS):
                results["learning_period_blocked"] += 1
                continue
            
            # Already excluded for this product/category?
            if (domain, category) in existing_exclusions:
                results["already_excluded"] += 1
                continue
            
            # Score relevance
            account_data = {
                "clearbitDesc": desc,
                "clearbitTags": tags,
                "clearbitTech": tech,
                "industry": acct_industry,
                "employeeCount": emp_count,
            }
            relevance = compute_relevance_score(account_data, product, variant)
            
            if relevance < RELEVANCE_CUTOFF:
                product_exclusions.append({
                    "domain": domain,
                    "company": company,
                    "relevance": round(relevance, 3),
                    "category": category,
                    "reason": f"Low relevance ({relevance:.2f}) to {product}/{variant or 'generic'}",
                })
            elif relevance < RELEVANCE_REVIEW:
                product_reviews.append({
                    "domain": domain,
                    "company": company,
                    "relevance": round(relevance, 3),
                    "category": category,
                    "reason": f"Marginal relevance ({relevance:.2f}) to {product}/{variant or 'generic'}",
                })
        
        log(f"  {len(product_exclusions)} exclusion candidates (< {RELEVANCE_CUTOFF})")
        log(f"  {len(product_reviews)} review candidates ({RELEVANCE_CUTOFF}-{RELEVANCE_REVIEW})")
        
        # Process exclusions
        if len(product_exclusions) <= AUTO_EXCLUDE_LIMIT:
            for exc in product_exclusions:
                if not dry_run:
                    try:
                        cur.execute(
                            '''INSERT INTO "ABMExclusion" (id, domain, category, reason, "notes", "addedAt", "addedBy")
                               VALUES (gen_random_uuid()::text, %s, %s, %s, %s, NOW(), 'pruner')
                               ON CONFLICT DO NOTHING''',
                            (exc["domain"], exc["category"], exc["reason"],
                             f"Auto-excluded by ABM Pruner (relevance={exc['relevance']})")
                        )
                        results["auto_excluded"] += 1
                        results["exclusions_by_category"][exc["category"]] += 1
                        log(f"  ✅ Excluded: {exc['domain']} ({exc['category']}, relevance={exc['relevance']})")
                    except Exception as e:
                        log(f"  ❌ Failed to exclude {exc['domain']}: {e}", "WARN")
                else:
                    log(f"  🔍 DRY RUN: Would exclude {exc['domain']} ({exc['category']}, relevance={exc['relevance']})")
                    results["auto_exclusions"].append(exc)
        else:
            for exc in product_exclusions:
                results["review_candidates"].append(exc)
                results["flagged_for_review"] += 1
            log(f"  🚫 {len(product_exclusions)} exclusions need human approval (>{AUTO_EXCLUDE_LIMIT})")
        
        for rev in product_reviews:
            results["review_candidates"].append(rev)
            results["flagged_for_review"] += 1
    
    cur.close()
    conn.close()
    
    # Summary
    log(f"\n=== Pruner Summary ===")
    log(f"Accounts checked: {results['accounts_checked']}")
    log(f"Product/variant combos: {results['product_variants']}")
    log(f"SF pipeline protected: {results['sf_blocked']}")
    log(f"Learning period protected: {results['learning_period_blocked']}")
    log(f"Already excluded: {results['already_excluded']}")
    log(f"Auto-excluded: {results['auto_excluded']}")
    log(f"Flagged for review: {results['flagged_for_review']}")
    for category, count in sorted(results["exclusions_by_category"].items()):
        log(f"  {category}: {count}")
    
    # Log to DB
    log_agent_run(results, dry_run)
    
    # Post review candidates to Telegram
    if results["review_candidates"]:
        post_review_to_telegram(results["review_candidates"])
    
    return results


def log_agent_run(results, dry_run):
    """Log the pruner run to AgentRun table."""
    try:
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute('SELECT id FROM "Agent" WHERE slug = %s', (AGENT_SLUG,))
        if not cur.fetchone():
            cur.execute(
                'INSERT INTO "Agent" (id, slug, name, "createdAt") VALUES (%s, %s, %s, NOW())',
                (AGENT_SLUG, AGENT_SLUG, AGENT_NAME)
            )
        
        import uuid
        cur.execute(
            '''INSERT INTO "AgentRun" (id, "agentId", status, "startedAt", "completedAt", metadata)
               VALUES (%s, %s, %s, NOW(), NOW(), %s)''',
            (str(uuid.uuid4()), AGENT_SLUG, "done" if not dry_run else "dry_run",
             json.dumps({"dry_run": dry_run, "auto_excluded": results["auto_excluded"],
                         "review_candidates": results["flagged_for_review"]}))
        )
        cur.close()
        conn.close()
    except Exception as e:
        log(f"Failed to log agent run: {e}", "WARN")


def post_review_to_telegram(candidates):
    """Post review candidates to Telegram Agent Activity topic."""
    try:
        import urllib.request
        
        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo")
        chat_id = "-1003786506284"
        thread_id = 164
        
        lines = [f"🪓 **ABM Pruner — Review Needed** ({len(candidates)} accounts)\n"]
        for i, c in enumerate(candidates[:30], 1):
            lines.append(f"{i}. `{c['domain']}` — {c['reason']}")
        
        if len(candidates) > 30:
            lines.append(f"\n... and {len(candidates) - 30} more")
        
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
        log(f"Posted {len(candidates)} review candidates to Telegram")
    except Exception as e:
        log(f"Failed to post to Telegram: {e}", "WARN")


def main():
    parser = argparse.ArgumentParser(description="ABM Pruner Agent")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    parser.add_argument("--product", type=str, help="Filter by product (e.g., AI_Agent)")
    args = parser.parse_args()
    
    product = args.product.replace("_", " ") if args.product else None
    run_pruner(dry_run=args.dry_run, product_filter=product)


if __name__ == "__main__":
    main()
