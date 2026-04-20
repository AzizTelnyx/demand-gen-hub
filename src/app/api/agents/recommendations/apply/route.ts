import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = process.env.HOME || "/Users/azizalsinafi";

import { EXECUTABLE_TYPES, INFORMATIONAL_TYPES, ALERT_TYPES, getActionType } from "@/lib/recommendation-types";

const EXECUTABLE_DESCRIPTIONS: Record<string, string> = {
  "add-negative": "Block this search term as a negative keyword",
  "add_negative": "Block this search term as a negative keyword",
  "community_removal": "Remove this subreddit community from ad targeting",
  "frequency_cap": "Adjust the frequency cap on this campaign",
  "pause_keyword": "Pause this keyword",
  "budget_change": "Adjust campaign budget",
  "budget-realloc": "Reallocate campaign budget",
  "device_bid": "Adjust device bid modifier",
  "geo_bid": "Adjust geographic bid modifier",
  "domain_block": "Block underperforming domain/publisher",
};

/**
 * POST /api/agents/recommendations/apply
 * Apply or reject a pending recommendation
 */
export async function POST(request: NextRequest) {
  try {
    const { id, action } = await request.json();

    if (!id || !action) {
      return NextResponse.json({ error: "id and action required" }, { status: 400 });
    }

    const rec = await prisma.recommendation.findUnique({ where: { id } });
    if (!rec) {
      return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
    }
    if (rec.status !== "pending") {
      return NextResponse.json({ error: `Already ${rec.status}` }, { status: 400 });
    }

    if (action === "reject" || action === "dismiss") {
      await prisma.recommendation.update({
        where: { id },
        data: { status: action === "reject" ? "rejected" : "dismissed" },
      });
      return NextResponse.json({
        ok: true,
        status: action === "reject" ? "rejected" : "dismissed",
        message: action === "reject" ? "Rejected — no changes made" : "Dismissed",
      });
    }

    if (action === "approve") {
      let metadata: any = {};
      try { metadata = JSON.parse(rec.impact || "{}"); } catch {}

      const actionType = getActionType(rec.type);

      // Informational or alert types — acknowledge only, no automated action
      if (actionType === 'informational' || actionType === 'alert') {
        await prisma.recommendation.update({
          where: { id },
          data: { status: "acknowledged", appliedAt: new Date() },
        });
        return NextResponse.json({
          ok: true,
          status: "acknowledged",
          message: actionType === 'alert'
            ? "Alert dismissed — marked as reviewed."
            : "Acknowledged — marked as reviewed. No automated action taken.",
        });
      }

      // Executable types — run actual platform changes
      if (rec.type === "add-negative" || rec.type === "add_negative" || rec.type === "add-campaign-negative") {
        return await handleNegativeKeyword(rec, metadata);
      }

      if (rec.type === "community_removal") {
        return await handleCommunityRemoval(rec, metadata);
      }

      // For other executable types, mark as approved (agent will pick up on next run)
      if (EXECUTABLE_DESCRIPTIONS[rec.type]) {
        await prisma.recommendation.update({
          where: { id },
          data: { status: "approved", appliedAt: new Date() },
        });
        return NextResponse.json({
          ok: true,
          status: "approved",
          message: `Approved — will be applied on next agent run. Action: ${EXECUTABLE_DESCRIPTIONS[rec.type]}`,
        });
      }

      // Unknown type — still allow approval but flag it
      await prisma.recommendation.update({
        where: { id },
        data: { status: "approved", appliedAt: new Date() },
      });
      return NextResponse.json({
        ok: true,
        status: "approved",
        message: `Approved (type: ${rec.type}). No automated executor available — agent will handle on next run.`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Apply recommendation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleNegativeKeyword(rec: any, metadata: any) {
  const searchTerm = metadata.search_term;
  const campaignId = metadata.campaign_id || rec.targetId;
  const matchType = metadata.match_type || "EXACT";

  if (!searchTerm || !campaignId) {
    return NextResponse.json({ error: "Missing search_term or campaign_id in metadata" }, { status: 400 });
  }

  const result = await applyNegativeKeyword(searchTerm, String(campaignId), matchType);

  if (result.success) {
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { id: crypto.randomUUID(),
        status: "applied",
        appliedAt: new Date(),
        impact: JSON.stringify({ ...metadata, resource_name: result.resourceName }),
      },
    });
    return NextResponse.json({
      ok: true,
      status: "applied",
      message: `Blocked "${searchTerm}" (${matchType}) as negative keyword in Google Ads.`,
      resourceName: result.resourceName,
    });
  } else {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
}

async function handleCommunityRemoval(rec: any, metadata: any) {
  // Reddit community removal — mark as approved, agent applies on next run
  // Reddit API doesn't have a simple "remove community" endpoint we can call inline
  await prisma.recommendation.update({
    where: { id: rec.id },
    data: { status: "approved", appliedAt: new Date() },
  });
  return NextResponse.json({
    ok: true,
    status: "approved",
    message: `Approved — community will be removed from targeting on next Reddit agent run.`,
  });
}

async function applyNegativeKeyword(
  searchTerm: string,
  campaignId: string,
  matchType: string
): Promise<{ success: boolean; resourceName?: string; error?: string }> {
  const scriptPath = path.join(os.tmpdir(), `nk-apply-${Date.now()}.py`);

  const script = `
import json
from google.ads.googleads.client import GoogleAdsClient

creds_path = "${HOME}/.config/google-ads/credentials.json"
with open(creds_path) as f:
    creds = json.load(f)

client = GoogleAdsClient.load_from_dict({
    "developer_token": creds["developer_token"],
    "client_id": creds["client_id"],
    "client_secret": creds["client_secret"],
    "refresh_token": creds["refresh_token"],
    "login_customer_id": "2893524941",
    "use_proto_plus": True,
})

CUSTOMER_ID = "2356650573"
MATCH_MAP = {"EXACT": 2, "PHRASE": 3, "BROAD": 4}

service = client.get_service("CampaignCriterionService")
op = client.get_type("CampaignCriterionOperation")
criterion = op.create
criterion.campaign = client.get_service("CampaignService").campaign_path(CUSTOMER_ID, "${campaignId}")
criterion.negative = True
criterion.keyword.text = ${JSON.stringify(searchTerm)}
criterion.keyword.match_type = MATCH_MAP.get("${matchType}", 2)

try:
    response = service.mutate_campaign_criteria(customer_id=CUSTOMER_ID, operations=[op])
    rn = response.results[0].resource_name
    print(json.dumps({"success": True, "resourceName": rn}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

  try {
    fs.writeFileSync(scriptPath, script);
    const result = execSync(
      `source ${HOME}/.venv/bin/activate && python3 ${scriptPath}`,
      { encoding: "utf-8", timeout: 30000, shell: "/bin/zsh" }
    );
    try { execSync(`rm ${scriptPath}`, { shell: "/bin/zsh" }); } catch {}
    return JSON.parse(result.trim());
  } catch (error: any) {
    try { execSync(`rm ${scriptPath}`, { shell: "/bin/zsh" }); } catch {}
    return { success: false, error: error.message };
  }
}
