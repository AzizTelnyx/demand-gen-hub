import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Parse campaign name to extract metadata
function parseCampaignName(name: string) {
  const upper = name.toUpperCase();
  const regions = ["GLOBAL", "AMER", "EMEA", "APAC"];
  const funnels = ["TOFU", "MOFU", "BOFU"];
  const products: Record<string, string> = {
    "VOICE AI": "Voice AI", "AI AGENT": "AI Agent", "SIP": "SIP",
    "IOT": "IoT", "CONTACT CENTER": "Contact Center", "SIP TRUNKING": "SIP",
    "MESSAGING": "Messaging", "NETWORKING": "Networking",
  };
  const verticals: Record<string, string> = {
    "HEALTHCARE": "Healthcare", "FINTECH": "Fintech", "TRAVEL": "Travel",
    "RETAIL": "Retail", "ECOMMERCE": "Ecommerce", "INSURANCE": "Insurance",
    "LOGISTICS": "Logistics",
  };

  const region = regions.find((r) => upper.includes(r)) || null;
  const funnel = funnels.find((f) => upper.includes(f)) || null;
  const product = Object.entries(products).find(([k]) => upper.includes(k))?.[1] || null;
  const vertical = Object.entries(verticals).find(([k]) => upper.includes(k))?.[1] || null;

  return { region, funnel, product, vertical };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { campaignId, auto } = body;

    const initiative = await prisma.initiative.findUnique({ where: { id } });
    if (!initiative) return NextResponse.json({ error: "Initiative not found" }, { status: 404 });

    // Manual link
    if (campaignId) {
      const link = await prisma.initiativeCampaign.upsert({
        where: { initiativeId_campaignId: { initiativeId: id, campaignId } },
        create: { initiativeId: id, campaignId, autoLinked: false },
        update: {},
      });
      return NextResponse.json(link);
    }

    // Auto-link based on matching metadata
    if (auto) {
      const campaigns = await prisma.campaign.findMany();
      const linked: string[] = [];
      const existing = await prisma.initiativeCampaign.findMany({
        where: { initiativeId: id },
        select: { campaignId: true },
      });
      const existingIds = new Set(existing.map((e) => e.campaignId));

      for (const c of campaigns) {
        if (existingIds.has(c.id)) continue;
        const parsed = parseCampaignName(c.name);
        let score = 0;
        if (initiative.region && parsed.region && parsed.region === initiative.region) score++;
        if (initiative.product && parsed.product && parsed.product.toLowerCase() === initiative.product.toLowerCase()) score++;
        if (initiative.vertical && parsed.vertical && parsed.vertical.toLowerCase() === initiative.vertical.toLowerCase()) score++;
        if (initiative.funnel && parsed.funnel && parsed.funnel === initiative.funnel) score++;

        if (score >= 2) {
          await prisma.initiativeCampaign.create({
            data: { initiativeId: id, campaignId: c.id, autoLinked: true },
          });
          linked.push(c.name);
        }
      }
      return NextResponse.json({ linked, count: linked.length });
    }

    return NextResponse.json({ error: "Provide campaignId or auto:true" }, { status: 400 });
  } catch (error) {
    console.error("Link POST error:", error);
    return NextResponse.json({ error: "Failed to link campaigns" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { campaignId } = body;
    if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    await prisma.initiativeCampaign.delete({
      where: { initiativeId_campaignId: { initiativeId: id, campaignId } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Link DELETE error:", error);
    return NextResponse.json({ error: "Failed to unlink campaign" }, { status: 500 });
  }
}
