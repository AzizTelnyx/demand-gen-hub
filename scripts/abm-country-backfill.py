#!/usr/bin/env python3
"""
Backfill country (and missing Clearbit fields) for all ABMAccount rows.
Rate limited to ~6/sec (150ms between calls) to stay under 600/min.
"""
import psycopg2, urllib.request, json, time, sys

DB_URL = "postgresql://localhost:5432/dghub"
CLEARBIT_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"
BATCH_SIZE = 100

def enrich_batch(offset=0):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute('SELECT domain FROM "ABMAccount" WHERE country IS NULL ORDER BY id LIMIT %s OFFSET %s', (BATCH_SIZE, offset))
    domains = [r[0] for r in cur.fetchall()]
    if not domains:
        print(f"No more domains to enrich at offset {offset}")
        return 0
    
    updated = 0
    for i, domain in enumerate(domains):
        try:
            url = f'https://company.clearbit.com/v2/companies/find?domain={domain}'
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {CLEARBIT_KEY}'})
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read())
            
            country = data.get('geo', {}).get('country')
            desc = data.get('description')
            tags = data.get('tags', [])
            employees = data.get('metrics', {}).get('employees')
            industry = data.get('tags', [None])[0] if data.get('tags') else None
            
            if country:
                cur.execute('UPDATE "ABMAccount" SET country = %s WHERE domain = %s', (country, domain))
            if desc:
                cur.execute('UPDATE "ABMAccount" SET "clearbitDesc" = COALESCE("clearbitDesc", %s) WHERE domain = %s', (desc, domain))
            if employees:
                cur.execute('UPDATE "ABMAccount" SET "employeeCount" = COALESCE("employeeCount", %s) WHERE domain = %s', (employees, domain))
            if tags:
                cur.execute('UPDATE "ABMAccount" SET "clearbitTags" = COALESCE("clearbitTags", %s) WHERE domain = %s', (json.dumps(tags), domain))
            if industry:
                cur.execute('UPDATE "ABMAccount" SET industry = COALESCE(industry, %s) WHERE domain = %s', (industry, domain))
            
            updated += 1
        except urllib.error.HTTPError as e:
            if e.code == 404:
                pass  # Domain not found in Clearbit
            elif e.code == 202:
                pass  # Async pending
            else:
                print(f"HTTP {e.code} for {domain}")
        except Exception as e:
            print(f"Error for {domain}: {e}")
        
        time.sleep(0.15)
        if (i+1) % 20 == 0:
            print(f"  Processed {i+1}/{len(domains)}, updated {updated}")
    
    conn.commit()
    cur.close()
    conn.close()
    return updated

if __name__ == "__main__":
    offset = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    total_updated = 0
    while True:
        count = enrich_batch(offset)
        total_updated += count
        if count == 0:
            break
        offset += BATCH_SIZE
        print(f"Batch complete. Total updated: {total_updated}. Next offset: {offset}")
    print(f"Done! Total updated: {total_updated}")
