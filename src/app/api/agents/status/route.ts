import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

interface AgentStatus {
  id: string;
  name: string;
  status: "active" | "on-demand" | "coming-soon";
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  description: string;
}

async function getLastRunTime(agentPath: string): Promise<string | null> {
  try {
    const fileContent = await fs.readFile(agentPath, "utf-8");
    const parsed = JSON.parse(fileContent);
    
    // Handle both formats: {"runs": [...]} or flat array [...]
    let entries: any[];
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else if (parsed.runs && Array.isArray(parsed.runs)) {
      entries = parsed.runs;
    } else {
      return null;
    }
    
    if (entries.length > 0) {
      // Get the most recent entry
      return entries[entries.length - 1].timestamp || entries[0].timestamp;
    }
  } catch (error) {
    // File doesn't exist or is empty
  }
  return null;
}

function getNextRunTime(schedule: string, lastRun: string | null): string | null {
  if (!lastRun || schedule === "on-demand") return null;
  
  const lastRunDate = new Date(lastRun);
  const intervalHours = parseInt(schedule.match(/(\d+)h/)?.[1] || "0");
  
  if (intervalHours > 0) {
    const nextRun = new Date(lastRunDate.getTime() + intervalHours * 60 * 60 * 1000);
    return nextRun.toISOString();
  }
  
  return null;
}

export async function GET() {
  try {
    const homeDir = process.env.HOME || "/home/telnyx-user";
    
    const optimizerLastRun = await getLastRunTime(
      path.join(homeDir, "clawd/agents/campaign-optimizer/activity-log.json")
    );
    const deepDiveLastRun = await getLastRunTime(
      path.join(homeDir, "clawd/agents/campaign-deep-dive/activity-log.json")
    );

    const agents: AgentStatus[] = [
      {
        id: "campaign-optimizer",
        name: "Campaign Optimizer",
        status: "active",
        schedule: "Every 6h",
        lastRun: optimizerLastRun,
        nextRun: getNextRunTime("6h", optimizerLastRun),
        description: "Monitors campaign health, auto-adds negative keywords, and tracks conversions across all active campaigns",
      },
      {
        id: "campaign-deep-dive",
        name: "Campaign Deep Dive",
        status: "on-demand",
        schedule: "On Demand",
        lastRun: deepDiveLastRun,
        nextRun: null,
        description: "AI-powered campaign investigation — audits search terms, ad groups, ad copy, geo/device, landing pages, and bidding strategy. Produces specific action plans.",
      },
    ];

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Error fetching agent status:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent status" },
      { status: 500 }
    );
  }
}
