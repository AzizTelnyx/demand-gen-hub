import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

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
      return NextResponse.json({ ok: true, status: action === "reject" ? "rejected" : "dismissed" });
    }

    if (action === "approve") {
      // Only add-negative type has a real apply path
      if (rec.type !== "add-negative") {
        return NextResponse.json({ error: `Cannot auto-apply type: ${rec.type}. Only negative keywords are supported.` }, { status: 400 });
      }

      let metadata: any = {};
      try { metadata = JSON.parse(rec.impact || "{}"); } catch {}

      const searchTerm = metadata.search_term;
      const campaignId = metadata.campaign_id || rec.targetId;
      const matchType = metadata.match_type || "EXACT";

      if (!searchTerm || !campaignId) {
        return NextResponse.json({ error: "Missing search_term or campaign_id in metadata" }, { status: 400 });
      }

      const result = await applyNegativeKeyword(searchTerm, String(campaignId), matchType);

      if (result.success) {
        await prisma.recommendation.update({
          where: { id },
          data: {
            status: "applied",
            appliedAt: new Date(),
            impact: JSON.stringify({ ...metadata, resource_name: result.resourceName }),
          },
        });
        return NextResponse.json({ ok: true, status: "applied", resourceName: result.resourceName });
      } else {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Apply recommendation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function applyNegativeKeyword(
  searchTerm: string,
  campaignId: string,
  matchType: string
): Promise<{ success: boolean; resourceName?: string; error?: string }> {
  const HOME = process.env.HOME || "/Users/azizalsinafi";
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
    // Clean up temp file
    try { execSync(`rm ${scriptPath}`, { shell: "/bin/zsh" }); } catch {}
    return JSON.parse(result.trim());
  } catch (error: any) {
    try { execSync(`rm ${scriptPath}`, { shell: "/bin/zsh" }); } catch {}
    return { success: false, error: error.message };
  }
}
