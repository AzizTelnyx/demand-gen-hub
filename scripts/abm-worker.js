/**
 * ABM Research Worker
 * Runs as a pm2 process. Picks up queued/running ABMJobs and processes them in waves.
 * Supports: generate (new list), expand (add to existing list)
 * List types: vertical, use-case, conquest
 *
 * Validation layer: DNS + Clearbit + Perplexica AI Search + LinkedIn signals
 * Confidence scoring: ≥60 validated, 30-59 unverified, <30 rejected
 */

const { PrismaClient } = require("@prisma/client");
const dns = require("dns");
const prisma = new PrismaClient();

// Use Telnyx LiteLLM gateway via Tailscale — independent from OpenClaw, no serialization
// AI backends — try LiteLLM first, fall back to OpenClaw gateway
const AI_BACKENDS = [
  { url: "http://litellm-aiswe.query.prod.telnyx.io:4000/v1", token: process.env.LITELLM_API_KEY || "sk-JcJEnHgGiRKTnIdkGfv3Rw", model: "gemini/gemini-2.0-flash" },
  { url: "http://litellm-aiswe.query.prod.telnyx.io:4000/v1", token: process.env.LITELLM_API_KEY || "sk-JcJEnHgGiRKTnIdkGfv3Rw", model: "litellm_proxy/Kimi-K2.5" },
];
let activeBackend = 0;
const AI_BASE_URL = AI_BACKENDS[0].url;
const AI_TOKEN = AI_BACKENDS[0].token;
const MODEL = AI_BACKENDS[0].model;
const WAVE_SIZE = 25;

// Telegram notifications
const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo";
const TG_CHAT_ID = "-1003786506284";
const TG_THREAD_ID = 164; // Agent Activity topic

// Validation API keys
const CLEARBIT_KEY = process.env.CLEARBIT_API_KEY || "sk_6a6f1e4c6f26338d6340d688ad197d48";

// Perplexica config (self-hosted AI search) — set PERPLEXICA_ENABLED=false to disable
const PERPLEXICA_ENABLED = process.env.PERPLEXICA_ENABLED !== "false";
const PERPLEXICA_URL = process.env.PERPLEXICA_URL || "http://localhost:3001";
const PERPLEXICA_CHAT_PROVIDER_ID = process.env.PERPLEXICA_CHAT_PROVIDER_ID || "3fd01726-84a3-48aa-a9b0-d63b53cb7356";
const PERPLEXICA_CHAT_MODEL = process.env.PERPLEXICA_CHAT_MODEL || "gemini/gemini-2.0-flash";
const PERPLEXICA_EMBED_PROVIDER_ID = process.env.PERPLEXICA_EMBED_PROVIDER_ID || "320d9526-5a69-4e79-a2ee-23497799d2f8";
const PERPLEXICA_EMBED_MODEL = process.env.PERPLEXICA_EMBED_MODEL || "Xenova/all-MiniLM-L6-v2";

// Scoring weights
const SCORE = { CLEARBIT: 40, DNS: 20, PERPLEXICA: 20, LINKEDIN: 10, AI_BASELINE: 10 };
const THRESHOLD = { VALIDATED: 60, UNVERIFIED: 30 };

const TG_ENABLED = process.env.TG_NOTIFICATIONS !== "false";

async function notifyTelegram(text) {
  if (!TG_ENABLED) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, message_thread_id: TG_THREAD_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("[Telegram] Notification failed:", e.message);
  }
}

// ─── Global Competitor Exclusion ─────────────────────────────
// These are Telnyx competitors — NEVER include in any ABM list
const COMPETITOR_DOMAINS = new Set([
  // Direct SIP/Voice API competitors
  "twilio.com", "vonage.com", "bandwidth.com", "plivo.com", "sinch.com",
  "messagebird.com", "bird.com", "infobip.com", "clicksend.com", "kaleyra.com",
  "voximplant.com", "agora.io", "nexmo.com", "signalwire.com", "flowroute.com",
  "telestax.com", "apidaze.io", "catapult.inetwork.com", "commio.com", "voxbone.com",
  // Voice AI / TTS / STT competitors
  "elevenlabs.io", "vapi.ai", "retell.ai", "livekit.io", "bland.ai",
  "deepgram.com", "assemblyai.com", "speechmatics.com", "rev.ai", "rev.com",
  "resemble.ai", "play.ht", "murf.ai", "wellsaid.com", "wellsaidlabs.com", "cartesia.ai",
  "poly.ai", "voiceflow.com", "parloa.com", "cognigy.com", "kore.ai",
  "synthflow.ai", "thoughtly.ai", "air.ai", "hamming.ai",
  // Big CCaaS platforms
  "five9.com", "genesys.com", "nice.com", "niceincontact.com", "talkdesk.com",
  "dialpad.com", "ringcentral.com", "8x8.com", "nextiva.com", "aircall.com",
  "avaya.com", "cisco.com", "mitel.com", "vonage.com", "zoom.us",
  "amazon.com", "connect.aws", "twilio.com",
  // IoT competitors
  "hologram.io", "telstra.com", "1nce.com", "emnify.com", "soracom.io",
  "floatleft.com", "aeris.com", "jasper.com",
  // Other
  "nuance.com", "microsoft.com", "google.com",
]);
const COMPETITOR_NAMES = new Set([
  // Direct SIP/Voice API
  "twilio", "vonage", "bandwidth", "plivo", "sinch",
  "messagebird", "bird", "infobip", "clicksend", "kaleyra",
  "voximplant", "agora", "nexmo", "signalwire", "flowroute", "commio", "voxbone",
  // Voice AI / TTS / STT
  "elevenlabs", "eleven labs", "vapi", "retell", "retell ai", "livekit",
  "bland ai", "bland.ai", "deepgram", "assemblyai", "assembly ai",
  "resemble ai", "play.ht", "murf ai", "wellsaid", "wellsaid labs", "cartesia",
  "poly ai", "polyai", "voiceflow", "parloa", "cognigy", "kore ai", "kore.ai",
  "synthflow", "thoughtly", "air ai", "hamming ai",
  // Big CCaaS
  "five9", "genesys", "nice", "nice incontact", "niceincontact", "nice cxone",
  "talkdesk", "dialpad", "ringcentral", "8x8", "nextiva", "aircall",
  "avaya", "cisco", "mitel", "zoom",
  // IoT
  "hologram", "telstra", "1nce", "emnify", "soracom", "aeris", "jasper",
  // Other
  "nuance", "speechmatics",
]);

function isCompetitor(company, domain) {
  if (!company && !domain) return false;
  if (domain) {
    const d = domain.toLowerCase().replace(/^www\./, "");
    if (COMPETITOR_DOMAINS.has(d)) return true;
  }
  if (company) {
    const c = company.toLowerCase().trim();
    if (COMPETITOR_NAMES.has(c)) return true;
    // Partial match for variations
    for (const name of COMPETITOR_NAMES) {
      if (c === name || c.startsWith(name + " ") || c.endsWith(" " + name)) return true;
    }
  }
  return false;
}

// ─── Non-Target Segment Exclusion ─────────────────────────────
// Hard reject for segments we never target (Clearbit-based, enrichment signals)
const NON_TARGET_INDUSTRIES = [
  "government", "military", "defense", "public sector", "federal", "municipal",
  "education", "higher education", "primary education", "secondary education", "school",
  "pharmacy", "pharmaceutical retail", "retail pharmacy",
  "religious", "non-profit", "charity",
];
const NON_TARGET_COUNTRIES = ["RU", "BY", "IR", "KP", "CN", "AF", "SY", "VE", "CU", "SD"];

function isNonTargetSegment(clearbitData, company, country) {
  // Hard reject: non-target countries (compliance/billing blocks)
  if (country && NON_TARGET_COUNTRIES.includes(country.toUpperCase())) {
    return { reject: true, reason: `Non-target country: ${country}` };
  }

  // If no Clearbit data, don't reject (permissive approach)
  if (!clearbitData || !clearbitData.found) return { reject: false };

  const industry = (clearbitData.industry || "").toLowerCase();
  const sector = (clearbitData.sector || "").toLowerCase();
  const description = (clearbitData.description || "").toLowerCase();
  const combined = `${industry} ${sector} ${description}`;

  // Check for non-target industry keywords
  for (const term of NON_TARGET_INDUSTRIES) {
    if (combined.includes(term)) {
      // But keep EdTech, GovTech, HealthTech (technology companies serving these sectors)
      const isTech = industry.includes("technology") || industry.includes("software") ||
                     sector.includes("technology") || description.includes("software") ||
                     description.includes("platform") || description.includes("saas");
      if (!isTech) {
        return { reject: true, reason: `Non-target segment: ${term}` };
      }
    }
  }

  return { reject: false };
}

// ─── ICP Matching (Soft Signal, Not Hard Filter) ─────────────────────────────
// ICP profiles from knowledge base — used for enrichment, not rejection
const ICP_VERTICALS = {
  developer: ["software", "saas", "technology", "internet", "information technology", "computer software"],
  enterprise_contact_center: ["insurance", "healthcare", "banking", "financial services", "travel", "hospitality", "telecommunications"],
  voice_ai: ["artificial intelligence", "machine learning", "voice", "speech", "automation"],
};

const ICP_PRODUCT_FITS = ["ai-agent", "voice-api", "sip-trunking", "sms-api", "iot", "numbers"];

function getICPMatch(clearbitData, company, vertical, productFit) {
  // If we already have vertical/productFit from AI generation, trust it
  if (vertical && productFit) {
    return { matched: true, icp: `${vertical}-${productFit}` };
  }

  // Use Clearbit to infer ICP if available
  if (clearbitData && clearbitData.found) {
    const industry = (clearbitData.industry || "").toLowerCase();
    const sector = (clearbitData.sector || "").toLowerCase();

    // Check against ICP verticals
    for (const [icp, keywords] of Object.entries(ICP_VERTICALS)) {
      for (const kw of keywords) {
        if (industry.includes(kw) || sector.includes(kw)) {
          return { matched: true, icp, inferred: true };
        }
      }
    }
  }

  // No match found — but don't reject, just mark as unclassified
  return { matched: false, icp: null };
}

// ─── Validation Functions ────────────────────────────────────

/**
 * Domain liveness check — DNS resolve + HTTP HEAD request.
 * DNS alone isn't enough (parked domains, dead sites still resolve).
 */
async function checkDNS(domain) {
  if (!domain) return false;
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  try {
    // Step 1: DNS resolve
    await dns.promises.resolve(cleanDomain);
  } catch {
    return false;
  }
  // Step 2: HTTP HEAD to verify the site actually responds
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://${cleanDomain}`, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // Accept any 2xx/3xx as alive. 4xx/5xx = dead.
    return res.status < 400;
  } catch {
    // Try HTTP if HTTPS fails
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`http://${cleanDomain}`, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.status < 400;
    } catch {
      return false;
    }
  }
}

/**
 * Clearbit company enrichment. Returns enrichment data or null.
 */
async function checkClearbit(domain) {
  if (!domain || !CLEARBIT_KEY) return null;
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(
      `https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(cleanDomain)}`,
      { headers: { Authorization: `Bearer ${CLEARBIT_KEY}` }, signal: controller.signal }
    );
    clearTimeout(timeout);

    if (res.status === 200) {
      const data = await res.json();
      return {
        found: true,
        employeeCount: data.metrics?.employeesRange || data.metrics?.employees || null,
        industry: data.category?.industry || null,
        sector: data.category?.sector || null,
        techUsed: data.tech ? data.tech.slice(0, 20) : null,
        funding: data.metrics?.raised || null,
        description: data.description || null,
      };
    }
    if (res.status === 202) return { found: false, queued: true };
    return null; // 404 or other
  } catch {
    return null;
  }
}

/**
 * Perplexica AI search verification. Returns { found, linkedinFound }.
 * Uses self-hosted Perplexica instance (SearxNG + AI summarization).
 */
async function checkPerplexica(companyName, domain) {
  if (!PERPLEXICA_ENABLED) return { found: false, linkedinFound: false };
  if (!companyName) return { found: false, linkedinFound: false };
  try {
    const cleanDomain = domain ? domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";
    const query = `"${companyName}" ${cleanDomain} — does this company exist? What do they do?`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${PERPLEXICA_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatModel: { providerId: PERPLEXICA_CHAT_PROVIDER_ID, key: PERPLEXICA_CHAT_MODEL },
        embeddingModel: { providerId: PERPLEXICA_EMBED_PROVIDER_ID, key: PERPLEXICA_EMBED_MODEL },
        optimizationMode: "speed",
        sources: ["web"],
        query,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return { found: false, linkedinFound: false };
    const data = await res.json();

    const nameLower = companyName.toLowerCase();
    let found = false;
    let linkedinFound = false;

    // Check AI message for company confirmation
    const message = (data.message || "").toLowerCase();
    if (message.includes(nameLower) || (cleanDomain && message.includes(cleanDomain))) {
      found = true;
    }

    // Check sources for LinkedIn and company mentions
    for (const s of (data.sources || [])) {
      const text = `${s.content || ""} ${s.metadata?.title || ""} ${s.metadata?.url || ""}`.toLowerCase();
      if (text.includes(nameLower) || (cleanDomain && text.includes(cleanDomain))) {
        found = true;
      }
      if (s.metadata?.url && s.metadata.url.includes("linkedin.com/company/")) {
        linkedinFound = true;
      }
    }

    return { found, linkedinFound };
  } catch (e) {
    if (PERPLEXICA_ENABLED) console.error(`[Perplexica] Verify error for "${companyName}": ${e.message}`);
    return { found: false, linkedinFound: false };
  }
}

/**
 * Validate an array of candidates with confidence scoring.
 * Runs DNS in parallel (batch of 5), Clearbit sequentially, Perplexica at 2s intervals.
 */
async function validateCandidates(candidates) {
  const results = candidates.map(c => ({
    ...c,
    confidenceScore: SCORE.AI_BASELINE, // baseline for AI-generated
    validationSignals: { clearbit: false, dns: false, perplexica: false, linkedin: false },
    clearbitData: null,
  }));

  // 1. DNS checks in parallel (batches of 5)
  for (let i = 0; i < results.length; i += 5) {
    const batch = results.slice(i, i + 5);
    const dnsResults = await Promise.all(batch.map(c => checkDNS(c.domain)));
    for (let j = 0; j < batch.length; j++) {
      if (dnsResults[j]) {
        batch[j].confidenceScore += SCORE.DNS;
        batch[j].validationSignals.dns = true;
      } else {
        // Dead domain = force reject (score 0)
        batch[j].confidenceScore = 0;
        console.log(`[DNS] Dead domain: ${batch[j].domain} (${batch[j].company}) — forced reject`);
      }
    }
  }

  // Remove dead domains before expensive Clearbit/Perplexica calls
  const alive = results.filter(c => c.confidenceScore > 0);
  const dead = results.filter(c => c.confidenceScore === 0);
  if (dead.length > 0) {
    console.log(`[Validation] ${dead.length} dead domains skipped before enrichment`);
  }

  // 2. Clearbit sequentially (250ms delay) + Perplexica at 2s — run interleaved
  for (let i = 0; i < alive.length; i++) {
    const c = alive[i];

    // Clearbit
    const cbResult = checkClearbit(c.domain);
    // Perplexica (runs concurrently with Clearbit for this candidate)
    const perplexicaResult = checkPerplexica(c.company, c.domain);

    const [cb, perplexica] = await Promise.all([cbResult, perplexicaResult]);

    if (cb && cb.found) {
      c.confidenceScore += SCORE.CLEARBIT;
      c.validationSignals.clearbit = true;
      c.clearbitData = cb;
      
      // ─── Non-Target Segment Check (Hard Reject) ───
      const segmentCheck = isNonTargetSegment(cb, c.company, c.country);
      if (segmentCheck.reject) {
        c.confidenceScore = 0; // Force reject
        c.rejectReason = segmentCheck.reason;
        console.log(`[ICP Filter] Rejected "${c.company}" — ${segmentCheck.reason}`);
        continue; // Skip further validation for this candidate
      }
      
      // ─── ICP Matching (Enrichment, Not Filter) ───
      const icpMatch = getICPMatch(cb, c.company, c.vertical, c.productFit);
      if (icpMatch.matched) {
        c.icpMatch = icpMatch;
      }
    }

    if (perplexica.found) {
      c.confidenceScore += SCORE.PERPLEXICA;
      c.validationSignals.perplexica = true;
    }
    if (perplexica.linkedinFound) {
      c.confidenceScore += SCORE.LINKEDIN;
      c.validationSignals.linkedin = true;
    }

    // Rate limit: 2s between Perplexica calls (SearxNG upstream rate limits)
    if (i < results.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return [...alive, ...dead];
}

/**
 * Determine status from confidence score.
 */
function scoreToStatus(score) {
  if (score >= THRESHOLD.VALIDATED) return "validated";
  if (score >= THRESHOLD.UNVERIFIED) return "unverified";
  return "rejected";
}

// ─── Perplexica Discovery Wave ────────────────────────────────────

/**
 * Uses Perplexica (AI-powered search) to discover real companies.
 * Returns results in the same format as runWave().
 */
async function perplexicaDiscoveryWave(job, listInfo) {
  // Skip if Perplexica disabled
  if (!PERPLEXICA_ENABLED) return { generated: 0, newCount: 0, added: 0 };

    // Blocklist of news/listing domains to exclude
    const BLOCKED_DOMAINS = new Set([
      "tech.eu", "eu-startups.com", "theverge.com", "forbes.com", "bloomberg.com",
      "techcrunch.com", "theguardian.com", "bbc.com", "wired.com", "businessinsider.com",
      "venturebeat.com", "axios.com", "zdnet.com", "mindtheproduct.com", "medium.com",
      "substack.com", "healthcare", "healthtech", "news", "blog", "article", "post",
      "eit.europa.eu", "eithealth.eu", "openaccessgovernment.org", "therecursive.com",
      "pando.com", "singapore", "malaysia", "indonesia", "vietnam", "thailand",
      "linkedin.com", "glassdoor.com", "indeed.com", "g2.com",
    ]);

  let criteria = null;
  try {
    criteria = JSON.parse(job.query);
    if (!criteria.targetCompanyProfile) criteria = null;
  } catch {}

  // Build a single rich query (Perplexica returns AI-synthesized results)
  let query;
  if (criteria) {
    const vertical = criteria.vertical || "";
    const products = (criteria.productFit || []).map(p => p.replace(/-/g, " ")).join(", ");
    const profile = criteria.targetCompanyProfile || "";
    query = `List real companies in ${vertical} that ${profile.slice(0, 150)}. ${products ? `They should use or need: ${products}.` : ""} For each company provide the name and website domain.`;
  } else {
    query = `List real companies matching: ${job.query}. For each company provide the name and website domain.`;
  }

  // Get existing companies
  const existingMembers = await prisma.aBMListMember.findMany({
    where: { listId: job.listId },
    include: { account: { select: { company: true, domain: true } } },
  });
  const existingNames = new Set(existingMembers.map(m => m.account.company.toLowerCase()));
  const criteriaRegions = criteria?.regions?.length ? criteria.regions : null;

  // Query Perplexica
  const discovered = new Map();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${PERPLEXICA_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatModel: { providerId: PERPLEXICA_CHAT_PROVIDER_ID, key: PERPLEXICA_CHAT_MODEL },
        embeddingModel: { providerId: PERPLEXICA_EMBED_PROVIDER_ID, key: PERPLEXICA_EMBED_MODEL },
        optimizationMode: "speed",
        sources: ["web"],
        query,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[Perplexica Discovery] API error: ${res.status}`);
      return { generated: 0, newCount: 0, added: 0 };
    }
    const data = await res.json();

    // Extract companies from sources
    for (const s of (data.sources || [])) {
      try {
        const url = new URL(s.metadata?.url || "");
        const domain = url.hostname.replace(/^www\./, "");
        if (/\b(wikipedia|youtube|reddit|github|medium|twitter|facebook|google|yelp|bbb|crunchbase|linkedin|glassdoor|indeed|g2|capterra|trustradius|getapp|softwareadvice)\b/.test(domain)) continue;
        const title = s.metadata?.title || "";
        // Skip news/blog/article domains
        const lowerDomain = domain.toLowerCase();
        if ([...BLOCKED_DOMAINS].some(d => lowerDomain.includes(d))) continue;
        // Skip generic content sites
        if (/^(tech|news|blog|article|post|list|top|best|guide|review|summary)/.test(lowerDomain)) continue;
        // Skip if title looks like a listicle/article
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes("how ") || lowerTitle.includes("what is ") ||
            lowerTitle.includes("top ") || lowerTitle.match(/\b\d+\b/) ||
            lowerTitle.includes("company that") || lowerTitle.includes("companies that")) continue;
        if (discovered.has(domain)) continue;
        const companyName = title.split(/[|\-–—]/)[0].trim();
        if (!companyName || companyName.length < 2) continue;
        if (existingNames.has(companyName.toLowerCase())) continue;
        if (isCompetitor(companyName, domain)) {
          console.log(`[Competitor filter] Skipped "${companyName}" (${domain}) — Telnyx competitor`);
          continue;
        }

        discovered.set(domain, {
          company: companyName,
          domain,
          description: (s.content || "").slice(0, 200),
          country: null,
          region: null,
          vertical: criteria?.vertical || null,
          productFit: criteria?.productFit?.[0] || null,
        });
      } catch {} // invalid URL
    }
  } catch (e) {
    if (PERPLEXICA_ENABLED) console.error(`[Perplexica Discovery] Search error: ${e.message}`);
    return { generated: 0, newCount: 0, added: 0 };
  }

  let companies = Array.from(discovered.values()).slice(0, WAVE_SIZE);
  console.log(`[Perplexica Discovery] Found ${companies.length} candidate companies`);

  if (companies.length === 0) return { generated: 0, newCount: 0, added: 0 };

  // Use AI to enrich with country/region for discovered companies
  if (companies.length > 0) {
    try {
      const enrichPrompt = `For each company below, provide the HQ country. Return ONLY a JSON array with the same order:
${companies.map((c, i) => `${i}. ${c.company} (${c.domain})`).join("\n")}

Return: [{"country":"US","region":"AMER"},...] — use AMER/EMEA/APAC/MENA regions.`;
      const enrichResponse = await callAI([{ role: "user", content: enrichPrompt }]);
      try {
        const cleaned = enrichResponse.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const enriched = JSON.parse(cleaned);
        for (let i = 0; i < Math.min(companies.length, enriched.length); i++) {
          companies[i].country = enriched[i]?.country || null;
          const resolved = resolveRegion(enriched[i]?.country);
          companies[i].region = resolved || enriched[i]?.region || null;
        }
      } catch {}
    } catch {}
  }

  // Filter by region if needed
  if (criteriaRegions) {
    companies = companies.filter(c => {
      if (!c.region || !criteriaRegions.includes(c.region)) {
        console.log(`[Region filter] Rejected Perplexica discovery "${c.company}" — ${c.region || "unknown"}, wanted: ${criteriaRegions.join(",")}`);
        return false;
      }
      return true;
    });
  }

  // Validate through the same pipeline
  const validated = await validateCandidates(companies);

  // Log validation results
  const counts = { validated: 0, unverified: 0, rejected: 0, clearbit: 0, perplexica: 0, dns: 0, icpFiltered: 0 };
  for (const c of validated) {
    const s = scoreToStatus(c.confidenceScore);
    counts[s]++;
    if (c.validationSignals.clearbit) counts.clearbit++;
    if (c.validationSignals.perplexica) counts.perplexica++;
    if (c.validationSignals.dns) counts.dns++;
    if (c.rejectReason) counts.icpFiltered++;
  }
  console.log(`[Job ${job.id}] Perplexica Discovery: ${validated.length} candidates → ${counts.validated} validated, ${counts.unverified} unverified, ${counts.rejected} rejected`);
  console.log(`[Job ${job.id}] Clearbit: ${counts.clearbit}/${validated.length}, Perplexica: ${counts.perplexica}/${validated.length}, DNS: ${counts.dns}/${validated.length}, ICP Filtered: ${counts.icpFiltered}`);

  // Save non-rejected to DB
  const memberStatus = job.jobType === "expand" ? "pending" : "active";
  const addedBy = job.jobType === "expand" ? "expansion" : "perplexica-discovery";
  let added = 0;

  for (const c of validated) {
    const status = scoreToStatus(c.confidenceScore);
    if (status === "rejected") {
      console.log(`[Job ${job.id}] Rejected (score ${c.confidenceScore}): ${c.company}`);
      continue;
    }

    try {
      let account = await prisma.aBMAccount.findFirst({
        where: { company: { equals: c.company, mode: "insensitive" } },
      });

      if (account && criteriaRegions && account.region && !criteriaRegions.includes(account.region)) continue;

      // Build notes JSON with validation data
      const notesData = {
        description: c.description || null,
        confidenceScore: c.confidenceScore,
        validationSignals: c.validationSignals,
        clearbitData: c.clearbitData || null,
        icpMatch: c.icpMatch || null,
        rejectReason: c.rejectReason || null,
        validatedAt: new Date().toISOString(),
      };

      if (!account) {
        account = await prisma.aBMAccount.create({
          data: {
            company: c.company,
            domain: c.domain || null,
            country: c.country || null,
            region: c.region || null,
            vertical: c.vertical || null,
            status,
            source: "perplexica-discovery",
            productFit: c.productFit || null,
            notes: JSON.stringify(notesData),
          },
        });
      } else {
        const updates = {};
        if (!account.productFit && c.productFit) updates.productFit = c.productFit;
        if (!account.region && c.region) updates.region = c.region;
        // Update notes with validation data
        updates.notes = JSON.stringify(notesData);
        if (status === "validated" && account.status === "identified") updates.status = status;
        if (Object.keys(updates).length > 0) {
          await prisma.aBMAccount.update({ where: { id: account.id }, data: updates });
        }
      }

      try {
        await prisma.aBMListMember.create({
          data: { listId: job.listId, accountId: account.id, status: memberStatus, addedBy, reason: job.jobType === "expand" ? job.query : null },
        });
        added++;
      } catch {} // already in list
    } catch {}
  }

  return { generated: companies.length + validated.filter(v => scoreToStatus(v.confidenceScore) === "rejected").length, newCount: companies.length, added };
}

// Country → Region mapping (HQ-based, not "operates in")
const COUNTRY_REGION = {
  // AMER
  "US": "AMER", "USA": "AMER", "United States": "AMER", "Canada": "AMER", "Mexico": "AMER",
  "Brazil": "AMER", "Argentina": "AMER", "Colombia": "AMER", "Chile": "AMER", "Peru": "AMER",
  "Costa Rica": "AMER", "Panama": "AMER", "Uruguay": "AMER", "Ecuador": "AMER", "Venezuela": "AMER",
  "Dominican Republic": "AMER", "Guatemala": "AMER", "Puerto Rico": "AMER", "Jamaica": "AMER",
  // EMEA - Europe
  "UK": "EMEA", "United Kingdom": "EMEA", "Germany": "EMEA", "France": "EMEA", "Netherlands": "EMEA",
  "Spain": "EMEA", "Italy": "EMEA", "Sweden": "EMEA", "Norway": "EMEA", "Denmark": "EMEA",
  "Finland": "EMEA", "Ireland": "EMEA", "Belgium": "EMEA", "Austria": "EMEA", "Switzerland": "EMEA",
  "Portugal": "EMEA", "Poland": "EMEA", "Czech Republic": "EMEA", "Romania": "EMEA", "Hungary": "EMEA",
  "Greece": "EMEA", "Croatia": "EMEA", "Bulgaria": "EMEA", "Slovakia": "EMEA", "Slovenia": "EMEA",
  "Estonia": "EMEA", "Latvia": "EMEA", "Lithuania": "EMEA", "Luxembourg": "EMEA", "Malta": "EMEA",
  "Cyprus": "EMEA", "Iceland": "EMEA", "Serbia": "EMEA", "Montenegro": "EMEA", "Albania": "EMEA",
  "Bosnia": "EMEA", "North Macedonia": "EMEA", "Moldova": "EMEA", "Ukraine": "EMEA",
  "Georgia": "EMEA", "Armenia": "EMEA",
  // EMEA - Africa
  "South Africa": "EMEA", "Nigeria": "EMEA", "Kenya": "EMEA", "Egypt": "EMEA", "Ghana": "EMEA",
  "Tanzania": "EMEA", "Ethiopia": "EMEA", "Rwanda": "EMEA", "Senegal": "EMEA",
  // MENA
  "UAE": "MENA", "United Arab Emirates": "MENA", "Saudi Arabia": "MENA", "Israel": "MENA",
  "Turkey": "MENA", "Qatar": "MENA", "Kuwait": "MENA", "Bahrain": "MENA", "Oman": "MENA",
  "Jordan": "MENA", "Lebanon": "MENA", "Morocco": "MENA", "Tunisia": "MENA", "Iraq": "MENA",
  "Iran": "MENA", "Pakistan": "MENA",
  // APAC
  "India": "APAC", "China": "APAC", "Japan": "APAC", "South Korea": "APAC", "Australia": "APAC",
  "New Zealand": "APAC", "Singapore": "APAC", "Indonesia": "APAC", "Malaysia": "APAC",
  "Thailand": "APAC", "Vietnam": "APAC", "Philippines": "APAC", "Taiwan": "APAC",
  "Hong Kong": "APAC", "Bangladesh": "APAC", "Sri Lanka": "APAC", "Myanmar": "APAC",
  "Cambodia": "APAC", "Nepal": "APAC",
};

function resolveRegion(country) {
  if (!country) return null;
  if (COUNTRY_REGION[country]) return COUNTRY_REGION[country];
  const lower = country.toLowerCase();
  for (const [k, v] of Object.entries(COUNTRY_REGION)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}
const MAX_DRY_STREAK = 3;
const POLL_INTERVAL_MS = 5000;
const WAVE_DELAY_MS = 5000;

async function callAI(messages, retries = 3) {
  // Try each backend, with retries per backend
  for (let b = activeBackend; b < AI_BACKENDS.length; b++) {
    const backend = AI_BACKENDS[b];
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        const res = await fetch(`${backend.url}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${backend.token}` },
          body: JSON.stringify({ model: backend.model, messages, max_tokens: 8000, max_output_tokens: 8000 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`AI call failed: ${res.status} ${err.slice(0, 200)}`);
        }
        const data = await res.json();
        if (b !== activeBackend) {
          console.log(`[AI] Switched to backend ${b}: ${backend.url} (${backend.model})`);
          activeBackend = b;
        }
        return data.choices?.[0]?.message?.content || "";
      } catch (e) {
        console.error(`[AI] Backend ${b} attempt ${attempt}/${retries} failed: ${e.message}`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 5000 * attempt));
        }
      }
    }
    console.log(`[AI] Backend ${b} (${backend.url}) exhausted, trying next...`);
  }
  throw new Error("All AI backends failed");
}

function buildPrompt(job, existingNames, listInfo) {
  const listType = listInfo?.listType || "vertical";
  const isExpand = job.jobType === "expand";

  let criteria = null;
  try {
    criteria = JSON.parse(job.query);
    if (!criteria.targetCompanyProfile) criteria = null;
  } catch {}

  const alreadyFoundStr = existingNames.length > 0
    ? `\n\nCOMPANIES ALREADY IN THIS LIST (do NOT repeat):\n${existingNames.slice(0, 200).join(", ")}${existingNames.length > 200 ? `\n... and ${existingNames.length - 200} more` : ""}`
    : "";

  if (criteria) {
    const regionStr = criteria.regions?.length ? `Target regions: ${criteria.regions.join(", ")}` : "";
    const productStr = criteria.productFit?.length ? `Product fit: ${criteria.productFit.join(", ")}` : "";
    const providerStr = criteria.includeProviders?.length ? `\nTarget companies using: ${criteria.includeProviders.join(", ")}. Include "currentProvider" and "switchSignal" fields.` : "";
    const exampleStr = criteria.exampleCompanies?.length ? `\nExample companies (find SIMILAR ones, not these exact ones): ${criteria.exampleCompanies.join(", ")}` : "";
    const excludeStr = criteria.excludeCompanies?.length ? `\nDO NOT include: ${criteria.excludeCompanies.join(", ")}` : "";

    return `You are an ABM research agent for Telnyx, a cloud communications company.

RESEARCH BRIEF:
${criteria.targetCompanyProfile}

${regionStr}
${productStr}
Vertical: ${criteria.vertical || "any"}${providerStr}${exampleStr}${excludeStr}

Find exactly ${WAVE_SIZE} REAL companies matching this brief. These must be actual companies that exist.${alreadyFoundStr}

Rules:
- Only real, verifiable companies
- Include the actual website domain and HQ country
- Diverse across the criteria (don't cluster on one sub-segment)
- If you can't find ${WAVE_SIZE} genuinely matching companies, return fewer rather than making them up
- NEVER include Telnyx competitors: Twilio, Vonage, Bandwidth, Plivo, Sinch, ElevenLabs, Vapi, Retell, LiveKit, Bland AI, Five9, Genesys, Nice, Talkdesk, Dialpad, RingCentral, 8x8, Nextiva, Aircall, MessageBird, Infobip, Deepgram, AssemblyAI, Poly AI, Cognigy, Kore.ai, Hologram, Agora, Resemble AI, Cartesia, Play.ht, Murf AI, WellSaid

RESPOND WITH ONLY a raw JSON array. No markdown, no code fences:
[{"company":"Name","domain":"example.com","country":"US","region":"AMER","vertical":"fintech","productFit":"voice-ai","description":"One line why relevant"${criteria.includeProviders?.length ? ',"currentProvider":"Twilio","switchSignal":"Reason they might switch"' : ""}}]

CRITICAL — Region means HEADQUARTERS location, not "operates in" or "has offices in":
- AMER = HQ in US, Canada, or Latin America
- EMEA = HQ in Europe, UK, or Africa
- APAC = HQ in Asia, Australia, New Zealand, India
- MENA = HQ in Middle East or North Africa
If criteria specify regions, EVERY company MUST be headquartered in one of those regions. Do not include companies HQ'd elsewhere.

Product Fit values: ai-agent, voice-api, sip-trunking, sms-api, iot, numbers
Note: Contact Center, Healthcare, Fintech, Travel are use cases/verticals of AI Agent — not separate products.`;
  }

  let contextLine = "";
  if (isExpand) {
    contextLine = `\nYou are EXPANDING an existing list called "${listInfo.name}". The user wants: "${job.query}". Add companies that fit this criteria AND match the list's existing focus.`;
  }

  let typeGuidance = "";
  if (listType === "conquest") {
    typeGuidance = `\nThis is a CONQUEST list — targeting companies that use a specific competitor's product.
For each company, include:
- "currentProvider": The competitor they currently use
- "switchSignal": A brief reason why they might switch
Only include companies where you have reasonable confidence about their current provider.`;
  } else if (listType === "use-case") {
    typeGuidance = `\nThis is a USE-CASE list — companies are grouped by what they need, not their industry.
Companies can come from any vertical. Focus on the use-case described in the query.
Still tag each company with their actual vertical.`;
  }

  return `You are an ABM research agent for Telnyx, a cloud communications company (Voice AI, SIP trunking, SMS API, IoT, Contact Center).

USER REQUEST: "${job.query}"${contextLine}${typeGuidance}

Find exactly ${WAVE_SIZE} REAL companies matching this request. These must be actual companies that exist.${alreadyFoundStr}

Rules:
- Only real, verifiable companies
- Include the actual website domain and HQ country
- Diverse across the criteria (don't cluster on one sub-segment)
- If you can't find ${WAVE_SIZE} genuinely matching companies, return fewer rather than making them up
- NEVER include Telnyx competitors: Twilio, Vonage, Bandwidth, Plivo, Sinch, ElevenLabs, Vapi, Retell, LiveKit, Bland AI, Five9, Genesys, Nice, Talkdesk, Dialpad, RingCentral, 8x8, Nextiva, Aircall, MessageBird, Infobip, Deepgram, AssemblyAI, Poly AI, Cognigy, Kore.ai, Hologram, Agora, Resemble AI, Cartesia, Play.ht, Murf AI, WellSaid

RESPOND WITH ONLY a raw JSON array. No markdown, no code fences:
[{"company":"Name","domain":"example.com","country":"US","region":"AMER","vertical":"fintech","productFit":"voice-ai","description":"One line why relevant"${listType === "conquest" ? ',"currentProvider":"Twilio","switchSignal":"Reason they might switch"' : ""}}]

CRITICAL — Region means HEADQUARTERS location, not "operates in" or "has offices in":
- AMER = HQ in US, Canada, or Latin America
- EMEA = HQ in Europe, UK, or Africa
- APAC = HQ in Asia, Australia, New Zealand, India
- MENA = HQ in Middle East or North Africa
If the request mentions a specific region, EVERY company MUST be headquartered there.

Product Fit values: ai-agent, voice-api, sip-trunking, sms-api, iot, numbers
Note: Contact Center, Healthcare, Fintech, Travel are use cases/verticals of AI Agent — not separate products.`;
}

async function runWave(job, listInfo) {
  let criteria = null;
  try {
    criteria = JSON.parse(job.query);
    if (!criteria.targetCompanyProfile) criteria = null;
  } catch {}

  const existingMembers = await prisma.aBMListMember.findMany({
    where: { listId: job.listId },
    include: { account: { select: { company: true, domain: true } } },
  });
  const existingNames = existingMembers.map(m => m.account.company.toLowerCase());

  const prompt = buildPrompt(job, existingNames, listInfo);
  const responseText = await callAI([{ role: "user", content: prompt }]);
  console.log(`[AI Response] Length: ${responseText.length}, Preview: ${responseText.slice(0, 200)}`);

  let companies = [];
  try {
    const cleaned = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    companies = JSON.parse(cleaned);
  } catch (parseErr) {
    console.log(`[Parse] Direct JSON failed: ${parseErr.message}`);
    const match = responseText.match(/\[[\s\S]*\]/);
    if (match) try { companies = JSON.parse(match[0]); } catch (e2) { console.log(`[Parse] Regex fallback failed: ${e2.message}`); }
  }
  if (!Array.isArray(companies)) { console.log(`[Parse] Not an array, got: ${typeof companies}`); companies = []; }

  // Override AI's region with our mapping
  for (const c of companies) {
    if (c.country) {
      const resolvedRegion = resolveRegion(c.country);
      if (resolvedRegion) c.region = resolvedRegion;
    }
  }

  const criteriaRegions = criteria?.regions?.length ? criteria.regions : null;

  const newCompanies = companies.filter(c => {
    if (!c.company) return false;
    if (existingNames.includes(c.company.toLowerCase())) return false;
    if (isCompetitor(c.company, c.domain)) {
      console.log(`[Competitor filter] Rejected "${c.company}" (${c.domain}) — Telnyx competitor`);
      return false;
    }
    if (criteriaRegions) {
      if (!c.region) {
        console.log(`[Region filter] Rejected "${c.company}" — no country/region, can't verify (wanted: ${criteriaRegions.join(",")})`);
        return false;
      }
      if (!criteriaRegions.includes(c.region)) {
        console.log(`[Region filter] Rejected "${c.company}" — HQ: ${c.country} (${c.region}), wanted: ${criteriaRegions.join(",")}`);
        return false;
      }
    }
    return true;
  });

  // ─── VALIDATION LAYER ───
  const validated = await validateCandidates(newCompanies);

  // Log validation results
  const counts = { validated: 0, unverified: 0, rejected: 0, clearbit: 0, perplexica: 0, dns: 0, icpFiltered: 0 };
  for (const c of validated) {
    const s = scoreToStatus(c.confidenceScore);
    counts[s]++;
    if (c.validationSignals.clearbit) counts.clearbit++;
    if (c.validationSignals.perplexica) counts.perplexica++;
    if (c.validationSignals.dns) counts.dns++;
    if (c.rejectReason) counts.icpFiltered++;
  }
  console.log(`[Job ${job.id}] Validation: ${validated.length} candidates → ${counts.validated} validated (≥${THRESHOLD.VALIDATED}), ${counts.unverified} unverified (${THRESHOLD.UNVERIFIED}-${THRESHOLD.VALIDATED - 1}), ${counts.rejected} rejected (<${THRESHOLD.UNVERIFIED})`);
  console.log(`[Job ${job.id}] Clearbit: ${counts.clearbit}/${validated.length} found, Perplexica: ${counts.perplexica}/${validated.length} confirmed, DNS: ${counts.dns}/${validated.length} resolved, ICP Filtered: ${counts.icpFiltered}`);

  // For expand jobs, new members start as "pending" for review
  const memberStatus = job.jobType === "expand" ? "pending" : "active";
  const addedBy = job.jobType === "expand" ? "expansion" : "research-agent";

  // Save validated + unverified, skip rejected
  let added = 0;
  for (const c of validated) {
    const status = scoreToStatus(c.confidenceScore);
    if (status === "rejected") {
      console.log(`[Job ${job.id}] Rejected (score ${c.confidenceScore}): ${c.company}`);
      continue;
    }

    try {
      let account = await prisma.aBMAccount.findFirst({
        where: { company: { equals: c.company, mode: "insensitive" } },
      });

      if (account && criteriaRegions && account.region && !criteriaRegions.includes(account.region)) {
        console.log(`[Region filter] Skipped existing "${account.company}" — HQ: ${account.country} (${account.region}), wanted: ${criteriaRegions.join(",")}`);
        continue;
      }

      // Build notes JSON with validation data
      const notesData = {
        description: c.description || null,
        confidenceScore: c.confidenceScore,
        validationSignals: c.validationSignals,
        clearbitData: c.clearbitData || null,
        icpMatch: c.icpMatch || null,
        rejectReason: c.rejectReason || null,
        validatedAt: new Date().toISOString(),
      };

      if (!account) {
        account = await prisma.aBMAccount.create({
          data: {
            company: c.company,
            domain: c.domain || null,
            country: c.country || null,
            region: c.region || null,
            vertical: c.vertical || null,
            status,
            source: "research-agent",
            productFit: c.productFit || null,
            currentProvider: c.currentProvider || null,
            switchSignal: c.switchSignal || null,
            notes: JSON.stringify(notesData),
          },
        });
      } else {
        const updates = {};
        if (!account.currentProvider && c.currentProvider) updates.currentProvider = c.currentProvider;
        if (!account.switchSignal && c.switchSignal) updates.switchSignal = c.switchSignal;
        if (!account.productFit && c.productFit) updates.productFit = c.productFit;
        if (!account.region && c.region) updates.region = c.region;
        // Always update notes with latest validation data
        updates.notes = JSON.stringify(notesData);
        // Upgrade status if validated and currently just "identified"
        if (status === "validated" && account.status === "identified") updates.status = status;
        if (Object.keys(updates).length > 0) {
          await prisma.aBMAccount.update({ where: { id: account.id }, data: updates });
        }
      }

      try {
        await prisma.aBMListMember.create({
          data: {
            listId: job.listId,
            accountId: account.id,
            status: memberStatus,
            addedBy,
            reason: job.jobType === "expand" ? job.query : null,
          },
        });
        added++;
      } catch {} // already in list
    } catch (e) {
      // Skip on error
    }
  }

  return { generated: companies.length, newCount: newCompanies.length, added };
}

async function processJob(job) {
  console.log(`[Job ${job.id}] Starting (${job.jobType}): "${job.query}" (target: ${job.target})`);

  const listInfo = await prisma.aBMList.findUnique({ where: { id: job.listId } });

  await prisma.aBMJob.update({ where: { id: job.id }, data: { status: "running" } });

  let waveNumber = 0;
  while (true) {
    const current = await prisma.aBMJob.findUnique({ where: { id: job.id } });
    if (!current || current.status === "cancelled") {
      console.log(`[Job ${job.id}] Cancelled`);
      return;
    }

    if (current.found >= current.target) {
      console.log(`[Job ${job.id}] Target reached: ${current.found}/${current.target}`);
      break;
    }
    if (current.dryStreak >= MAX_DRY_STREAK) {
      console.log(`[Job ${job.id}] Dry streak limit: ${current.dryStreak} waves with <3 new`);
      break;
    }

    waveNumber++;
    try {
      console.log(`[Job ${job.id}] Wave ${waveNumber} (found: ${current.found}/${current.target}) [${waveNumber % 2 === 0 ? "Perplexica Discovery" : "AI Generation"}]`);

      let result;
      // Alternate: odd waves = AI, even waves = Perplexica discovery
      if (waveNumber % 2 === 0) {
        result = await perplexicaDiscoveryWave(current, listInfo);
      } else {
        result = await runWave(current, listInfo);
      }

      const isDry = result.added < 3;
      await prisma.aBMJob.update({
        where: { id: job.id },
        data: {
          waves: { increment: 1 },
          found: { increment: result.added },
          dryStreak: isDry ? { increment: 1 } : 0,
          lastWaveAt: new Date(),
        },
      });

      const memberCount = await prisma.aBMListMember.count({ where: { listId: current.listId } });
      await prisma.aBMList.update({ where: { id: current.listId }, data: { count: memberCount } });

      console.log(`[Job ${job.id}] Wave done: +${result.added} (generated ${result.generated}, new ${result.newCount})`);
    } catch (e) {
      console.error(`[Job ${job.id}] Wave error:`, e.message);
      await prisma.aBMJob.update({
        where: { id: job.id },
        data: { waves: { increment: 1 }, dryStreak: { increment: 1 }, lastWaveAt: new Date() },
      });
    }

    await new Promise(r => setTimeout(r, WAVE_DELAY_MS));
  }

  await prisma.aBMJob.update({ where: { id: job.id }, data: { status: "done" } });
  const final = await prisma.aBMJob.findUnique({ where: { id: job.id } });
  const totalMembers = await prisma.aBMListMember.count({ where: { listId: job.listId } });
  console.log(`[Job ${job.id}] Complete: ${final.found} companies in ${final.waves} waves`);

  const listName = listInfo?.name || "Unknown list";
  const jobVerb = job.jobType === "expand" ? "expanded" : "built";
  await notifyTelegram(`<b>ABM List ${jobVerb}</b>\n${listName}: +${final.found} companies (${totalMembers} total)\n${final.waves} waves`);
}

async function pollLoop() {
  console.log("ABM Worker started. Polling for jobs...");
  console.log(`[Config] Clearbit: ${CLEARBIT_KEY ? "configured" : "MISSING"}, Perplexica: ${PERPLEXICA_ENABLED ? PERPLEXICA_URL : "disabled"}`);

  while (true) {
    try {
      const jobs = await prisma.aBMJob.findMany({
        where: { status: { in: ["queued", "running"] } },
        orderBy: { createdAt: "asc" },
        take: 2,
      });

      for (const job of jobs) {
        processJob(job).catch(async (e) => {
          console.error(`[Job ${job.id}] Fatal error:`, e.message);
          await prisma.aBMJob.update({ where: { id: job.id }, data: { status: "failed", error: e.message } }).catch(() => {});
          const listInfo = await prisma.aBMList.findUnique({ where: { id: job.listId } }).catch(() => null);
          await notifyTelegram(`<b>ABM Job Failed</b>\n${listInfo?.name || job.id}\nError: ${e.message.slice(0, 200)}`);
        });
      }

      if (jobs.length === 0) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      } else {
        await new Promise(r => setTimeout(r, 30000));
      }
    } catch (e) {
      console.error("Poll error:", e.message);
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

pollLoop();
