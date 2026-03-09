#!/usr/bin/env python3
"""Check ABM account domains for dead/unreachable domains. V2 - fewer false positives."""

import json
import socket
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
DB = "dghub"
OUTPUT = "/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/abm-dead-domains.json"
MAX_WORKERS = 20
TIMEOUT = 8

PARKING_INDICATORS = [
    "domain for sale", "buy this domain", "parked free", "godaddy parking",
    "sedoparking", "hugedomains", "dan.com/buy-domain", "afternic.com",
    "this domain is for sale", "domain is parked", "parked domain",
    "purchase this domain", "parkingcrew", "bodis.com",
    "domainmarket", "undeveloped.com"
]

# Well-known domains that definitely aren't dead (bot protection causes false positives)
KNOWN_ALIVE = {
    "doordash.com", "zocdoc.com", "gusto.com", "openai.com", "vonage.com",
    "carta.com", "athenahealth.com", "amwell.com", "forhims.com", "carbonhealth.com",
    "dutchie.com", "ro.co", "klook.com", "meetcleo.com", "getjobber.com",
    "getyourguide.com", "omio.com", "lodgify.com", "transavia.com", "wizzair.com",
    "jet2holidays.com", "loveholidays.com", "logitravel.com", "headway.co",
    "policybazaar.com", "mitel.com", "orum.io", "play.ht", "play.ai",
    "eltropy.com", "interface.ai", "prodigaltech.com", "voices.com",
    "supernormal.com", "oneflow.com", "onsurity.com", "heal.com",
    "insurancedekho.com", "renewbuy.com", "vezeeta.com", "zingtree.com",
    "ada.cx", "air.ai", "amelia.ai", "x.ai", "exploretock.com",
    "rollerhq.com", "level.ai", "turno.com", "solmate.com", "apixio.com",
    "halohealth.com", "khealth.com", "lumahealth.com", "solvhealth.com",
    "evolenthealth.com", "nuvancehealth.com", "healthtap.com", "babylonhealth.com",
    "brighthealth.com", "breathelife.com", "yieldplanet.com", "cendyn.com",
    "enghouse interactive.com", "enghouseinteractive.com", "happyscribe.com",
    "ttsmaker.com", "hourone.ai", "primer.ai", "horizon.ai", "thoughtful.ai",
    "speechly.com", "phonexia.com", "vocapia.com",
}


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

    base_domain = domain.split("/")[0]

    # Skip major platform subpaths
    skip_prefixes = ["github.com/", "huggingface.co/", "azure.microsoft.com",
                     "cloud.google.com", "aws.amazon.com", "ai.meta.com",
                     "cloud.baidu.com", "cloud.tencent.com", "ai.youdao.com",
                     "apple.com", "spotify.com", "ai4bharat.iitm.ac.in",
                     "alibabacloud.com", "audiolabs.fraunhofer.de",
                     "sap.com/", "filme.imyfone.com", "deepmind.google"]
    for prefix in skip_prefixes:
        if domain.startswith(prefix):
            return None

    if base_domain in KNOWN_ALIVE:
        return None

    # Step 1: DNS check
    try:
        socket.setdefaulttimeout(TIMEOUT)
        socket.getaddrinfo(base_domain, None)
    except socket.gaierror:
        return {**entry, "reason": "DNS resolution failed"}
    except Exception:
        return {**entry, "reason": "DNS resolution failed"}

    # Step 2: HTTP check
    session = requests.Session()
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    for scheme in ["https", "http"]:
        url = f"{scheme}://{domain}"
        try:
            resp = session.get(url, timeout=TIMEOUT, allow_redirects=True, headers=headers, verify=(scheme == "https"))
            status = resp.status_code

            if status == 200:
                body = resp.text[:10000].lower()
                for indicator in PARKING_INDICATORS:
                    if indicator in body:
                        # Double check - must have MULTIPLE indicators or very specific ones
                        matches = [ind for ind in PARKING_INDICATORS if ind in body]
                        if len(matches) >= 1:
                            # Check it's not just a random mention
                            if any(x in body for x in ["sedoparking", "hugedomains", "parkingcrew", "bodis.com", "godaddy parking"]):
                                return {**entry, "reason": f"Parked domain ({matches[0]})"}
                            if sum(1 for x in ["domain for sale", "buy this domain", "this domain is for sale", "purchase this domain", "domain is parked", "parked domain"] if x in body) >= 2:
                                return {**entry, "reason": f"Parked domain ({', '.join(matches[:2])})"}
                            # Single "is for sale" on a minimal page
                            if len(body) < 3000 and any(x in body for x in ["domain for sale", "this domain is for sale", "buy this domain"]):
                                return {**entry, "reason": f"Parked domain ({matches[0]})"}
                return None  # Alive

            if status in (301, 302, 303, 307, 308):
                return None  # Redirect, probably alive

            if status in (403, 406, 429):
                return None  # Bot protection, probably alive

            if status in (404, 410):
                # Only flag if both schemes give 404
                try:
                    other = "http" if scheme == "https" else "https"
                    r2 = session.get(f"{other}://{domain}", timeout=TIMEOUT, headers=headers, verify=False)
                    if r2.status_code in (200, 301, 302, 303, 307, 308, 403):
                        return None
                except:
                    pass
                return {**entry, "reason": f"HTTP {status}"}

            if status >= 500:
                return {**entry, "reason": f"HTTP {status} server error"}

            return None  # Other status, probably alive

        except requests.exceptions.SSLError:
            # Try without SSL verification
            try:
                resp = session.get(url, timeout=TIMEOUT, allow_redirects=True, headers=headers, verify=False)
                if 200 <= resp.status_code < 500:
                    if resp.status_code == 200:
                        body = resp.text[:10000].lower()
                        for indicator in PARKING_INDICATORS:
                            if indicator in body and len(body) < 3000:
                                return {**entry, "reason": f"Parked domain ({indicator})"}
                    return None
            except:
                continue
        except requests.exceptions.ConnectionError:
            continue
        except requests.exceptions.Timeout:
            continue
        except Exception:
            continue

    # Both HTTP schemes failed but DNS resolved - could be bot protection
    # Use curl as secondary check
    try:
        r = subprocess.run(
            ["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "-L",
             "--max-time", "8", "--connect-timeout", "5",
             "-A", "Mozilla/5.0", f"https://{domain}"],
            capture_output=True, text=True, timeout=12
        )
        code = r.stdout.strip()
        if code and code != "000":
            return None  # curl got through, site is alive
    except:
        pass

    # If curl also fails, it might truly be down, but many legit sites block all automated access
    # Only flag if it's a lesser-known domain (not a well-known company)
    return None  # Skip "DNS resolves but HTTP failed" to avoid false positives


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
            if checked % 100 == 0:
                print(f"  Checked {checked}/{len(domains)}...")
            try:
                result = future.result()
                if result:
                    dead_domains.append(result)
            except Exception as e:
                pass

    # Deduplicate by domain
    seen = set()
    unique_dead = []
    for d in sorted(dead_domains, key=lambda x: x["company"]):
        key = d["domain"]
        if key not in seen:
            seen.add(key)
            unique_dead.append(d)
        else:
            # Keep track of duplicate entries (same domain, different company name)
            for existing in unique_dead:
                if existing["domain"] == key:
                    existing.setdefault("also_used_by", []).append({"id": d["id"], "company": d["company"]})

    dead_domains = unique_dead

    with open(OUTPUT, "w") as f:
        json.dump(dead_domains, f, indent=2)

    print(f"\n=== RESULTS ===")
    print(f"Total checked: {len(domains)}")
    print(f"Total dead: {len(dead_domains)}")

    reasons = {}
    for d in dead_domains:
        r = "DNS resolution failed" if "DNS" in d["reason"] else "Parked domain" if "Parked" in d["reason"] else d["reason"]
        reasons[r] = reasons.get(r, 0) + 1

    print("\nBreakdown by reason:")
    for r, count in sorted(reasons.items(), key=lambda x: -x[1]):
        print(f"  {r}: {count}")

    print(f"\nDead domains:")
    for d in dead_domains:
        extra = ""
        if "also_used_by" in d:
            extra = f" (also: {', '.join(x['company'] for x in d['also_used_by'])})"
        print(f"  - {d['company']} ({d['domain']}): {d['reason']}{extra}")

    # Collect ALL IDs to update (including duplicates)
    all_ids = [d["id"] for d in dead_domains]
    for d in dead_domains:
        if "also_used_by" in d:
            all_ids.extend(x["id"] for x in d["also_used_by"])

    if all_ids:
        id_list = ", ".join(f"'{id}'" for id in all_ids)
        update_sql = f"UPDATE \"ABMAccount\" SET status = 'dead_domain' WHERE id IN ({id_list})"
        result = subprocess.run([PSQL, "-d", DB, "-c", update_sql], capture_output=True, text=True)
        print(f"\nDatabase updated: {result.stdout.strip()}")

    print(f"\nResults saved to {OUTPUT}")


if __name__ == "__main__":
    main()
