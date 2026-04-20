import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const quarter = req.nextUrl.searchParams.get('quarter') || getCurrentQuarter();
  const [guardrails, priorities] = await Promise.all([
    prisma.agentGuardrail.findMany({ orderBy: { category: 'asc' } }),
    prisma.regionalPriority.findMany({ where: { quarter }, orderBy: [{ region: 'asc' }, { product: 'asc' }] }),
  ]);
  return NextResponse.json({ guardrails, priorities, quarter });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  // Update a guardrail by key
  if (body.key && body.value !== undefined) {
    const updated = await prisma.agentGuardrail.update({
      where: { key: body.key },
      data: { value: String(body.value), updatedBy: body.updatedBy || null },
    });
    return NextResponse.json({ ok: true, guardrail: updated });
  }

  // Upsert a regional priority
  if (body.quarter && body.region && body.product) {
    const updated = await prisma.regionalPriority.upsert({
      where: { quarter_region_product: { quarter: body.quarter, region: body.region, product: body.product } },
      update: {
        priority: body.priority,
        protected: body.protected ?? false,
        notes: body.notes,
        updatedBy: body.updatedBy || null,
      },
      create: {
        id: crypto.randomUUID(),
        quarter: body.quarter,
        region: body.region,
        product: body.product,
        priority: body.priority,
        protected: body.protected ?? false,
        notes: body.notes,
        updatedBy: body.updatedBy || null,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, priority: updated });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

function getCurrentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}
