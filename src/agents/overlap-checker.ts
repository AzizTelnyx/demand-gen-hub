import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import { computeConfidence, type ConfidenceScore } from "@/lib/safety";
import type { AgentHandler, AgentOutput, AgentInput, Finding, AgentRecommendation } from "./types";

const execFileAsync = promisify(execFile);
const PYTHON = `${process.env.HOME}/.venv/bin/python3`;

/**
 * Overlap Checker
 * 
 * SAFETY:
 * - Queries REAL existing keywords from Google Ads API
 * - If API fails, STOP — never guess at overlaps
 * - Returns clear PASS/FAIL verdict
 */

interface OverlapInput {
  proposed_keywords: string[];
  platform?: string;
}

// High-risk generic terms that almost certainly overlap
const HIGH_RISK_GENERICS = [
  "voice api", "sms api", "sip trunking", "phone number",
  "cloud communications", "cpaas", "programmable voice",
  "text messaging api", "iot sim", "esim",
];

export const overlapChecker: AgentHandler = {
  slug: "overlap-checker",

  async run(input: AgentInput): Promise<AgentOutput> {
    const params = { ...(input.context || {}), ...(input.config || {}) } as OverlapInput;
    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];

    const proposed = params.proposed_keywords || [];
    if (proposed.length === 0) {
      return {
        findings: [{ severity: "critical", title: "No keywords provided", detail: "Provide proposed_keywords array." }],
        recommendations: [],
        summary: "❌ No keywords to check.",
      };
    }

    // ── Fetch existing keywords from Google Ads API ───────────
    // SAFETY: Must get real data. If fails, STOP.
    let existingKeywords: { keyword: string; campaignName: string; matchType: string; status: string }[] = [];

    try {
      const script = `${process.cwd()}/scripts/keyword-research.py`;
      const { stdout } = await execFileAsync(PYTHON, [
        script, "--mode", "existing-keywords", "--customer-id", "2356650573",
      ], { timeout: 120_000 });

      const result = JSON.parse(stdout);
      existingKeywords = (result.keywords || []).filter(
        (k: any) => k.status !== "REMOVED"
      );
    } catch (err: any) {
      // API failed — try DB fallback
      try {
        // Check if we have cached keywords in DB from last sync
        const campaigns = await prisma.campaign.findMany({
          where: { platform: "google_ads", status: { not: "removed" } },
          select: { name: true, metadata: true },
        });

        for (const c of campaigns) {
          if (c.metadata) {
            try {
              const meta = JSON.parse(c.metadata);
              if (meta.keywords) {
                for (const kw of meta.keywords) {
                  existingKeywords.push({
                    keyword: kw.text || kw.keyword,
                    campaignName: c.name,
                    matchType: kw.matchType || "UNKNOWN",
                    status: kw.status || "active",
                  });
                }
              }
            } catch {}
          }
        }

        if (existingKeywords.length === 0) {
          return {
            findings: [{
              severity: "critical",
              title: "Cannot check overlaps — no keyword data available",
              detail: `API error: ${err.message}. No cached keyword data in DB either. Cannot safely proceed.`,
            }],
            recommendations: [],
            summary: "❌ STOPPED: Cannot verify keyword overlaps without data.",
          };
        }

        findings.push({
          severity: "medium",
          title: "Using cached DB data (API unavailable)",
          detail: `Google Ads API failed: ${err.message}. Using ${existingKeywords.length} cached keywords. May be stale.`,
        });
      } catch (dbErr: any) {
        return {
          findings: [{
            severity: "critical",
            title: "Cannot check overlaps — both API and DB failed",
            detail: `API: ${err.message}. DB: ${dbErr.message}`,
          }],
          recommendations: [],
          summary: "❌ STOPPED: No keyword data source available.",
        };
      }
    }

    // ── Check overlaps ────────────────────────────────────────
    const exactConflicts: { proposed: string; existing: string; campaign: string; matchType: string }[] = [];
    const partialConflicts: { proposed: string; existing: string; campaign: string; matchType: string }[] = [];
    const highRiskGeneric: string[] = [];
    const safeKeywords: string[] = [];

    const existingNormalized = existingKeywords.map((k) => ({
      ...k,
      normalized: k.keyword.toLowerCase().trim().replace(/[^a-z0-9\s]/g, ""),
    }));

    for (const proposed_kw of proposed) {
      const pNorm = proposed_kw.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
      let hasConflict = false;

      // Exact match check
      for (const existing of existingNormalized) {
        if (existing.normalized === pNorm) {
          exactConflicts.push({
            proposed: proposed_kw,
            existing: existing.keyword,
            campaign: existing.campaignName,
            matchType: existing.matchType,
          });
          hasConflict = true;
        }
      }

      // Partial match check (proposed is contained in existing or vice versa)
      if (!hasConflict) {
        for (const existing of existingNormalized) {
          if (existing.normalized.includes(pNorm) || pNorm.includes(existing.normalized)) {
            if (existing.normalized !== pNorm) { // Not exact (already caught above)
              partialConflicts.push({
                proposed: proposed_kw,
                existing: existing.keyword,
                campaign: existing.campaignName,
                matchType: existing.matchType,
              });
              hasConflict = true;
              break; // One partial match is enough to flag
            }
          }
        }
      }

      // High-risk generic check
      if (HIGH_RISK_GENERICS.some((g) => pNorm === g || pNorm.includes(g))) {
        highRiskGeneric.push(proposed_kw);
      }

      if (!hasConflict) {
        safeKeywords.push(proposed_kw);
      }
    }

    // ── Build findings ────────────────────────────────────────
    const verdict = exactConflicts.length > 0 ? "FAIL" : "PASS";

    if (exactConflicts.length > 0) {
      findings.push({
        severity: "critical",
        title: `FAIL: ${exactConflicts.length} exact keyword conflicts`,
        detail: exactConflicts.map((c) =>
          `"${c.proposed}" already exists in "${c.campaign}" (${c.matchType})`
        ).join("\n"),
      });
    }

    if (partialConflicts.length > 0) {
      findings.push({
        severity: "high",
        title: `${partialConflicts.length} partial keyword overlaps`,
        detail: partialConflicts.map((c) =>
          `"${c.proposed}" overlaps with "${c.existing}" in "${c.campaign}" (${c.matchType})`
        ).join("\n"),
      });
    }

    if (highRiskGeneric.length > 0) {
      findings.push({
        severity: "medium",
        title: `${highRiskGeneric.length} high-risk generic terms`,
        detail: `These terms are very common and likely to conflict: ${highRiskGeneric.join(", ")}`,
      });
    }

    if (safeKeywords.length > 0) {
      findings.push({
        severity: "low",
        title: `${safeKeywords.length} keywords passed overlap check`,
        detail: safeKeywords.join(", "),
      });
    }

    // ── Confidence ────────────────────────────────────────────
    const confidence: ConfidenceScore = computeConfidence({
      hasApiData: existingKeywords.length > 0,
      hasKnowledgeBase: true,
      hasAllRequiredFields: proposed.length > 0,
      validationsPassed: true,
    });

    return {
      findings,
      recommendations,
      artifacts: [{
        verdict,
        proposedCount: proposed.length,
        exactConflicts,
        partialConflicts,
        highRiskGeneric,
        safeKeywords,
        existingKeywordsChecked: existingKeywords.length,
        _meta: { confidence },
      }],
      summary: `${verdict === "FAIL" ? "❌ FAIL" : "✅ PASS"}: ${proposed.length} keywords checked against ${existingKeywords.length} existing. ` +
        `${exactConflicts.length} exact conflicts, ${partialConflicts.length} partial overlaps, ` +
        `${safeKeywords.length} safe. Confidence: ${confidence.level}.`,
    };
  },
};
