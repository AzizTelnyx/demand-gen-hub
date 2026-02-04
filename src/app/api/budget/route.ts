import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Fetch budget plans and calculate pacing
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;

  try {
    // Get budget plans
    const whereClause: any = { year };
    if (month) whereClause.month = month;

    const budgetPlans = await prisma.budgetPlan.findMany({
      where: whereClause,
      orderBy: [{ month: "asc" }, { channel: "asc" }],
    });

    // Get actual spend from campaigns for the period
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: { in: ["live", "active", "enabled"] },
      },
      select: {
        platform: true,
        spend: true,
        funnelStage: true,
        region: true,
      },
    });

    // Calculate actual spend by channel
    const actualByChannel: Record<string, number> = {};
    campaigns.forEach((c) => {
      const channel = c.platform;
      actualByChannel[channel] = (actualByChannel[channel] || 0) + (c.spend || 0);
    });

    // Enrich budget plans with pacing info
    // NOTE: Campaign spend is rolling 30-day, not calendar month
    // So we compare against monthly planned budget (close enough)
    const enrichedPlans = budgetPlans.map((plan) => {
      const actual = actualByChannel[plan.channel] || 0;
      const daysInMonth = new Date(plan.year, plan.month, 0).getDate();
      const today = new Date();
      const isCurrentMonth = today.getMonth() + 1 === plan.month && today.getFullYear() === plan.year;
      const currentDay = isCurrentMonth ? today.getDate() : (plan.month < today.getMonth() + 1 ? daysInMonth : 0);
      
      // Since spend is 30-day rolling (not calendar month), pacing = utilization
      // For current month, estimate based on days elapsed
      const monthProgress = isCurrentMonth ? currentDay / daysInMonth : 1;
      const expectedSpend = plan.planned * monthProgress;
      
      // Estimate current month's portion of 30-day spend
      // Assumption: spend is roughly even, so ~(currentDay/30) of 30-day spend is this month
      const estimatedMonthSpend = isCurrentMonth ? actual * (currentDay / 30) : actual;
      
      const pacePercentage = expectedSpend > 0 ? (estimatedMonthSpend / expectedSpend) * 100 : 0;
      const utilization = plan.planned > 0 ? (actual / plan.planned) * 100 : 0;

      return {
        ...plan,
        actual,                    // 30-day rolling spend
        estimatedMonthSpend,       // Estimated current month spend
        expectedSpend,             // What we should have spent by now
        pacePercentage,            // Are we on track for this month?
        daysElapsed: currentDay,
        daysInMonth,
        monthProgress: monthProgress * 100,
        utilization,               // 30-day spend vs monthly plan
      };
    });

    // Calculate totals
    const totalPlanned = budgetPlans.reduce((sum, p) => sum + p.planned, 0);
    const totalActual = Object.values(actualByChannel).reduce((sum, v) => sum + v, 0);

    // Get recent budget changes
    const recentChanges = await prisma.budgetChange.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      plans: enrichedPlans,
      totals: {
        planned: totalPlanned,
        actual: totalActual,
        utilization: totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0,
      },
      actualByChannel,
      recentChanges,
    });
  } catch (error) {
    console.error("Error fetching budget:", error);
    return NextResponse.json({ error: "Failed to fetch budget data" }, { status: 500 });
  }
}

// POST: Create or update budget plan
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year, month, channel, region, funnelStage, planned, notes } = body;

    // Upsert budget plan
    const plan = await prisma.budgetPlan.upsert({
      where: {
        year_month_channel_region_funnelStage: {
          year,
          month,
          channel,
          region: region || null,
          funnelStage: funnelStage || null,
        },
      },
      update: { planned, notes },
      create: { year, month, channel, region, funnelStage, planned, notes },
    });

    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("Error saving budget plan:", error);
    return NextResponse.json({ error: "Failed to save budget plan" }, { status: 500 });
  }
}

// DELETE: Remove a budget plan
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing plan ID" }, { status: 400 });
  }

  try {
    await prisma.budgetPlan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting budget plan:", error);
    return NextResponse.json({ error: "Failed to delete budget plan" }, { status: 500 });
  }
}
