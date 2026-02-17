import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { readdirSync, readFileSync } from "fs";

interface ActivityEntry {
  timestamp: string;
  agent: string;
  action: string;
  status: string;
  summary: string;
  report?: string;
  structured?: Record<string, any>;
  details?: Record<string, any>;
  findings?: any[];
  steps?: any[];
  metrics?: {
    time_saved_hours?: number;
    budget_optimized?: number;
    campaigns_created?: number;
  };
}

export async function GET() {
  try {
    const agentPaths = [
      {
        name: "Campaign Optimizer",
        path: path.join(process.env.HOME || "/home/telnyx-user", "clawd/agents/campaign-optimizer/activity-log.json"),
      },
      {
        name: "Campaign Deep Dive",
        path: path.join(process.env.HOME || "/home/telnyx-user", "clawd/agents/campaign-deep-dive/activity-log.json"),
      },
    ];

    const allActivities: ActivityEntry[] = [];

    for (const agent of agentPaths) {
      try {
        const fileContent = await fs.readFile(agent.path, "utf-8");
        const parsed = JSON.parse(fileContent);
        
        // Handle both formats: {"runs": [...]} or flat array [...]
        let entries: any[];
        if (Array.isArray(parsed)) {
          entries = parsed;
        } else if (parsed.runs && Array.isArray(parsed.runs)) {
          entries = parsed.runs;
        } else {
          entries = [];
        }

        // Normalize entries to match expected interface
        for (const entry of entries) {
          let normalized: ActivityEntry;

          if (agent.name === "Campaign Deep Dive") {
            // Deep dive entries have a different format — normalize them
            const modules = entry.modules || {};
            const actions = entry.actions || {};
            const searchTerms = modules.search_terms || {};

            // Try to load investigation data from saved files
            let investigationData: Record<string, any> | null = null;
            try {
              const homeDir = process.env.HOME || "/home/telnyx-user";
              const investigationsDir = path.join(homeDir, "clawd/agents/campaign-deep-dive/data/investigations");
              const files = readdirSync(investigationsDir).sort().reverse();
              // Find matching investigation file by campaign_id or timestamp
              for (const file of files) {
                if (file.endsWith(".json")) {
                  try {
                    const filePath = path.join(investigationsDir, file);
                    const data = JSON.parse(readFileSync(filePath, "utf-8"));
                    if (data.campaign_id === entry.campaign_id || 
                        (data.investigated_at && entry.timestamp && 
                         data.investigated_at.substring(0, 16) === entry.timestamp.substring(0, 16))) {
                      investigationData = data;
                      break;
                    }
                  } catch { /* skip bad files */ }
                }
              }
            } catch { /* investigations dir doesn't exist */ }

            // Build structured data from investigation
            const structured: Record<string, any> = {};
            if (investigationData) {
              // Action plan items
              if (investigationData.action_plan) {
                const ap = investigationData.action_plan;
                const actionItems: any[] = [];
                (ap.immediate_actions || []).forEach((a: any) => {
                  const action = typeof a === "string" ? a : (a.action || a.item || String(a));
                  actionItems.push({ campaign: entry.campaign, action, reason: typeof a === "string" ? "" : (a.reason || ""), priority: "high", impact: typeof a === "string" ? "" : (a.impact || "") });
                });
                (ap.recommended_actions || []).forEach((a: any) => {
                  const action = typeof a === "string" ? a : (a.action || a.item || String(a));
                  actionItems.push({ campaign: entry.campaign, action, reason: typeof a === "string" ? "" : (a.reason || ""), priority: a.priority || "medium", impact: typeof a === "string" ? "" : (a.impact || "") });
                });
                (ap.review_items || []).forEach((a: any) => {
                  actionItems.push({ campaign: entry.campaign, action: a.item || a.action || String(a), reason: a.reason || "", priority: "low", impact: a.impact || "" });
                });
                if (actionItems.length > 0) structured.action_items = actionItems;
                if (ap.root_cause) structured.root_cause = ap.root_cause;
              }

              // Flagged search terms
              if (investigationData.search_terms?.flagged_for_review) {
                structured.flagged_for_review = investigationData.search_terms.flagged_for_review.map((t: any) => ({
                  term: t.term,
                  campaign: entry.campaign,
                  clicks: t.clicks || 0,
                  spend: t.spend?.toFixed(2) || "0.00",
                  reason: t.flag_reason || t.reason || "",
                }));
              }

              // Normalize bidding data — handle both old (nested) and new (flat) formats
              let normalizedBidding: Record<string, any> | null = null;
              if (investigationData.bidding) {
                const b = investigationData.bidding;
                // Strategy name map for readable display
                const strategyNames: Record<string, string> = {
                  MANUAL_CPC: "Manual CPC",
                  MANUAL_CPM: "Manual CPM",
                  MAXIMIZE_CLICKS: "Maximize Clicks",
                  MAXIMIZE_CONVERSIONS: "Maximize Conversions",
                  MAXIMIZE_CONVERSION_VALUE: "Maximize Conversion Value",
                  TARGET_CPA: "Target CPA",
                  TARGET_ROAS: "Target ROAS",
                  TARGET_IMPRESSION_SHARE: "Target Impression Share",
                  ENHANCED_CPC: "Enhanced CPC",
                };

                // current_strategy could be a string (new format) or dict (old format)
                let strategyDisplay: string;
                if (typeof b.current_strategy === "string") {
                  strategyDisplay = b.current_strategy;
                } else if (typeof b.current_strategy === "object" && b.current_strategy?.bidding_strategy) {
                  // Old format: current_strategy is the full bidding data dict
                  const raw = b.current_strategy.bidding_strategy as string;
                  strategyDisplay = strategyNames[raw] || raw.replace(/_/g, " ");
                } else if (b.bidding_strategy) {
                  // Flat format with bidding_strategy key
                  strategyDisplay = strategyNames[b.bidding_strategy] || (b.bidding_strategy as string).replace(/_/g, " ");
                } else {
                  strategyDisplay = "Unknown";
                }

                // Recommendation could be a dict or string
                let recDisplay: string = "";
                if (typeof b.recommendation === "object" && b.recommendation?.action) {
                  recDisplay = b.recommendation.action;
                } else if (typeof b.recommendation === "string") {
                  recDisplay = b.recommendation;
                }

                normalizedBidding = {
                  current_strategy: strategyDisplay,
                  recommendation: recDisplay,
                };
              }

              // Deep dive modules summary
              structured.deep_dive_modules = {
                search_terms: investigationData.search_terms ? {
                  total: investigationData.search_terms.total_terms,
                  classifications: investigationData.search_terms.classifications,
                  spend_breakdown: investigationData.search_terms.spend_breakdown,
                } : null,
                ad_groups: investigationData.ad_groups ? {
                  count: investigationData.ad_groups.count,
                  total_spend: investigationData.ad_groups.total_spend,
                  recommendations: investigationData.ad_groups.recommendations?.length || 0,
                } : null,
                geo_device: investigationData.geo_device_schedule ? {
                  recommendations: investigationData.geo_device_schedule.recommendations?.length || 0,
                } : null,
                bidding: normalizedBidding,
                landing_pages: investigationData.landing_pages ? {
                  count: investigationData.landing_pages.landing_pages?.length || 0,
                  recommendations: investigationData.landing_pages.recommendations?.length || 0,
                } : null,
              };
            }

            normalized = {
              timestamp: entry.timestamp || new Date().toISOString(),
              agent: agent.name,
              action: entry.action || "deep_dive_investigation",
              status: entry.status || "completed",
              summary: entry.summary || `Deep dive on ${entry.campaign || "unknown campaign"}`,
              report: entry.report || null,
              structured: structured,
              details: {
                duration_seconds: entry.duration_seconds,
                dry_run: entry.dry_run || false,
                campaign: entry.campaign,
                campaign_id: entry.campaign_id,
                terms_analyzed: searchTerms.total || entry.modules?.search_terms?.total || 0,
                negatives_added: actions.auto_applied || entry.negatives_added || 0,
                flagged_for_review: actions.review || entry.recommendations || 0,
                recommended_actions: actions.recommended || entry.recommendations || 0,
              },
              findings: [],
              steps: [],
              metrics: {
                time_saved_hours: entry.duration_seconds ? Math.round((entry.duration_seconds / 60) * 10) / 10 : 2,
                budget_optimized: entry.estimated_savings || 0,
              },
            };
          } else {
            // Standard normalization for other agents
            const structured = entry.structured || {};
            const searchTerms = structured.search_terms || {};
            const conversions = structured.conversions || {};
            const health = structured.health || {};
            
            normalized = {
              timestamp: entry.timestamp || new Date().toISOString(),
              agent: agent.name,
              action: entry.action || entry.type || "analysis",
              status: entry.status || "completed",
              summary: entry.summary || "",
              report: entry.report || null,
              structured: structured,
              details: {
                duration_seconds: entry.duration_seconds,
                dry_run: entry.dry_run || false,
                healthy: health.healthy || 0,
                watch: health.watch || 0,
                action_needed: health.action_needed || 0,
                contact_sales: conversions.contact_sales || 0,
                signups: conversions.signups || 0,
                terms_analyzed: searchTerms.total_analyzed || 0,
                negatives_added: searchTerms.negatives_added || 0,
                flagged_for_review: searchTerms.flagged_for_review || 0,
              },
              findings: (entry.findings || []).map((f: any) => ({
                campaign: f.campaign || "",
                severity: f.severity || "warning",
                issue: Array.isArray(f.issues) ? f.issues.join(", ") : (f.issue || ""),
                action: f.action || "",
                impact: f.impact || "",
              })),
              steps: entry.steps || [],
              metrics: {
                time_saved_hours: entry.duration_seconds ? Math.round((21 * 0.5) * 10) / 10 : 0,
                budget_optimized: 0,
              },
            };
          }
          allActivities.push(normalized);
        }
      } catch (error) {
        // If file doesn't exist or is empty, continue
        console.error(`Failed to read ${agent.name} log:`, error);
      }
    }

    // Sort by timestamp descending (most recent first)
    allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      activities: allActivities,
      total: allActivities.length,
    });
  } catch (error) {
    console.error("Error fetching agent activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent activity" },
      { status: 500 }
    );
  }
}
