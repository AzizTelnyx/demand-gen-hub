#!/usr/bin/env python3
"""Populate the Google Sheet with keyword audit data."""

import json, subprocess, sys

SID = "1kC_7xkob_xj-hZ9vjqjU0_PyKvCBtRdjlmIvLm7nzjk"

with open("/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/keyword_analysis.json") as f:
    data = json.load(f)

def escape_cell(v):
    """Escape pipe chars in cell values."""
    return str(v).replace("|", "/").replace("\n", " ")

def append_rows(sheet_name, headers, rows, batch_size=50):
    """Append rows to a sheet in batches."""
    # First add headers
    header_str = "|".join(escape_cell(h) for h in headers)
    r = subprocess.run(["gog", "sheets", "append", SID, f"{sheet_name}!A1", header_str], 
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  Header error: {r.stderr[:200]}")
        return
    
    # Then add data in batches
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        # Each row is comma-separated (rows), each cell pipe-separated
        values = []
        for row in batch:
            values.append("|".join(escape_cell(c) for c in row))
        
        r = subprocess.run(
            ["gog", "sheets", "append", SID, f"{sheet_name}!A1"] + values,
            capture_output=True, text=True
        )
        total += len(batch)
        if r.returncode != 0:
            print(f"  Batch error at row {i}: {r.stderr[:200]}")
        else:
            print(f"  Added {total}/{len(rows)} rows", end="\r")
    print(f"  Added {total} rows total to {sheet_name}")

# Tab 1: Keyword Overlap by Region
print("Tab 1: Keyword Overlap by Region")
tab1_rows = []
for o in data["overlap_rows"]:
    campaigns = o["campaigns"]
    c1 = campaigns[0] if len(campaigns) > 0 else ""
    c2 = campaigns[1] if len(campaigns) > 1 else ""
    c3 = ", ".join(campaigns[2:]) if len(campaigns) > 2 else ""
    tab1_rows.append([o["region"], o["keyword"], o["match_types"], c1, c2, c3, o["risk"]])
append_rows("Keyword Overlap by Region", 
            ["Region", "Keyword", "Match Type", "Campaign 1", "Campaign 2", "Campaign 3+", "Risk Level"],
            tab1_rows)

# Tab 2: Keyword Misalignment
print("Tab 2: Keyword Misalignment")
tab2_rows = []
for m in data["misalignment_rows"]:
    tab2_rows.append([m["campaign"], m["ad_group"], m["keyword"], m["match_type"], m["issue"], m["suggested_action"]])
append_rows("Keyword Misalignment",
            ["Campaign", "Ad Group", "Keyword", "Match Type", "Issue", "Suggested Action"],
            tab2_rows)

# Tab 3: Campaign Keyword Summary
print("Tab 3: Campaign Keyword Summary")
tab3_rows = []
for s in data["campaign_summary"]:
    tab3_rows.append([s["campaign"], s["region"], s["total"], s.get("BROAD", 0), s.get("PHRASE", 0), s.get("EXACT", 0), "N/A", s["issues"]])
append_rows("Campaign Keyword Summary",
            ["Campaign", "Region", "Total Keywords", "Broad", "Phrase", "Exact", "Avg CPC", "Issues Found"],
            tab3_rows)

# Tab 4: Vapi Campaign Deep Dive
print("Tab 4: Vapi Campaign Deep Dive")
tab4_rows = []
for v in data["vapi_rows"]:
    tab4_rows.append([v["campaign"], v["ad_group"], v["keyword"], v["match_type"], v["category"], v["recommendation"]])
append_rows("Vapi Campaign Deep Dive",
            ["Campaign", "Ad Group", "Keyword", "Match Type", "Category", "Recommendation"],
            tab4_rows)

print(f"\nDone! https://docs.google.com/spreadsheets/d/{SID}")
