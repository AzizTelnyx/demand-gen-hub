import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const now = new Date();
    const year = parseInt(params.get("year") || String(now.getFullYear()));
    const month = parseInt(params.get("month") || String(now.getMonth() + 1));

    const [allocations, capRow, actuals] = await Promise.all([
      prisma.$queryRawUnsafe<{ id: string; platform: string; planned: number; notes: string | null }[]>(
        `SELECT id, platform, planned, notes FROM "BudgetAllocation" WHERE year = $1 AND month = $2 ORDER BY planned DESC`,
        year, month
      ),
      prisma.$queryRawUnsafe<{ value: string }[]>(
        `SELECT value FROM "AgentGuardrail" WHERE key = 'monthly_budget_cap' LIMIT 1`
      ),
      prisma.$queryRawUnsafe<{ platform: string; spend: number }[]>(
        `SELECT platform, ROUND(SUM(cost)::numeric, 2)::float AS spend
         FROM "AdImpression"
         WHERE EXTRACT(YEAR FROM "dateFrom") = $1 AND EXTRACT(MONTH FROM "dateFrom") = $2
         GROUP BY platform`,
        year, month
      ),
    ]);

    const cap = capRow.length > 0 ? parseFloat(capRow[0].value) : 140000;
    const actualMap = Object.fromEntries(actuals.map(a => [a.platform, a.spend]));
    const total = allocations.reduce((s, a) => s + a.planned, 0);

    const result = allocations.map(a => ({
      ...a,
      actual: actualMap[a.platform] || 0,
      variance: a.planned > 0 ? Math.round(((actualMap[a.platform] || 0) / a.planned) * 10000) / 100 : 0,
    }));

    // Add platforms that have spend but no allocation
    for (const [platform, spend] of Object.entries(actualMap)) {
      if (!result.find(r => r.platform === platform)) {
        result.push({ id: "", platform, planned: 0, notes: null, actual: spend, variance: 0 });
      }
    }

    return NextResponse.json({
      year, month, cap, total,
      remaining: cap - total,
      allocations: result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { allocations, year, month } = body as {
      allocations: { platform: string; planned: number; notes?: string }[];
      year: number;
      month: number;
    };

    if (!allocations || !year || !month) {
      return NextResponse.json({ error: "Missing allocations, year, or month" }, { status: 400 });
    }

    // Validate total against cap
    const capRow = await prisma.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM "AgentGuardrail" WHERE key = 'monthly_budget_cap' LIMIT 1`
    );
    const cap = capRow.length > 0 ? parseFloat(capRow[0].value) : 140000;
    const total = allocations.reduce((s, a) => s + a.planned, 0);

    if (total > cap) {
      return NextResponse.json({
        error: `Total allocation $${total.toLocaleString()} exceeds monthly cap $${cap.toLocaleString()}`,
      }, { status: 400 });
    }

    // Upsert each allocation
    for (const a of allocations) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "BudgetAllocation" (platform, year, month, planned, notes, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (platform, year, month) DO UPDATE SET
           planned = EXCLUDED.planned, notes = EXCLUDED.notes, "updatedAt" = NOW()`,
        a.platform, year, month, a.planned, a.notes || null
      );
    }

    return NextResponse.json({ ok: true, total, cap, remaining: cap - total });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
