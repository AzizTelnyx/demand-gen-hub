import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const product = url.searchParams.get("product") || "AI Agent";
    const minImpressions = parseInt(url.searchParams.get("minImpressions") || "500");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    // Get enriched accounts with domain-level performance on specified product campaigns
    const wasteData = await prisma.$queryRaw`
      SELECT 
        a.domain,
        a.company,
        a.industry,
        a."clearbitTags",
        a."clearbitDesc",
        a."employeeCount",
        a."annualRevenue",
        c."parsedProduct",
        c."parsedVariant",
        SUM(i.impressions)::int as impressions,
        SUM(i.clicks)::int as clicks,
        SUM(i.cost)::float as spend,
        SUM(i.conversions)::int as conversions
      FROM "AdImpression" i
      JOIN "ABMAccount" a ON i.domain = a.domain
      JOIN "Campaign" c ON i."campaignId" = c."platformId"
      WHERE i.platform = 'stackadapt'
        AND i.domain != '__campaign__'
        AND a."lastEnrichedAt" IS NOT NULL
        AND c.platform = 'stackadapt'
        AND c."parsedProduct" = ${product}
      GROUP BY a.domain, a.company, a.industry, a."clearbitTags", a."clearbitDesc", 
               a."employeeCount", a."annualRevenue", c."parsedProduct", c."parsedVariant"
      HAVING SUM(i.impressions) > ${minImpressions}
      ORDER BY SUM(i.cost) DESC
      LIMIT ${limit}
    `;

    // Categorize each domain using description signals, not just industry tags
    // Key insight: travel TECH companies (Sabre, Booking) are legitimate voice AI buyers.
    // Waste = companies that don't build/buy software, regardless of industry.
    const wasteIndustries = [
      "Travel & Tourism", "Airport Services",  // Travel agencies/services (NOT travel tech)
      "Home Improvement", "Home Ownership", "Real Estate",
      "Crypto", "Retail", "Restaurants", "Golf", "Luxury Goods",
      "Theaters", "Convention", "Hospitality",
    ];
    
    // Industries that ARE relevant when the company is a SaaS/platform
    const potentiallyRelevantIndustries = [
      "Travel & Leisure", "E-commerce", "Publishing",
      "Financial Transactions", "Financial Services", "Banking",
      "Health Care", "Medicine", "Medical Centers",
    ];
    
    const saasKeywords = ["SaaS", "platform", "software", "API", "cloud", "technology", "developer", "AI"];
    
    const categorized = (wasteData as any[]).map((row: any) => {
      const tags = typeof row.clearbitTags === "string" 
        ? JSON.parse(row.clearbitTags) 
        : row.clearbitTags || [];
      const primaryIndustry = tags[0] || row.industry || "unknown";
      const desc = (row.clearbitDesc || "").toLowerCase();
      
      // Check if company is a software/SaaS builder
      const isSaaS = saasKeywords.some(kw => desc.includes(kw.toLowerCase())) ||
        tags.some((t: string) => ["SAAS", "B2B", "Software", "Technology"].includes(t));
      
      let category = "relevant";
      
      if (wasteIndustries.includes(primaryIndustry) && !isSaaS) {
        category = "waste";
      } else if (potentiallyRelevantIndustries.includes(primaryIndustry) && !isSaaS) {
        category = "unclear"; // Not SaaS but might still buy — flag for review
      } else {
        category = "relevant"; // Either SaaS or in a buyer industry
      }
      
      return {
        ...row,
        cleartags: tags,
        primaryIndustry,
        isSaaS,
        category,
      };
    });

    // Aggregate waste totals
    const wasteDomains = categorized.filter((d) => d.category === "waste");
    const relevantDomains = categorized.filter((d) => d.category !== "waste");
    
    const wasteSummary = {
      totalDomains: categorized.length,
      wasteDomains: wasteDomains.length,
      relevantDomains: relevantDomains.length,
      wasteSpend: wasteDomains.reduce((sum, d) => sum + parseFloat(d.spend || 0), 0),
      wasteImpressions: wasteDomains.reduce((sum, d) => sum + d.impressions, 0),
      relevantSpend: relevantDomains.reduce((sum, d) => sum + parseFloat(d.spend || 0), 0),
      relevantImpressions: relevantDomains.reduce((sum, d) => sum + d.impressions, 0),
    };

    return NextResponse.json({ 
      summary: wasteSummary, 
      domains: categorized,
      product,
    });
  } catch (error: any) {
    console.error("ABM waste API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
