import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-client";

// How many companies to request per AI wave
const WAVE_SIZE = 50;
// Max consecutive waves with zero new companies before stopping
const MAX_DRY_STREAK = 2;

// POST /api/abm/process — pick up and run a queued job
// Can be called:
//   - with { jobId } to process a specific job
//   - with {} to pick up the next queued job
//   - with { all: true } to process all queued jobs sequentially
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, all: processAll } = body;

    if (jobId) {
      // Process specific job
      const job = await prisma.aBMJob.findUnique({ where: { id: jobId }, include: { list: true } });
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      if (job.status !== "queued") return NextResponse.json({ error: `Job is ${job.status}, not queued` }, { status: 400 });

      const result = await processJob(job);
      return NextResponse.json(result);
    }

    if (processAll) {
      // Process all queued jobs
      const jobs = await prisma.aBMJob.findMany({
        where: { status: "queued" },
        include: { list: true },
        orderBy: { createdAt: "asc" },
      });

      const results = [];
      for (const job of jobs) {
        const result = await processJob(job);
        results.push(result);
      }

      return NextResponse.json({ processed: results.length, results });
    }

    // Default: pick up next queued job
    const nextJob = await prisma.aBMJob.findFirst({
      where: { status: "queued" },
      include: { list: true },
      orderBy: { createdAt: "asc" },
    });

    if (!nextJob) {
      return NextResponse.json({ message: "No queued jobs" });
    }

    const result = await processJob(nextJob);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("ABM process error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/abm/process — check for queued jobs and process them (cron-friendly)
export async function GET(request: NextRequest) {
  try {
    const jobs = await prisma.aBMJob.findMany({
      where: { status: "queued" },
      include: { list: true },
      orderBy: { createdAt: "asc" },
    });

    if (jobs.length === 0) {
      return NextResponse.json({ message: "No queued jobs" });
    }

    const results = [];
    for (const job of jobs) {
      try {
        const result = await processJob(job);
        results.push(result);
      } catch (err: any) {
        console.error(`Job ${job.id} failed:`, err);
        results.push({ jobId: job.id, status: "error", error: err.message });
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error: any) {
    console.error("ABM process error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function processJob(job: any): Promise<{
  jobId: string;
  listId: string;
  listName: string;
  status: string;
  found: number;
  target: number;
  waves: number;
  error?: string;
}> {
  console.log(`[ABM Process] Starting job ${job.id} (${job.jobType}) for list "${job.list.name}" — target: ${job.target}`);

  // Mark as running
  await prisma.aBMJob.update({
    where: { id: job.id },
    data: { status: "running" },
  });

  try {
    // Parse the criteria from the query
    let criteria: any = {};
    try {
      criteria = JSON.parse(job.query);
    } catch {
      criteria = { description: job.query };
    }

    // For expand jobs, get existing company names to avoid duplicates
    let existingCompanies: string[] = [];
    if (job.jobType === "expand") {
      const existing = await prisma.aBMListMember.findMany({
        where: { listId: job.listId },
        include: { account: { select: { company: true } } },
      });
      existingCompanies = existing.map((m: any) => m.account.company.toLowerCase());
    }

    // Calculate remaining needed
    const remaining = job.target - job.found;
    if (remaining <= 0) {
      await prisma.aBMJob.update({
        where: { id: job.id },
        data: { status: "done" },
      });
      return { jobId: job.id, listId: job.listId, listName: job.list.name, status: "done", found: job.found, target: job.target, waves: job.waves };
    }

    let totalAdded = 0;
    let dryStreak = 0;
    let waveNum = job.waves;

    // Process in waves
    while (totalAdded < remaining && dryStreak < MAX_DRY_STREAK) {
      waveNum++;
      const waveTarget = Math.min(WAVE_SIZE, remaining - totalAdded);

      console.log(`[ABM Process] Wave ${waveNum} — requesting ${waveTarget} companies (${totalAdded}/${remaining} added so far)`);

      const companies = await generateCompanies(criteria, waveTarget, existingCompanies, waveNum);

      if (companies.length === 0) {
        dryStreak++;
        console.log(`[ABM Process] Wave ${waveNum} returned 0 companies — dry streak: ${dryStreak}`);
        await prisma.aBMJob.update({
          where: { id: job.id },
          data: { waves: waveNum, dryStreak, lastWaveAt: new Date() },
        });
        continue;
      }

      // Upsert companies and add to list
      let waveAdded = 0;
      for (const company of companies) {
        // Skip if already in this list (case-insensitive name match)
        if (existingCompanies.includes(company.name.toLowerCase())) continue;
        // Skip if no domain and company name already exists with null domain
        if (!company.domain) {
          const existingWithName = await prisma.aBMAccount.findFirst({
            where: { company: { equals: company.name, mode: "insensitive" }, domain: null },
          });
          if (existingWithName) {
            // Link existing account to list if not already
            const existingMember = await prisma.aBMListMember.findUnique({
              where: { listId_accountId: { listId: job.listId, accountId: existingWithName.id } },
            });
            if (!existingMember) {
              await prisma.aBMListMember.create({
                data: { listId: job.listId, accountId: existingWithName.id, addedBy: "research-agent", reason: `Wave ${waveNum}` },
              });
              existingCompanies.push(company.name.toLowerCase());
              waveAdded++;
            }
            continue;
          }
        }

        try {
          // Upsert account
          const account = await prisma.aBMAccount.upsert({
            where: { company_domain: { company: company.name, domain: company.domain ?? null } },
            create: {
              company: company.name,
              domain: company.domain || null,
              vertical: company.vertical || criteria.vertical || null,
              country: company.country || null,
              region: company.region || criteria.regions?.[0] || null,
              companySize: company.employeeRange || null,
              productFit: mapProductFit(company.productFit || criteria.productFit?.[0]),
              currentProvider: company.currentProvider || criteria.includeProviders?.[0] || null,
              switchSignal: company.switchSignal || null,
              source: "research-agent",
              status: "identified",
            },
            update: {
              vertical: company.vertical || criteria.vertical || undefined,
              region: company.region || criteria.regions?.[0] || undefined,
              productFit: mapProductFit(company.productFit || criteria.productFit?.[0]) || undefined,
              currentProvider: company.currentProvider || criteria.includeProviders?.[0] || undefined,
            },
          });

          // Add to list (skip if already member)
          try {
            await prisma.aBMListMember.create({
              data: {
                listId: job.listId,
                accountId: account.id,
                addedBy: "research-agent",
                reason: `Wave ${waveNum}`,
              },
            });
            existingCompanies.push(company.name.toLowerCase());
            waveAdded++;
          } catch (e: any) {
            // Unique constraint violation = already in list, skip
            if (!e.message?.includes("Unique")) {
              console.error(`Failed to add ${company.name} to list:`, e.message);
            }
          }
        } catch (e: any) {
          console.error(`Failed to upsert ${company.name}:`, e.message);
        }
      }

      totalAdded += waveAdded;
      dryStreak = waveAdded === 0 ? dryStreak + 1 : 0;

      // Update job progress
      await prisma.aBMJob.update({
        where: { id: job.id },
        data: {
          found: job.found + totalAdded,
          waves: waveNum,
          dryStreak,
          lastWaveAt: new Date(),
        },
      });

      console.log(`[ABM Process] Wave ${waveNum} — added ${waveAdded} companies (total: ${totalAdded})`);
    }

    // Update list count
    const memberCount = await prisma.aBMListMember.count({
      where: { listId: job.listId, status: "active" },
    });
    await prisma.aBMList.update({
      where: { id: job.listId },
      data: { count: memberCount },
    });

    // Mark job as done
    await prisma.aBMJob.update({
      where: { id: job.id },
      data: { status: "done", found: job.found + totalAdded, waves: waveNum },
    });

    console.log(`[ABM Process] Job ${job.id} complete — added ${totalAdded} companies across ${waveNum} waves`);

    return {
      jobId: job.id,
      listId: job.listId,
      listName: job.list.name,
      status: "done",
      found: job.found + totalAdded,
      target: job.target,
      waves: waveNum,
    };
  } catch (error: any) {
    console.error(`[ABM Process] Job ${job.id} failed:`, error);
    await prisma.aBMJob.update({
      where: { id: job.id },
      data: { status: "error", error: error.message },
    });
    return {
      jobId: job.id,
      listId: job.listId,
      listName: job.list?.name || "unknown",
      status: "error",
      found: job.found,
      target: job.target,
      waves: job.waves,
      error: error.message,
    };
  }
}

async function generateCompanies(
  criteria: any,
  count: number,
  existingCompanies: string[],
  waveNum: number,
): Promise<GeneratedCompany[]> {
  // Build the research prompt from criteria
  const targetProfile = criteria.targetCompanyProfile || criteria.description || "B2B companies";
  const regions = criteria.regions?.length ? criteria.regions.join(", ") : "any region";
  const vertical = criteria.vertical || "any vertical";
  const productFit = criteria.productFit?.length ? criteria.productFit.join(", ") : "general fit";
  const includeProviders = criteria.includeProviders?.length ? criteria.includeProviders.join(", ") : "";
  const excludeCompanies = [
    ...(criteria.excludeCompanies || []),
    // Also exclude companies we already found
    ...existingCompanies.slice(0, 50), // Limit to avoid prompt bloat
  ];
  const exampleCompanies = criteria.exampleCompanies?.length ? criteria.exampleCompanies.join(", ") : "";

  const prompt = `Find ${count} real B2B companies matching these criteria:

**Target Profile:** ${targetProfile}
**Vertical:** ${vertical}
**Regions:** ${regions}
**Product Fit:** ${productFit}
${includeProviders ? `**Currently using:** ${includeProviders}` : ""}
${excludeCompanies.length > 0 ? `**Exclude:** ${excludeCompanies.join(", ")}` : ""}
${exampleCompanies ? `**Similar to:** ${exampleCompanies}` : ""}
**Wave:** ${waveNum} (${waveNum > 1 ? "find DIFFERENT companies from previous waves" : "first wave"})

Return ONLY valid JSON:
{
  "companies": [
    {
      "name": "Company Name",
      "domain": "company.com",
      "employeeRange": "51-200",
      "vertical": "fintech",
      "country": "US",
      "region": "AMER",
      "productFit": "voice-ai",
      "currentProvider": "Twilio",
      "switchSignal": "Recent funding round, expanding communications"
    }
  ]
}

CRITICAL RULES:
- Use REAL companies that actually exist. Do NOT fabricate or hallucinate companies.
- Each company must have a real, working domain.
- Employee ranges: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5000+
- Regions: AMER, EMEA, APAC, MENA
- productFit values: voice-ai, sip-trunking, sms-api, contact-center, iot, programmable-voice, multi-product
- If you don't know enough real companies to fill the list, return fewer — quality over quantity.
- ${waveNum > 1 ? "IMPORTANT: Do NOT repeat companies from the exclude list. Find genuinely different companies." : ""}`;

  const response = await createCompletion({
    messages: [
      {
        role: "system",
        content: `You are a B2B market research expert specializing in telecom, voice AI, and cloud communications. You have deep knowledge of companies in these spaces across all regions and verticals.

Your job is to find REAL companies that match the given criteria. You must be factual — only return companies you are confident actually exist. If you can only find 15 out of 50 requested, return 15. Never fabricate companies to hit a number.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    maxTokens: 4096,
    temperature: 0.5,
  });

  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed.companies || [];
  } catch (e) {
    console.error("[ABM Process] Failed to parse AI response:", e);
    console.error("[ABM Process] Raw response:", response.slice(0, 500));
    return [];
  }
}

function mapProductFit(fit: string | undefined): string | null {
  if (!fit) return null;
  const normalized = fit.toLowerCase().trim();
  const mapping: Record<string, string> = {
    "voice-ai": "voice-ai",
    "voice api": "voice-ai",
    "voice-api": "voice-ai",
    "sip-trunking": "sip-trunking",
    "sip trunking": "sip-trunking",
    "sms-api": "sms-api",
    "sms api": "sms-api",
    "contact-center": "contact-center",
    "ccaaS": "contact-center",
    "iot": "iot",
    "programmable-voice": "programmable-voice",
    "programmable voice": "programmable-voice",
    "multi-product": "multi-product",
    "multi product": "multi-product",
  };
  return mapping[normalized] || fit;
}

interface GeneratedCompany {
  name: string;
  domain: string;
  employeeRange: string;
  vertical: string;
  country?: string;
  region?: string;
  productFit: string;
  currentProvider?: string;
  switchSignal?: string;
}
