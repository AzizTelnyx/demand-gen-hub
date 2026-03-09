#!/usr/bin/env python3
"""Create Google Sheet from keyword analysis JSON."""

import json, subprocess, csv, os, tempfile

with open("/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/keyword_analysis.json") as f:
    data = json.load(f)

# Helper to write CSV for gog
def write_csv(rows, headers, path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for r in rows:
            w.writerow(r)

tmpdir = tempfile.mkdtemp()

# Tab 1: Keyword Overlap by Region
tab1_rows = []
for o in data["overlap_rows"]:
    campaigns = o["campaigns"]
    c1 = campaigns[0] if len(campaigns) > 0 else ""
    c2 = campaigns[1] if len(campaigns) > 1 else ""
    c3 = ", ".join(campaigns[2:]) if len(campaigns) > 2 else ""
    tab1_rows.append([o["region"], o["keyword"], o["match_types"], c1, c2, c3, o["risk"]])
write_csv(tab1_rows, ["Region", "Keyword", "Match Type", "Campaign 1", "Campaign 2", "Campaign 3+", "Risk Level"], f"{tmpdir}/tab1.csv")

# Tab 2: Keyword Misalignment
tab2_rows = []
for m in data["misalignment_rows"]:
    tab2_rows.append([m["campaign"], m["ad_group"], m["keyword"], m["match_type"], m["issue"], m["suggested_action"]])
write_csv(tab2_rows, ["Campaign", "Ad Group", "Keyword", "Match Type", "Issue", "Suggested Action"], f"{tmpdir}/tab2.csv")

# Tab 3: Campaign Keyword Summary
tab3_rows = []
for s in data["campaign_summary"]:
    tab3_rows.append([s["campaign"], s["region"], s["total"], s.get("BROAD", 0), s.get("PHRASE", 0), s.get("EXACT", 0), "N/A", s["issues"]])
write_csv(tab3_rows, ["Campaign", "Region", "Total Keywords", "Broad", "Phrase", "Exact", "Avg CPC", "Issues Found"], f"{tmpdir}/tab3.csv")

# Tab 4: Vapi Campaign Deep Dive
tab4_rows = []
for v in data["vapi_rows"]:
    tab4_rows.append([v["campaign"], v["ad_group"], v["keyword"], v["match_type"], v["category"], v["recommendation"]])
write_csv(tab4_rows, ["Campaign", "Ad Group", "Keyword", "Match Type", "Category", "Recommendation"], f"{tmpdir}/tab4.csv")

print(f"CSVs written to {tmpdir}")
print(f"Tab 1: {len(tab1_rows)} rows")
print(f"Tab 2: {len(tab2_rows)} rows")
print(f"Tab 3: {len(tab3_rows)} rows")
print(f"Tab 4: {len(tab4_rows)} rows")

# Now use gog to create the sheet
# First create with tab 1
result = subprocess.run(
    ["gog", "sheets", "create", "--title", "Google Ads Keyword Audit — Overlaps & Misplacements (2026-03-04)", "--csv", f"{tmpdir}/tab1.csv"],
    capture_output=True, text=True
)
print("Create result:", result.stdout, result.stderr)

# Extract spreadsheet ID from output
import re
output = result.stdout + result.stderr
# Try to find spreadsheet ID
sid_match = re.search(r'spreadsheetId["\s:]+([a-zA-Z0-9_-]+)', output)
if not sid_match:
    sid_match = re.search(r'([a-zA-Z0-9_-]{30,})', output)
if sid_match:
    sid = sid_match.group(1)
    print(f"Spreadsheet ID: {sid}")
    
    # Rename first sheet
    subprocess.run(["gog", "sheets", "rename", sid, "0", "Keyword Overlap by Region"], capture_output=True, text=True)
    
    # Add remaining tabs
    for name, csv_path in [
        ("Keyword Misalignment", f"{tmpdir}/tab2.csv"),
        ("Campaign Keyword Summary", f"{tmpdir}/tab3.csv"),
        ("Vapi Campaign Deep Dive", f"{tmpdir}/tab4.csv"),
    ]:
        r = subprocess.run(["gog", "sheets", "add", sid, "--title", name, "--csv", csv_path], capture_output=True, text=True)
        print(f"Add {name}:", r.stdout[:100] if r.stdout else "", r.stderr[:100] if r.stderr else "")
    
    # Move to shared folder
    r = subprocess.run(["gog", "drive", "move", sid, "--parent", "1_hWXqiqMPMypDw7tNIhJ_qHXzCdtiTY0", "--force"], capture_output=True, text=True)
    print(f"Move result:", r.stdout, r.stderr)
    
    print(f"\nhttps://docs.google.com/spreadsheets/d/{sid}")
else:
    print("Could not extract spreadsheet ID!")
    print("Full output:", output)
