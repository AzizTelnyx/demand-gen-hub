import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const year = 2026;
  
  // Clear existing budget plans
  await prisma.budgetPlan.deleteMany({ where: { year } });
  
  // Monthly budgets - based on actual spend levels (~$87K/month total)
  // Google: ~$72K actual, StackAdapt: ~$15K actual
  const budgets = [
    { channel: "google_ads", monthly: 75000 },   // ~$75K/month target
    { channel: "stackadapt", monthly: 15000 },   // ~$15K/month target  
    { channel: "linkedin", monthly: 8000 },      // planned
    { channel: "reddit", monthly: 2000 },        // planned
  ];

  for (const b of budgets) {
    for (let month = 1; month <= 12; month++) {
      await prisma.budgetPlan.create({
        data: {
          year,
          month,
          channel: b.channel,
          planned: b.monthly,
        },
      });
    }
  }

  console.log("✅ Budget data seeded for 2026");
  
  // Show comparison
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ["live", "active", "enabled"] } },
    select: { platform: true, spend: true },
  });
  
  const actualByChannel: Record<string, number> = {};
  campaigns.forEach((c) => {
    actualByChannel[c.platform] = (actualByChannel[c.platform] || 0) + (c.spend || 0);
  });
  
  console.log("\nBudget vs Actual (monthly):");
  for (const b of budgets) {
    const actual = actualByChannel[b.channel] || 0;
    const pct = b.monthly > 0 ? ((actual / b.monthly) * 100).toFixed(0) : 0;
    console.log(`  ${b.channel}: $${b.monthly.toLocaleString()} planned, $${actual.toLocaleString()} actual (${pct}%)`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
