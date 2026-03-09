#!/usr/bin/env python3
"""Check ABM account domains for dead/unreachable domains."""

import json
import socket
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse
import re

# Try requests, fall back to urllib
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    import urllib.request
    import urllib.error
    import ssl

PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
DB = "dghub"
OUTPUT = "/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/abm-dead-domains.json"
MAX_WORKERS = 20
TIMEOUT = 5

PARKING_INDICATORS = [
    "domain for sale", "buy this domain", "parked", "godaddy parking",
    "sedoparking", "hugedomains", "dan.com", "afternic", "sedo.com",
    "this domain is for sale", "domain is parked", "parked domain",
    "purchase this domain", "make an offer", "domain may be for sale",
    "parkingcrew", "bodis.com", "above.com", "domainmarket",
    "squadhelp", "undeveloped.com", "is for sale", "domainlane"
]


def get_domains():
    result = subprocess.run(
        [PSQL, "-d", DB, "-t", "-A", "-F", "|",
         "-c", 'SELECT id, company, domain FROM "ABMAccount" WHERE domain IS NOT NULL'],
        capture_output=True, text=True
    )
    domains = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 3:
            domains.append({"id": parts[0], "company": parts[1], "domain": parts[2]})
    return domains


def check_domain(entry):
    domain = entry["domain"].strip()
    if not domain:
        return None

    # Skip domains that are clearly subpaths of major platforms
    skip_prefixes = ["github.com/", "huggingface.co/", "azure.microsoft.com",
                     "cloud.google.com", "aws.amazon.com", "ai.meta.com",
                     "cloud.baidu.com", "cloud.tencent.com", "ai.youdao.com",
                     "apple.com", "spotify.com", "ai4bharat.iitm.ac.in",
                     "alibabacloud.com", "audiolabs.fraunhofer.de",
                     "sap.com/", "filme.imyfone.com"]
    for prefix in skip_prefixes:
        if domain.startswith(prefix) or domain.startswith("www." + prefix):
            return None

    # Try HTTP request
    urls_to_try = [f"https://{domain}", f"http://{domain}"]
    last_error = None
    is_parked = False

    for url in urls_to_try:
        try:
            if HAS_REQUESTS:
                resp = requests.get(url, timeout=TIMEOUT, allow_redirects=True,
                                    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
                status = resp.status_code
                body = resp.text[:5000].lower() if resp.status_code == 200 else ""

                if status in (404, 410):
                    return {**entry, "reason": f"HTTP {status}"}
                if status >= 500:
                    return {**entry, "reason": f"HTTP {status} server error"}
                if status == 200:
                    for indicator in PARKING_INDICATORS:
                        if indicator in body:
                            return {**entry, "reason": f"Parked domain ('{indicator}' found)"}
                    return None  # Domain is alive
                if 200 <= status < 400:
                    return None  # Alive
                last_error = f"HTTP {status}"
            else:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                resp = urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx)
                body = resp.read(5000).decode("utf-8", errors="ignore").lower()
                for indicator in PARKING_INDICATORS:
                    if indicator in body:
                        return {**entry, "reason": f"Parked domain ('{indicator}' found)"}
                return None
        except requests.exceptions.SSLError if HAS_REQUESTS else Exception:
            try:
                if HAS_REQUESTS:
                    resp = requests.get(url, timeout=TIMEOUT, allow_redirects=True, verify=False,
                                        headers={"User-Agent": "Mozilla/5.0"})
                    if 200 <= resp.status_code < 400:
                        body = resp.text[:5000].lower() if resp.status_code == 200 else ""
                        for indicator in PARKING_INDICATORS:
                            if indicator in body:
                                return {**entry, "reason": f"Parked domain ('{indicator}' found)"}
                        return None
                    last_error = f"HTTP {resp.status_code}"
            except Exception as e:
                last_error = str(e)
        except requests.exceptions.ConnectionError if HAS_REQUESTS else ConnectionError as e:
            last_error = "Connection error"
        except requests.exceptions.Timeout if HAS_REQUESTS else TimeoutError:
            last_error = "Timeout"
        except Exception as e:
            last_error = str(e)

    # DNS check as fallback
    base_domain = domain.split("/")[0]
    try:
        socket.setdefaulttimeout(TIMEOUT)
        socket.getaddrinfo(base_domain, None)
        # DNS resolves but HTTP failed
        return {**entry, "reason": f"DNS resolves but HTTP failed: {last_error}"}
    except socket.gaierror:
        return {**entry, "reason": "DNS resolution failed"}
    except Exception:
        return {**entry, "reason": f"Connection failed: {last_error}"}


def main():
    print("Fetching domains from database...")
    domains = get_domains()
    print(f"Found {len(domains)} domains to check")

    dead_domains = []
    checked = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(check_domain, d): d for d in domains}
        for future in as_completed(futures):
            checked += 1
            if checked % 50 == 0:
                print(f"  Checked {checked}/{len(domains)}...")
            result = future.result()
            if result:
                dead_domains.append(result)

    # Save results
    dead_domains.sort(key=lambda x: x["company"])
    with open(OUTPUT, "w") as f:
        json.dump(dead_domains, f, indent=2)

    print(f"\n=== RESULTS ===")
    print(f"Total checked: {len(domains)}")
    print(f"Total dead: {len(dead_domains)}")

    # Breakdown by reason
    reasons = {}
    for d in dead_domains:
        r = d["reason"].split("(")[0].strip() if "(" in d["reason"] else d["reason"]
        # Simplify
        if "DNS" in d["reason"] and "failed" in d["reason"]:
            r = "DNS resolution failed"
        elif "Parked" in d["reason"]:
            r = "Parked domain"
        elif "Timeout" in d["reason"]:
            r = "Timeout"
        elif "Connection" in d["reason"]:
            r = "Connection error"
        elif d["reason"].startswith("HTTP"):
            r = d["reason"]
        else:
            r = d["reason"][:50]
        reasons[r] = reasons.get(r, 0) + 1

    print("\nBreakdown by reason:")
    for r, count in sorted(reasons.items(), key=lambda x: -x[1]):
        print(f"  {r}: {count}")

    print(f"\nDead domains list:")
    for d in dead_domains:
        print(f"  - {d['company']} ({d['domain']}): {d['reason']}")

    # Update database
    if dead_domains:
        ids = [d["id"] for d in dead_domains]
        # Check if status column exists
        check_col = subprocess.run(
            [PSQL, "-d", DB, "-t", "-A", "-c",
             "SELECT column_name FROM information_schema.columns WHERE table_name='ABMAccount' AND column_name='status'"],
            capture_output=True, text=True
        )
        if not check_col.stdout.strip():
            print("\nAdding 'status' column to ABMAccount...")
            subprocess.run(
                [PSQL, "-d", DB, "-c",
                 'ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS status TEXT'],
                capture_output=True, text=True
            )

        # Build UPDATE
        id_list = ", ".join(f"'{id}'" for id in ids)
        update_sql = f'UPDATE "ABMAccount" SET status = \'dead_domain\' WHERE id IN ({id_list})'
        result = subprocess.run(
            [PSQL, "-d", DB, "-c", update_sql],
            capture_output=True, text=True
        )
        print(f"\nDatabase updated: {result.stdout.strip()}")
        if result.stderr:
            print(f"DB errors: {result.stderr}")

    print(f"\nResults saved to {OUTPUT}")


if __name__ == "__main__":
    main()
