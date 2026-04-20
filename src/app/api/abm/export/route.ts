import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const listId = url.searchParams.get("listId");
    const region = url.searchParams.get("region");
    const vertical = url.searchParams.get("vertical");
    const tier = url.searchParams.get("tier");
    const currentProvider = url.searchParams.get("currentProvider");
    const memberStatus = url.searchParams.get("memberStatus") || "all";
    const format = url.searchParams.get("format") || "csv";
    const excludePipeline = url.searchParams.get("excludePipeline") === "true";

    if (!listId) {
      return NextResponse.json({ error: "listId required" }, { status: 400 });
    }

    // Get members with filters
    const memberWhere: any = { listId };
    if (memberStatus !== "all") {
      memberWhere.status = memberStatus;
    } else {
      // Exclude removed/dead, include active + pending
      memberWhere.status = { in: ["active", "pending"] };
    }
    const accountWhere: any = {};
    if (region) accountWhere.region = region;
    if (vertical) accountWhere.vertical = vertical;
    if (tier) accountWhere.tier = tier;
    if (currentProvider) accountWhere.currentProvider = { contains: currentProvider, mode: "insensitive" };
    if (excludePipeline) accountWhere.inPipeline = false;

    const members = await prisma.aBMListMember.findMany({
      where: { ...memberWhere, account: accountWhere },
      include: {
        ABMAccount: true,
        ABMList: { select: { name: true } },
      },
      orderBy: { ABMAccount: { company: "asc" } },
    });

    if (format === "json") {
      return NextResponse.json({
        list: members[0]?.ABMList?.name || "Unknown",
        count: members.length,
        accounts: members.map(m => ({
          company: m.ABMAccount.company,
          domain: m.ABMAccount.domain,
          vertical: m.ABMAccount.vertical,
          country: m.ABMAccount.country,
          region: m.ABMAccount.region,
          companySize: m.ABMAccount.companySize,
          tier: m.ABMAccount.tier,
          productFit: m.ABMAccount.productFit,
          currentProvider: m.ABMAccount.currentProvider,
          status: m.status,
          addedBy: m.addedBy,
          addedAt: m.addedAt.toISOString(),
        })),
      });
    }

    // CSV
    const headers = [
      "Company", "Domain", "Vertical", "Country", "Region",
      "Company Size", "Tier", "Product Fit", "Current Provider",
      "Status", "Added By", "Added At",
    ];

    const rows = members.map(m => [
      csvEscape(m.ABMAccount.company),
      csvEscape(m.ABMAccount.domain || ""),
      csvEscape(m.ABMAccount.vertical || ""),
      csvEscape(m.ABMAccount.country || ""),
      csvEscape(m.ABMAccount.region || ""),
      csvEscape(m.ABMAccount.companySize || ""),
      csvEscape(m.ABMAccount.tier || ""),
      csvEscape(m.ABMAccount.productFit || ""),
      csvEscape(m.ABMAccount.currentProvider || ""),
      m.status,
      m.addedBy,
      m.addedAt.toISOString().split("T")[0],
    ].join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    // Get list name from DB directly (don't depend on members array)
    const list = await prisma.aBMList.findUnique({ where: { id: listId }, select: { name: true } });
    const listName = list?.name || members[0]?.ABMList?.name || "abm-export";
    const safeName = listName.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase();
    const dateStr = new Date().toISOString().split("T")[0];

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${safeName}-${dateStr}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("ABM export error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
