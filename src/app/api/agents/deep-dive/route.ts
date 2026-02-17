import { NextResponse } from "next/server";
import { exec } from "child_process";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { campaign, dryRun = true } = body;

    if (!campaign || typeof campaign !== "string" || campaign.trim().length === 0) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 }
      );
    }

    const sanitizedCampaign = campaign.replace(/[";$`\\]/g, "");
    const dryRunFlag = dryRun ? "--dry-run" : "";
    const homeDir = process.env.HOME || "/home/telnyx-user";

    const command = `cd ${homeDir}/clawd/agents/campaign-deep-dive && source ${homeDir}/.venv/bin/activate && python3 -u deep_dive.py ${dryRunFlag} "${sanitizedCampaign}" >> /tmp/deep-dive-output.log 2>&1 &`;

    exec(command, { shell: "/bin/bash" }, (error) => {
      if (error) {
        console.error("Failed to spawn deep dive:", error);
      }
    });

    return NextResponse.json({
      status: "started",
      campaign: sanitizedCampaign,
      dryRun,
    });
  } catch (error) {
    console.error("Error triggering deep dive:", error);
    return NextResponse.json(
      { error: "Failed to trigger deep dive" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { execSync } = require("child_process");
    const result = execSync("pgrep -f 'python3.*deep_dive\\.py' 2>/dev/null || true", {
      encoding: "utf-8",
    }).trim();

    const running = result.length > 0;

    let lastOutput = "";
    if (running) {
      try {
        lastOutput = execSync("tail -5 /tmp/deep-dive-output.log 2>/dev/null || true", {
          encoding: "utf-8",
        }).trim();
      } catch { /* no log yet */ }
    }

    return NextResponse.json({
      running,
      pids: running ? result.split("\n").filter(Boolean) : [],
      lastOutput,
    });
  } catch (error) {
    console.error("Error checking deep dive status:", error);
    return NextResponse.json({ running: false, pids: [], lastOutput: "" });
  }
}
