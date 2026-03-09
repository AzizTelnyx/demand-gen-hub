import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const listId = url.searchParams.get("listId");
    const vertical = url.searchParams.get("vertical");
    const region = url.searchParams.get("region");
    const tier = url.searchParams.get("tier");
    const productFit = url.searchParams.get("productFit");
    const search = url.searchParams.get("q");
    const listType = url.searchParams.get("listType");
    const memberStatus = url.searchParams.get("memberStatus"); // active, pending, excluded
    const currentProvider = url.searchParams.get("currentProvider");
    const addedAfter = url.searchParams.get("addedAfter"); // ISO date — show accounts added after this date
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const status = url.searchParams.get("status");

    const where: any = {};
    if (vertical) where.vertical = vertical;
    if (region) where.region = region;
    if (tier) where.tier = tier;
    if (productFit) where.productFit = productFit;
    if (status) where.status = status;
    if (currentProvider) where.currentProvider = { contains: currentProvider, mode: "insensitive" };
    if (search) {
      where.OR = [
        { company: { contains: search, mode: "insensitive" } },
        { domain: { contains: search, mode: "insensitive" } },
      ];
    }

    // Filter by list membership
    if (listId) {
      const memberWhere: any = { listId };
      if (memberStatus) memberWhere.status = memberStatus;
      if (addedAfter) memberWhere.addedAt = { gte: new Date(addedAfter) };
      where.lists = { some: memberWhere };
    }

    const accounts = await prisma.aBMAccount.findMany({
      where,
      include: {
        lists: {
          include: { list: { select: { id: true, name: true, listType: true } } },
        },
      },
      orderBy: [{ tier: "asc" }, { company: "asc" }],
    });

    // Lists
    const listWhere: any = {};
    if (!includeArchived) listWhere.status = "active";
    if (listType) listWhere.listType = listType;

    const lists = await prisma.aBMList.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true } },
        members: {
          select: { status: true, addedAt: true },
        },
      },
    });

    // Filter options
    const allAccounts = await prisma.aBMAccount.findMany({
      select: { vertical: true, region: true, tier: true, productFit: true, currentProvider: true, status: true },
    });
    const verticals = [...new Set(allAccounts.map(a => a.vertical).filter(Boolean))].sort();
    const regions = [...new Set(allAccounts.map(a => a.region).filter(Boolean))].sort();
    const tiers = [...new Set(allAccounts.map(a => a.tier).filter(Boolean))].sort();
    const productFits = [...new Set(allAccounts.map(a => a.productFit).filter(Boolean))].sort();
    const providers = [...new Set(allAccounts.map(a => a.currentProvider).filter(Boolean))].sort();
    const statuses = [...new Set(allAccounts.map(a => a.status).filter(Boolean))].sort();

    const byVertical: Record<string, number> = {};
    const byProductFit: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    allAccounts.forEach(a => {
      if (a.vertical) byVertical[a.vertical] = (byVertical[a.vertical] || 0) + 1;
      if (a.productFit) byProductFit[a.productFit] = (byProductFit[a.productFit] || 0) + 1;
      const s = a.status || 'identified';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    // Compute list stats
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return NextResponse.json({
      accounts: accounts.map(a => ({
        ...a,
        contacts: a.contacts ? JSON.parse(a.contacts) : [],
        listNames: a.lists.map(l => l.list.name),
        listIds: a.lists.map(l => l.listId),
        listTypes: a.lists.map(l => l.list.listType),
        memberAddedAt: a.lists.reduce((acc, l) => ({ ...acc, [l.listId]: l.addedAt.toISOString() }), {}),
        memberAddedBy: a.lists.reduce((acc, l) => ({ ...acc, [l.listId]: l.addedBy }), {}),
        lastActivity: a.lastActivity?.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      lists: lists.map(l => {
        const activeCount = l.members.filter(m => m.status === "active").length;
        const pendingCount = l.members.filter(m => m.status === "pending").length;
        const recentCount = l.members.filter(m => m.addedAt >= weekAgo).length;
        return {
          id: l.id, name: l.name, query: l.query, listType: l.listType,
          description: l.description, mode: l.mode, source: l.source,
          status: l.status, createdBy: l.createdBy,
          count: l._count.members, activeCount, pendingCount, recentCount,
          createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString(),
        };
      }),
      filters: { verticals, regions, tiers, productFits, providers, statuses },
      stats: { total: allAccounts.length, byVertical, byProductFit, byStatus },
    });
  } catch (error: any) {
    console.error("ABM API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — create list, add accounts, or manage lists
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Create a new list
    if (body.action === "create-list") {
      const { name, listType = "vertical", description, createdBy } = body;
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

      const list = await prisma.aBMList.create({
        data: { name, listType, description, createdBy, source: "manual" },
      });
      return NextResponse.json({ ok: true, list });
    }

    // Rename a list
    if (body.action === "rename-list") {
      const { listId, name } = body;
      const list = await prisma.aBMList.update({
        where: { id: listId },
        data: { name },
      });
      return NextResponse.json({ ok: true, list });
    }

    // Archive a list
    if (body.action === "archive-list") {
      const { listId } = body;
      const list = await prisma.aBMList.update({
        where: { id: listId },
        data: { status: "archived" },
      });
      return NextResponse.json({ ok: true, list });
    }

    // Unarchive
    if (body.action === "unarchive-list") {
      const { listId } = body;
      const list = await prisma.aBMList.update({
        where: { id: listId },
        data: { status: "active" },
      });
      return NextResponse.json({ ok: true, list });
    }

    // Merge lists
    if (body.action === "merge-lists") {
      const { sourceListId, targetListId } = body;
      // Move all members from source to target (skip dupes)
      const sourceMembers = await prisma.aBMListMember.findMany({
        where: { listId: sourceListId },
      });
      let moved = 0;
      for (const m of sourceMembers) {
        try {
          await prisma.aBMListMember.create({
            data: { listId: targetListId, accountId: m.accountId, addedBy: "merge", status: m.status },
          });
          moved++;
        } catch {} // already exists
      }
      // Archive source
      await prisma.aBMList.update({ where: { id: sourceListId }, data: { status: "archived" } });
      // Update target count
      const count = await prisma.aBMListMember.count({ where: { listId: targetListId } });
      await prisma.aBMList.update({ where: { id: targetListId }, data: { count } });
      return NextResponse.json({ ok: true, moved, sourceArchived: true });
    }

    // Update member status (approve pending, exclude, re-activate)
    if (body.action === "update-member") {
      const { listId, accountId, status, reason } = body;
      const member = await prisma.aBMListMember.update({
        where: { listId_accountId: { listId, accountId } },
        data: { status, reason },
      });
      return NextResponse.json({ ok: true, member });
    }

    // Bulk update member status
    if (body.action === "bulk-update-members") {
      const { listId, accountIds, status, reason } = body;
      let updated = 0;
      for (const accountId of accountIds) {
        try {
          await prisma.aBMListMember.update({
            where: { listId_accountId: { listId, accountId } },
            data: { status, reason },
          });
          updated++;
        } catch {}
      }
      return NextResponse.json({ ok: true, updated });
    }

    // Add accounts to a list (by account IDs)
    if (body.action === "add-to-list") {
      const { listId, accountIds, addedBy = "manual" } = body;
      let added = 0;
      for (const accountId of accountIds) {
        try {
          await prisma.aBMListMember.create({
            data: { listId, accountId, addedBy },
          });
          added++;
        } catch {} // already exists
      }
      const count = await prisma.aBMListMember.count({ where: { listId } });
      await prisma.aBMList.update({ where: { id: listId }, data: { count } });
      return NextResponse.json({ ok: true, added });
    }

    // Remove accounts from a list
    if (body.action === "remove-from-list") {
      const { listId, accountIds } = body;
      const result = await prisma.aBMListMember.deleteMany({
        where: { listId, accountId: { in: accountIds } },
      });
      const count = await prisma.aBMListMember.count({ where: { listId } });
      await prisma.aBMList.update({ where: { id: listId }, data: { count } });
      return NextResponse.json({ ok: true, removed: result.count });
    }

    // Check overlap between lists
    if (body.action === "check-overlap") {
      const { listIds } = body;
      if (!listIds || listIds.length < 2) {
        return NextResponse.json({ error: "Need at least 2 list IDs" }, { status: 400 });
      }
      // Find accounts that appear in multiple of the given lists
      const members = await prisma.aBMListMember.findMany({
        where: { listId: { in: listIds } },
        include: { account: { select: { id: true, company: true, domain: true } } },
      });
      const accountListMap: Record<string, { account: any; lists: string[] }> = {};
      for (const m of members) {
        if (!accountListMap[m.accountId]) {
          accountListMap[m.accountId] = { account: m.account, lists: [] };
        }
        accountListMap[m.accountId].lists.push(m.listId);
      }
      const overlaps = Object.values(accountListMap).filter(v => v.lists.length > 1);
      return NextResponse.json({ ok: true, overlaps, totalOverlap: overlaps.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("ABM POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
