/**
 * ABM Research Worker v2 — Two-Pass Architecture
 * 
 * Pass 1 (Discovery): Broad sourcing from multiple inputs → raw candidate pool
 * Pass 2 (Validation): Bulk validation with strict quality gates → saved list
 *
 * Changes from v1:
 * - Country-specific AI prompts (not vague "EMEA")
 * - Discovery phase dumps all candidates before validating
 * - Dedup before validation (saves API calls)
 * - Bulk validation in one efficient pass
 * - Gemini 2.5 Pro for discovery (more accurate), Kimi K2.5 fallback
 * - Stricter quality gates: Clearbit required, tier1/tier2 only, region verified
 */

const { PrismaClient } = require("@prisma/client");
const dns = require("dns");
const { ARCHETYPES, NEGATIVE_CLASSES } = require("./lib/abm_archetypes");
const prisma = new PrismaClient();

// ─── AI Backends ─────────────────────────────────────────────
// Discovery: Gemini 2.5 Flash (recent training data) + Kimi K2.5 fallback
// Note: Google Search grounding not supported via LiteLLM proxy currently
const AI_BACKENDS = [
  { url: "http://litellm-aiswe.query.prod.telnyx.io:4000/v1", token: process.env.LITELLM_API_KEY || "sk-JcJEnHgGiRKTnIdkGfv3Rw", model: "gemini/gemini-2.5-flash-lite" },
  { url: "http://litellm-aiswe.query.prod.telnyx.io:4000/v1", token: process.env.LITELLM_API_KEY || "sk-JcJEnHgGiRKTnIdkGfv3Rw", model: "openai/gpt-4.1-mini" },
];
let activeBackend = 0;

// ─── Config ──────────────────────────────────────────────────
const DISCOVERY_WAVE_SIZE = 25; // Per-country AI waves
const MIN_CANDIDATES_FOR_VALIDATION = 50; // Don't validate until we have enough
const MAX_VALIDATION_BATCH = 800; // Cap validation pool

// Validation API keys
const CLEARBIT_KEY = process.env.CLEARBIT_API_KEY || "sk_6a6f1e4c6f26338d6340d688ad197d48";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "BSAsk8vZjTl-aldJt4FA2jxxd3tvYmA";

// Brave Search config
const BRAVE_SEARCH_URL = process.env.BRAVE_SEARCH_URL || "http://localhost:3001";
const BRAVE_CHAT_PROVIDER_ID = process.env.BRAVE_CHAT_PROVIDER_ID || "449be310-cb57-4601-86af-a3fd02362ad7";
const BRAVE_CHAT_MODEL = process.env.BRAVE_CHAT_MODEL || "openai/gpt-4o-mini";
const BRAVE_EMBED_PROVIDER_ID = process.env.BRAVE_EMBED_PROVIDER_ID || "a8688d79-9404-4e04-b046-cdd7bb979fef";
const BRAVE_EMBED_MODEL = process.env.BRAVE_EMBED_MODEL || "Xenova/all-MiniLM-L6-v2";
const BRAVE_SEARCH_ENABLED = false; // Perplexica local service (disabled)
const BRAVE_WEB_SEARCH_ENABLED = true; // Brave Search API for live web discovery

// Scoring weights
const SCORE = { CLEARBIT: 40, DNS: 20, BRAVE_SEARCH: 20, LINKEDIN: 10, AI_BASELINE: 10 };
const THRESHOLD = { VALIDATED: 70, UNVERIFIED: 50 };

// Telegram
const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo";
const TG_CHAT_ID = "-1003786506284";
const TG_THREAD_ID = 164;
const TG_ENABLED = process.env.TG_NOTIFICATIONS !== "false";

// ─── Country → Region mapping (with ISO codes) ──────────────
const COUNTRY_REGION = {
  // AMER
  "US": "AMER", "USA": "AMER", "United States": "AMER", "CA": "AMER", "Canada": "AMER", "MX": "AMER", "Mexico": "AMER",
  "BR": "AMER", "Brazil": "AMER", "AR": "AMER", "Argentina": "AMER", "CO": "AMER", "Colombia": "AMER", "CL": "AMER", "Chile": "AMER", "PE": "AMER", "Peru": "AMER",
  "CR": "AMER", "Costa Rica": "AMER", "PA": "AMER", "Panama": "AMER", "UY": "AMER", "Uruguay": "AMER", "EC": "AMER", "Ecuador": "AMER", "VE": "AMER", "Venezuela": "AMER",
  "DO": "AMER", "Dominican Republic": "AMER", "GT": "AMER", "Guatemala": "AMER", "PR": "AMER", "Puerto Rico": "AMER", "JM": "AMER", "Jamaica": "AMER",
  // EMEA - Europe
  "UK": "EMEA", "GB": "EMEA", "United Kingdom": "EMEA", "DE": "EMEA", "Germany": "EMEA", "FR": "EMEA", "France": "EMEA", "NL": "EMEA", "Netherlands": "EMEA",
  "ES": "EMEA", "Spain": "EMEA", "IT": "EMEA", "Italy": "EMEA", "SE": "EMEA", "Sweden": "EMEA", "NO": "EMEA", "Norway": "EMEA", "DK": "EMEA", "Denmark": "EMEA",
  "FI": "EMEA", "Finland": "EMEA", "IE": "EMEA", "Ireland": "EMEA", "BE": "EMEA", "Belgium": "EMEA", "AT": "EMEA", "Austria": "EMEA", "CH": "EMEA", "Switzerland": "EMEA",
  "PT": "EMEA", "Portugal": "EMEA", "PL": "EMEA", "Poland": "EMEA", "CZ": "EMEA", "Czech Republic": "EMEA", "Czechia": "EMEA", "RO": "EMEA", "Romania": "EMEA", "HU": "EMEA", "Hungary": "EMEA",
  "GR": "EMEA", "Greece": "EMEA", "HR": "EMEA", "Croatia": "EMEA", "BG": "EMEA", "Bulgaria": "EMEA", "SK": "EMEA", "Slovakia": "EMEA", "SI": "EMEA", "Slovenia": "EMEA",
  "EE": "EMEA", "Estonia": "EMEA", "LV": "EMEA", "Latvia": "EMEA", "LT": "EMEA", "Lithuania": "EMEA", "LU": "EMEA", "Luxembourg": "EMEA", "MT": "EMEA", "Malta": "EMEA",
  "CY": "EMEA", "Cyprus": "EMEA", "IS": "EMEA", "Iceland": "EMEA", "RS": "EMEA", "Serbia": "EMEA", "ME": "EMEA", "Montenegro": "EMEA", "AL": "EMEA", "Albania": "EMEA",
  "BA": "EMEA", "Bosnia": "EMEA", "MK": "EMEA", "North Macedonia": "EMEA", "MD": "EMEA", "Moldova": "EMEA", "UA": "EMEA", "Ukraine": "EMEA",
  "GE": "EMEA", "Georgia": "EMEA", "AM": "EMEA", "Armenia": "EMEA",
  // EMEA - Africa
  "ZA": "EMEA", "South Africa": "EMEA", "NG": "EMEA", "Nigeria": "EMEA", "KE": "EMEA", "Kenya": "EMEA", "EG": "EMEA", "Egypt": "EMEA", "GH": "EMEA", "Ghana": "EMEA",
  "TZ": "EMEA", "Tanzania": "EMEA", "ET": "EMEA", "Ethiopia": "EMEA", "RW": "EMEA", "Rwanda": "EMEA", "SN": "EMEA", "Senegal": "EMEA",
  // MENA
  "AE": "MENA", "UAE": "MENA", "United Arab Emirates": "MENA", "SA": "MENA", "Saudi Arabia": "MENA", "IL": "MENA", "Israel": "MENA",
  "TR": "MENA", "Turkey": "MENA", "QA": "MENA", "Qatar": "MENA", "KW": "MENA", "Kuwait": "MENA", "BH": "MENA", "Bahrain": "MENA", "OM": "MENA", "Oman": "MENA",
  "JO": "MENA", "Jordan": "MENA", "LB": "MENA", "Lebanon": "MENA", "MA": "MENA", "Morocco": "MENA", "TN": "MENA", "Tunisia": "MENA", "IQ": "MENA", "Iraq": "MENA",
  "IR": "MENA", "Iran": "MENA", "PK": "MENA", "Pakistan": "MENA",
  // APAC
  "IN": "APAC", "India": "APAC", "CN": "APAC", "China": "APAC", "JP": "APAC", "Japan": "APAC", "KR": "APAC", "South Korea": "APAC", "AU": "APAC", "Australia": "APAC",
  "NZ": "APAC", "New Zealand": "APAC", "SG": "APAC", "Singapore": "APAC", "ID": "APAC", "Indonesia": "APAC", "MY": "APAC", "Malaysia": "APAC",
  "TH": "APAC", "Thailand": "APAC", "VN": "APAC", "Vietnam": "APAC", "PH": "APAC", "Philippines": "APAC", "TW": "APAC", "Taiwan": "APAC",
  "HK": "APAC", "Hong Kong": "APAC", "BD": "APAC", "Bangladesh": "APAC", "LK": "APAC", "Sri Lanka": "APAC", "MM": "APAC", "Myanmar": "APAC",
  "KH": "APAC", "Cambodia": "APAC", "NP": "APAC", "Nepal": "APAC",
};

// Countries to target per region for country-specific prompts
const REGION_COUNTRIES = {
  EMEA: [
    { country: "United Kingdom", code: "GB" },
    { country: "UK", code: "GB" },
    { country: "Germany", code: "DE" },
    { country: "France", code: "FR" },
    { country: "Netherlands", code: "NL" },
    { country: "Sweden", code: "SE" },
    { country: "Denmark", code: "DK" },
    { country: "Ireland", code: "IE" },
    { country: "Spain", code: "ES" },
    { country: "Italy", code: "IT" },
    { country: "Switzerland", code: "CH" },
    { country: "Finland", code: "FI" },
    { country: "Norway", code: "NO" },
    { country: "Belgium", code: "BE" },
    { country: "Poland", code: "PL" },
    { country: "Estonia", code: "EE" },
    { country: "Ukraine", code: "UA" },
    { country: "Greece", code: "GR" },
    { country: "Czech Republic", code: "CZ" },
    { country: "Portugal", code: "PT" },
    { country: "Austria", code: "AT" },
    { country: "Romania", code: "RO" },
    { country: "Hungary", code: "HU" },
    { country: "Croatia", code: "HR" },
    { country: "Bulgaria", code: "BG" },
    { country: "Serbia", code: "RS" },
    { country: "Lithuania", code: "LT" },
    { country: "Latvia", code: "LV" },
    { country: "Luxembourg", code: "LU" },
    { country: "Slovakia", code: "SK" },
    { country: "Slovenia", code: "SI" },
    { country: "Iceland", code: "IS" },
  ],
  AMER: [
    { country: "United States", code: "US" },
    { country: "Canada", code: "CA" },
    { country: "Brazil", code: "BR" },
    { country: "Mexico", code: "MX" },
  ],
  APAC: [
    { country: "Australia", code: "AU" },
    { country: "India", code: "IN" },
    { country: "Japan", code: "JP" },
    { country: "Singapore", code: "SG" },
    { country: "South Korea", code: "KR" },
    { country: "New Zealand", code: "NZ" },
    { country: "Malaysia", code: "MY" },
    { country: "Indonesia", code: "ID" },
    { country: "Philippines", code: "PH" },
    { country: "Thailand", code: "TH" },
    { country: "Vietnam", code: "VN" },
    { country: "Hong Kong", code: "HK" },
    { country: "Taiwan", code: "TW" },
  ],
  MENA: [
    { country: "Israel", code: "IL" },
    { country: "United Arab Emirates", code: "AE" },
    { country: "Saudi Arabia", code: "SA" },
    { country: "Turkey", code: "TR" },
  ],
};

// ─── Exclusion & ICP Lists ──────────────────────────────────
let EXCLUSION_DATA = { competitors: [], customers: [], partners: [], wonDealDomains: new Set(), openDealDomains: new Set(), openDealCompanies: [], allExcludedDomains: new Set(), abmExcludedDomains: new Set(), abmExclusionCategories: {} };
let EXCLUSION_LOADED_AT = 0;

// Competitors — same as v1
const COMPETITOR_DOMAINS = new Set([
  "twilio.com", "vonage.com", "bandwidth.com", "plivo.com", "sinch.com",
  "messagebird.com", "bird.com", "infobip.com", "clicksend.com", "kaleyra.com",
  "voximplant.com", "agora.io", "nexmo.com", "signalwire.com", "flowroute.com",
  "elevenlabs.io", "vapi.ai", "retell.ai", "livekit.io", "bland.ai",
  "deepgram.com", "assemblyai.com", "speechmatics.com", "rev.ai", "rev.com",
  "resemble.ai", "play.ht", "murf.ai", "wellsaid.com", "wellsaidlabs.com", "cartesia.ai",
  "poly.ai", "voiceflow.com", "parloa.com", "cognigy.com", "kore.ai",
  "synthflow.ai", "thoughtly.ai", "air.ai", "hamming.ai",
  "five9.com", "genesys.com", "nice.com", "talkdesk.com",
  "dialpad.com", "ringcentral.com", "8x8.com", "nextiva.com", "aircall.io",
  "nuance.com", "microsoft.com", "google.com",
  "hologram.io", "amazon.com",
]);

const NON_TARGET_COUNTRIES = ["RU", "BY", "IR", "KP", "CN", "AF", "SY", "VE", "CU", "SD"];

function resolveRegion(country) {
  if (!country) return null;
  if (COUNTRY_REGION[country]) return COUNTRY_REGION[country];
  const lower = country.toLowerCase();
  for (const [k, v] of Object.entries(COUNTRY_REGION)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function isCompetitor(company, domain) {
  if (domain) {
    const d = domain.toLowerCase().replace(/^www\./, "");
    if (COMPETITOR_DOMAINS.has(d)) return true;
  }
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────

async function callAI(messages, retries = 2) {
  for (let b = activeBackend; b < AI_BACKENDS.length; b++) {
    const backend = AI_BACKENDS[b];
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        // Build request body
        const requestBody = {
          model: backend.model,
          messages,
          max_tokens: 8192
        };

        const res = await fetch(`${backend.url}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${backend.token}` },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`AI call failed: ${res.status} ${err.slice(0, 200)}`);
        }
        const data = await res.json();
        if (b !== activeBackend) {
          console.log(`[AI] Switched to backend ${b}: ${backend.model} (search: ${backend.searchGrounding ? 'enabled' : 'disabled'})`);
          activeBackend = b;
        }
        return data.choices?.[0]?.message?.content || "";
      } catch (e) {
        console.error(`[AI] Backend ${b} attempt ${attempt}/${retries} failed: ${e.message}`);
        if (attempt < retries) await new Promise(r => setTimeout(r, 5000 * attempt));
      }
    }
  }
  throw new Error("All AI backends failed");
}

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

async function loadExclusionData() {
  const now = Date.now();
  if (now - EXCLUSION_LOADED_AT < 6 * 60 * 60 * 1000 && EXCLUSION_DATA.competitors.length > 0) return EXCLUSION_DATA;
  try {
    const customers = await prisma.sFAccount.findMany({
      where: { accountType: { in: ["Customer", "Partner", "Churned"] } },
      select: { name: true, domain: true, accountType: true },
    });
    EXCLUSION_DATA.customers = customers.filter(c => c.accountType === "Customer").map(c => c.domain).filter(Boolean);
    EXCLUSION_DATA.partners = customers.filter(c => c.accountType === "Partner").map(c => c.domain).filter(Boolean);
    const churned = customers.filter(c => c.accountType === "Churned").map(c => c.domain).filter(Boolean);

    const wonDeals = await prisma.sFOpportunity.findMany({
      where: { isWon: true },
      select: { accountName: true, accountDomain: true },
      distinct: ["accountDomain"],
    });
    EXCLUSION_DATA.wonDealDomains = new Set(wonDeals.map(d => d.accountDomain).filter(Boolean));

    const openDeals = await prisma.sFOpportunity.findMany({
      where: { isClosed: false, amount: { gte: 25000 } },
      select: { accountName: true, accountDomain: true, stageName: true, amount: true },
      orderBy: { amount: "desc" },
    });
    EXCLUSION_DATA.openDealDomains = new Set(openDeals.map(d => d.accountDomain).filter(Boolean));
    const excludedDomainSet = EXCLUSION_DATA.allExcludedDomains;
    EXCLUSION_DATA.openDealCompanies = openDeals
      .filter(d => d.accountDomain && !excludedDomainSet.has(d.accountDomain))
      .slice(0, 30)
      .map(d => ({ name: d.accountName, domain: d.accountDomain, stage: d.stageName, amount: d.amount }));

    // Load ABM Exclusion Registry (categorized rejections)
    const abmExclusions = await prisma.aBMExclusion.findMany({ select: { domain: true, category: true, reason: true } });
    EXCLUSION_DATA.abmExcludedDomains = new Set(abmExclusions.map(e => e.domain.toLowerCase().replace(/^www\./, "")));
    EXCLUSION_DATA.abmExclusionCategories = {};
    for (const e of abmExclusions) {
      const d = e.domain.toLowerCase().replace(/^www\./, "");
      EXCLUSION_DATA.abmExclusionCategories[d] = { category: e.category, reason: e.reason };
    }

    const allExcluded = new Set([
      ...EXCLUSION_DATA.competitors, ...EXCLUSION_DATA.customers, ...EXCLUSION_DATA.partners,
      ...churned, ...EXCLUSION_DATA.wonDealDomains, ...EXCLUSION_DATA.abmExcludedDomains,
    ]);
    EXCLUSION_DATA.allExcludedDomains = allExcluded;
    EXCLUSION_LOADED_AT = now;
    console.log(`[Exclusions] Loaded: ${EXCLUSION_DATA.customers.length} customers, ${EXCLUSION_DATA.partners.length} partners, ${EXCLUSION_DATA.wonDealDomains.size} won deals, ${EXCLUSION_DATA.openDealCompanies.length} open deals, ${EXCLUSION_DATA.abmExcludedDomains.size} ABM exclusions`);
  } catch (err) {
    console.error("[Exclusions] Failed to load:", err.message);
  }
  return EXCLUSION_DATA;
}

// ─── Validation Functions ────────────────────────────────────

async function checkDNS(domain) {
  if (!domain) return false;
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  try { await dns.promises.resolve(cleanDomain); } catch { return false; }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://${cleanDomain}`, { method: "HEAD", redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    return res.status < 400;
  } catch {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`http://${cleanDomain}`, { method: "HEAD", redirect: "follow", signal: controller.signal });
      clearTimeout(timeout);
      return res.status < 400;
    } catch { return false; }
  }
}

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
        found: true, _rawDomain: data.domain || null, _rawName: data.name || null,
        employeeCount: data.metrics?.employeesRange || data.metrics?.employees || null,
        industry: data.category?.industry || null, sector: data.category?.sector || null,
        techUsed: data.tech ? data.tech.slice(0, 20) : null,
        funding: data.metrics?.raised || null, description: data.description || null,
        hqCountry: data.geo?.country || data.geo?.countryCode || null,
        hqState: data.geo?.state || null, hqCity: data.geo?.city || null,
      };
    }
    if (res.status === 202) return { found: false, queued: true };
    return null;
  } catch { return null; }
}

async function checkBraveSearch(companyName, domain) {
  if (!BRAVE_API_KEY || !companyName) return { found: false, linkedinFound: false };
  try {
    const cleanDomain = domain ? domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";
    const query = cleanDomain ? `${companyName} ${cleanDomain}` : companyName;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&search_lang=en`,
      { headers: { "Accept": "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": BRAVE_API_KEY }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return { found: false, linkedinFound: false };
    const data = await res.json();
    const nameLower = companyName.toLowerCase();
    let found = false, linkedinFound = false;
    const snippets = [];
    for (const r of (data.web?.results || [])) {
      const text = `${r.title || ""} ${r.description || ""} ${r.url || ""}`.toLowerCase();
      snippets.push(`${r.title || ""} ${r.description || ""}`);
      if (text.includes(nameLower) || (cleanDomain && text.includes(cleanDomain))) found = true;
      if (r.url && r.url.includes("linkedin.com/company/")) linkedinFound = true;
    }
    return { found, linkedinFound, snippets: snippets.join(" ") };
  } catch { return { found: false, linkedinFound: false }; }
}

function negativeClassMatch(candidate, clearbitData) {
  const blob = [candidate.company, candidate.domain, candidate.description, candidate.vertical, candidate.productFit,
    clearbitData?.industry, clearbitData?.sector, clearbitData?.description].filter(Boolean).join(" ").toLowerCase();
  for (const cls of NEGATIVE_CLASSES) {
    const hit = cls.keywords.find(kw => blob.includes(kw));
    if (hit) return { reject: true, reason: `${cls.label}: ${hit}` };
  }
  return { reject: false };
}

function inferArchetype(candidate, clearbitData) {
  const blob = [candidate.company, candidate.description, candidate.vertical, candidate.productFit,
    clearbitData?.industry, clearbitData?.sector, clearbitData?.description].filter(Boolean).join(" ").toLowerCase();
  for (const archetype of ARCHETYPES) {
    if (archetype.evidenceKeywords.some(kw => blob.includes(kw))) return archetype;
  }
  return null;
}

function getEvidence(candidate, clearbitData, braveSnippets) {
  const blob = [candidate.company, candidate.description, candidate.voiceSignal, candidate.evidenceSnippet,
    clearbitData?.industry, clearbitData?.sector, clearbitData?.description, braveSnippets].filter(Boolean).join(" ").toLowerCase();
  for (const archetype of ARCHETYPES) {
    for (const kw of archetype.evidenceKeywords) {
      if (blob.includes(kw)) {
        return { evidenceType: archetype.key, evidenceSnippet: kw, archetype: archetype.label };
      }
    }
  }
  if ((candidate.currentProvider || "").match(/twilio|vonage|bandwidth|plivo/i)) {
    return { evidenceType: "provider_signal", evidenceSnippet: candidate.currentProvider, archetype: inferArchetype(candidate, clearbitData)?.label || null };
  }
  return { evidenceType: null, evidenceSnippet: null, archetype: inferArchetype(candidate, clearbitData)?.label || null };
}

function assignConfidenceTier(score, hasEvidence) {
  if (score >= 80 && hasEvidence) return "tier1";
  if (score >= 60 && hasEvidence) return "tier2";
  return "tier3";
}

function scoreToStatus(score) {
  if (score >= THRESHOLD.VALIDATED) return "validated";
  if (score >= THRESHOLD.UNVERIFIED) return "unverified";
  return "rejected";
}

// ─── PASS 1: DISCOVERY ───────────────────────────────────────

/**
 * Country-specific AI discovery — generates candidates per country
 */
async function discoverByCountry(criteria, existingNames) {
  const targetRegions = criteria.regions || [];
  const countries = [];
  for (const region of targetRegions) {
    if (REGION_COUNTRIES[region]) countries.push(...REGION_COUNTRIES[region]);
  }
  if (countries.length === 0) {
    console.log("[Discovery] No target countries found for regions:", targetRegions);
    return [];
  }

  const allCandidates = [];
  const exc = EXCLUSION_DATA;
  const exampleStr = criteria.exampleCompanies?.length ? `\nExamples: ${criteria.exampleCompanies.join(", ")}` : "";
  const icpStr = exc.openDealCompanies.length > 0
    ? `\nCompanies similar to these are ideal: ${exc.openDealCompanies.slice(0, 10).map(d => d.name).join(", ")}`
    : "";

  // Process countries in batches of 6 (parallel) — speed improvement
  for (let i = 0; i < countries.length; i += 6) {
    const batch = countries.slice(i, i + 6);
    const promises = batch.map(async ({ country, code }) => {
      const prompt = `Find up to ${DISCOVERY_WAVE_SIZE} REAL companies headquartered in ${country} that build voice AI, speech technology, conversational AI, call automation, telephony, or voice agent products. Also include healthcare/fintech companies using phone calls as a core workflow (patient reminders, verification calls, dispatch).${exampleStr}${icpStr}

Rules:
- ONLY companies HQ'd in ${country}. Include the real website domain.
- Must have explicit voice/phone/call/speech evidence
- Exclude: generic SaaS, marketing tools, HR tech, carriers, ISPs, UCaaS/CCaaS vendors, CPaaS competitors
- Exclude: Twilio, Vonage, Bandwidth, Plivo, ElevenLabs, Vapi, Retell, Bland AI, Deepgram, AssemblyAI

Return ONLY a JSON array, no markdown:
[{"company":"Name","domain":"example.com","country":"${code}","description":"One line","voiceSignal":"Why they need voice/telephony"}]

Fewer accurate results > more inaccurate ones.`;

      try {
        const responseText = await callAI([{ role: "system", content: "You are a market research assistant identifying real companies for B2B research. This is standard industry analysis." }, { role: "user", content: prompt }]);
        console.log(`[Discovery] ${country} raw response (${responseText.length} chars): ${responseText.slice(0, 200)}`);
        let companies = [];
        try {
          const cleaned = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          companies = JSON.parse(cleaned);
        } catch (parseErr) {
          console.log(`[Discovery] ${country} JSON parse failed: ${parseErr.message}, trying regex...`);
          const match = responseText.match(/\[[\s\S]*\]/);
          if (match) {
            try { companies = JSON.parse(match[0]); } catch (e2) {
              // Try to fix truncated JSON by closing the array
              let truncated = match[0];
              // Remove last incomplete object and close array
              const lastBrace = truncated.lastIndexOf("}");
              if (lastBrace > 0) {
                truncated = truncated.slice(0, lastBrace + 1) + "]";
                try { companies = JSON.parse(truncated); } catch (e3) { console.log(`[Discovery] ${country} truncation fix also failed`); }
              }
            }
          }
        }
        if (!Array.isArray(companies)) { console.log(`[Discovery] ${country} result not array: ${typeof companies}`); companies = []; }

        // Tag with source country for tracking
        for (const c of companies) {
          c._sourceCountry = country;
          if (c.country) {
            const resolvedRegion = resolveRegion(c.country);
            if (resolvedRegion) c.region = resolvedRegion;
          }
        }

        console.log(`[Discovery] ${country}: ${companies.length} candidates`);
        return companies;
      } catch (e) {
        console.error(`[Discovery] ${country} failed: ${e.message}`);
        return [];
      }
    });

    const results = await Promise.all(promises);
    allCandidates.push(...results.flat());
  }

  return allCandidates;
}

/**
 * Archetype-specific discovery — second pass focusing on use-case archetypes
 * Runs per-country with specific vertical prompts (healthcare voice, fintech calls, etc.)
 */
async function discoverByArchetype(criteria, existingNames) {
  const targetRegions = criteria.regions || [];
  const countries = [];
  for (const region of targetRegions) {
    if (REGION_COUNTRIES[region]) countries.push(...REGION_COUNTRIES[region]);
  }
  if (countries.length === 0) return [];

  const archetypePrompts = [
    {
      label: "healthcare-phone",
      prompt: "that use phone calls as a core workflow — patient appointment reminders, prescription notifications, telemedicine triage, clinical communication, dispatch. Include healthtech and telehealth platforms.",
    },
    {
      label: "fintech-calls",
      prompt: "in financial services that use phone calls — debt collection, payment reminders, fraud verification calls, customer outreach. Include fintech and insurtech with call automation.",
    },
    {
      label: "speech-tech",
      prompt: "that build speech recognition, text-to-speech (TTS), speech synthesis, voice cloning, or voice analytics products. Include any company whose core product involves processing speech or voice data.",
    },
    {
      label: "contact-center-ai",
      prompt: "that build AI-powered contact center products — voicebots, virtual agents, IVR automation, predictive dialers, call routing AI, agent assist. Include CCaaS and CX automation startups.",
    },
    {
      label: "telephony-embed",
      prompt: "that embed telephony into their product — SIP trunking users, programmable voice integrations, VoIP platforms, phone number provisioning, call tracking, or PBX alternatives. Include SaaS platforms with phone/calling features built in.",
    },
  ];

  const allCandidates = [];

  // For top countries by market size, run archetype prompts
  const topCountries = countries.slice(0, 12);

  for (const archetype of archetypePrompts) {
    // Process 6 countries at a time — speed improvement
    for (let i = 0; i < topCountries.length; i += 6) {
      const batch = topCountries.slice(i, i + 6);
      const promises = batch.map(async ({ country, code }) => {
        const prompt = `Find up to 15 REAL companies headquartered in ${country} ${archetype.prompt}

Rules:
- ONLY companies HQ'd in ${country}. Include the real website domain.
- Must have explicit voice/phone/call/speech evidence
- Exclude: generic SaaS without phone features, marketing tools, HR tech, carriers, ISPs, UCaaS/CCaaS vendors, CPaaS competitors
- Exclude: Twilio, Vonage, Bandwidth, Plivo, ElevenLabs, Vapi, Retell, Bland AI, Deepgram, AssemblyAI

Return ONLY a JSON array, no markdown:
[{"company":"Name","domain":"example.com","country":"${code}","description":"One line","voiceSignal":"Why they need voice/telephony"}]

Fewer accurate results > more inaccurate ones.`;

        try {
          const responseText = await callAI([{ role: "system", content: "You are a market research assistant identifying real companies for B2B research. This is standard industry analysis." }, { role: "user", content: prompt }]);
          let companies = [];
          try {
            const cleaned = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
            companies = JSON.parse(cleaned);
          } catch {
            const match = responseText.match(/\[[\s\S]*\]/);
            if (match) {
              try { companies = JSON.parse(match[0]); } catch {
                let truncated = match[0];
                const lastBrace = truncated.lastIndexOf("}");
                if (lastBrace > 0) {
                  truncated = truncated.slice(0, lastBrace + 1) + "]";
                  try { companies = JSON.parse(truncated); } catch {}
                }
              }
            }
          }
          if (!Array.isArray(companies)) companies = [];

          for (const c of companies) {
            c._sourceCountry = country;
            c._archetype = archetype.label;
            if (c.country) {
              const resolvedRegion = resolveRegion(c.country);
              if (resolvedRegion) c.region = resolvedRegion;
            }
          }

          console.log(`[Archetype Discovery] ${archetype.label}/${country}: ${companies.length} candidates`);
          return companies;
        } catch (e) {
          console.error(`[Archetype Discovery] ${archetype.label}/${country} failed: ${e.message}`);
          return [];
        }
      });

      const results = await Promise.all(promises);
      allCandidates.push(...results.flat());
    }
  }

  return allCandidates;
}

/**
 * Brave Search discovery — finds real companies via web search
 */
async function discoverByBrave(criteria, existingNames) {
  if (!BRAVE_SEARCH_ENABLED) return [];

  const criteriaRegions = criteria.regions?.length ? criteria.regions : null;
  const discovered = new Map();

  const BLOCKED_DOMAINS = new Set([
    "tech.eu", "eu-startups.com", "techcrunch.com", "theverge.com", "forbes.com", "bloomberg.com",
    "linkedin.com", "glassdoor.com", "indeed.com", "g2.com", "crunchbase.com",
    "wikipedia.org", "youtube.com", "reddit.com", "github.com", "medium.com",
  ]);

  // Generate multiple search queries for broader coverage
  const queries = [
    `${criteria.vertical} companies Europe voice AI speech telephony startups`,
    `European ${criteria.vertical || 'voice AI'} startups building voice agents call automation`,
    `best ${criteria.vertical || 'conversational AI'} startups UK Germany France Netherlands`,
    `voice AI startups Europe 2024 2025 funding raised`,
    `European speech technology companies list directory`,
    `telephony voice API companies Scandinavia Nordics startups`,
    `conversational AI companies Poland Czech Romania Bulgaria startups`,
    `healthcare voice automation companies Europe telemedicine phone calls`,
    `debt collection call automation companies Europe fintech`,
    `voice bot voicebot startups Europe list top`,
  ];

  for (const query of queries) {
    try {
      // Try Brave local search first
      if (BRAVE_SEARCH_URL) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const res = await fetch(`${BRAVE_SEARCH_URL}/api/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatModel: { providerId: BRAVE_CHAT_PROVIDER_ID, key: BRAVE_CHAT_MODEL },
            embeddingModel: { providerId: BRAVE_EMBED_PROVIDER_ID, key: BRAVE_EMBED_MODEL },
            optimizationMode: "speed",
            sources: ["web"],
            query,
            stream: false,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          for (const s of (data.sources || [])) {
            try {
              const url = new URL(s.metadata?.url || "");
              const domain = url.hostname.replace(/^www\./, "");
              const lowerDomain = domain.toLowerCase();
              if (BLOCKED_DOMAINS.has(lowerDomain) || /\.(wikipedia|youtube|reddit|github|medium|linkedin|glassdoor|indeed|g2|crunchbase)\b/.test(lowerDomain)) continue;
              if (isCompetitor(null, domain)) continue;
              const title = s.metadata?.title || "";
              const companyName = title.split(/[|\-–—]/)[0].trim();
              if (!companyName || companyName.length < 2) continue;
              if (existingNames.includes(companyName.toLowerCase())) continue;
              if (discovered.has(domain)) continue;
              discovered.set(domain, {
                company: companyName, domain,
                description: (s.content || "").slice(0, 200),
                country: null, region: null,
                vertical: criteria.vertical || null,
                productFit: criteria.productFit?.[0] || null,
              });
            } catch {}
          }
        }
      }

      // Also try Brave API directly
      if (BRAVE_API_KEY) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&search_lang=en`,
          { headers: { "Accept": "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": BRAVE_API_KEY }, signal: controller.signal }
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          for (const r of (data.web?.results || [])) {
            try {
              const url = new URL(r.url || "");
              const domain = url.hostname.replace(/^www\./, "");
              const lowerDomain = domain.toLowerCase();
              if (BLOCKED_DOMAINS.has(lowerDomain)) continue;
              if (isCompetitor(null, domain)) continue;
              const title = r.title || "";
              const companyName = title.split(/[|\-–—]/)[0].trim();
              if (!companyName || companyName.length < 2) continue;
              if (existingNames.includes(companyName.toLowerCase())) continue;
              if (discovered.has(domain)) continue;
              discovered.set(domain, {
                company: companyName, domain,
                description: (r.description || "").slice(0, 200),
                country: null, region: null,
                vertical: criteria.vertical || null,
                productFit: criteria.productFit?.[0] || null,
              });
            } catch {}
          }
        }
      }

      await new Promise(r => setTimeout(r, 2000)); // Rate limit between queries
    } catch (e) {
      console.error(`[Brave Discovery] Query failed: ${e.message}`);
    }
  }

  let companies = Array.from(discovered.values());
  console.log(`[Brave Discovery] Found ${companies.length} candidate companies`);

  // Enrich discovered companies with country via AI
  if (companies.length > 0) {
    try {
      const enrichPrompt = `For each company below, provide the HQ country (ISO 2-letter code). Return ONLY a JSON array:
${companies.map((c, i) => `${i}. ${c.company} (${c.domain})`).join("\n")}

Return: [{"country":"US","region":"AMER"},...]`;
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
    } catch (e) {
      console.error(`[Brave Discovery] Country enrichment failed: ${e.message}`);
    }
  }

  // Pre-filter by region
  if (criteriaRegions) {
    companies = companies.filter(c => {
      if (!c.region || !criteriaRegions.includes(c.region)) {
        console.log(`[Brave Pre-filter] Rejected "${c.company}" — ${c.region || "unknown"}, wanted: ${criteriaRegions.join(",")}`);
        return false;
      }
      return true;
    });
  }

  return companies;
}

/**
 * Brave Web Search discovery — uses Brave Search API to find real companies from live web
 */
async function discoverByBraveWebSearch(criteria, existingNames) {
  if (!BRAVE_WEB_SEARCH_ENABLED || !BRAVE_API_KEY) return [];

  const criteriaRegions = criteria.regions?.length ? criteria.regions : null;
  const discovered = new Map();

  // Build region-specific search queries
  const regionQueries = [];
  if (criteriaRegions?.includes("EMEA")) {
    regionQueries.push(
      "voice AI companies Europe 2024 2025 2026 startups",
      "conversational AI startups UK Germany France Netherlands",
      "speech technology companies Europe telephony",
      "voice agent companies Nordic Scandinavia",
      "European AI voice automation healthcare fintech"
    );
  }
  if (criteriaRegions?.includes("APAC")) {
    regionQueries.push(
      "voice AI companies Asia Pacific 2024 2025 2026",
      "conversational AI startups Singapore Australia India",
      "speech technology companies Japan Korea China",
      "voice bot companies Southeast Asia APAC"
    );
  }

  for (const query of regionQueries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&search_lang=en`,
        {
          headers: {
            "Accept": "application/json",
            "X-Subscription-Token": BRAVE_API_KEY
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        console.log(`[Brave Web Search] Query failed: ${res.status}`);
        continue;
      }

      const data = await res.json();
      for (const result of (data.web?.results || [])) {
        try {
          const url = new URL(result.url);
          const domain = url.hostname.replace(/^www\./, "");

          // Skip blocklisted domains
          if (/(wikipedia|linkedin|crunchbase|techcrunch|forbes|bloomberg|reddit|github)/.test(domain)) continue;
          if (isCompetitor(null, domain)) continue;
          if (discovered.has(domain)) continue;

          // Extract company name from title
          const title = result.title || "";
          const companyName = title.split(/[|\-–—]/)[0].trim();
          if (!companyName || companyName.length < 3) continue;
          if (existingNames.includes(companyName.toLowerCase())) continue;

          discovered.set(domain, {
            company: companyName,
            domain,
            description: result.description || "",
            _source: "brave-web-search",
            _query: query
          });
        } catch {}
      }

      await new Promise(r => setTimeout(r, 1000)); // Rate limit
    } catch (e) {
      console.error(`[Brave Web Search] Query failed: ${e.message}`);
    }
  }

  const companies = Array.from(discovered.values());
  console.log(`[Brave Web Search] Found ${companies.length} candidate companies from ${regionQueries.length} queries`);
  return companies;
}

// ─── PASS 2: VALIDATION ──────────────────────────────────────

async function validateCandidatePool(candidates, criteriaRegions) {
  console.log(`[Validation] Starting validation of ${candidates.length} candidates`);

  // Step 0: Dedupe by domain
  const seen = new Map();
  for (const c of candidates) {
    const domain = (c.domain || "").toLowerCase().replace(/^www\./, "");
    if (!domain) continue;
    if (!seen.has(domain)) {
      seen.set(domain, c);
    } else {
      // Keep the one with more info
      const existing = seen.get(domain);
      if ((c.description || "").length > (existing.description || "").length) {
        seen.set(domain, c);
      }
    }
  }
  let pool = Array.from(seen.values());
  console.log(`[Validation] After dedup: ${pool.length} unique candidates (removed ${candidates.length - pool.length} duplicates)`);

  // Step 1: Filter competitors and excluded domains
  pool = pool.filter(c => {
    const domain = (c.domain || "").toLowerCase().replace(/^www\./, "");
    if (EXCLUSION_DATA.allExcludedDomains?.has(domain)) {
      const abmCat = EXCLUSION_DATA.abmExclusionCategories?.[domain];
      if (abmCat) {
        console.log(`[Exclusion] Rejected "${c.company}" (${domain}) — ${abmCat.category}: ${abmCat.reason}`);
      } else {
        console.log(`[Exclusion] Rejected "${c.company}" (${domain}) — in exclusion list`);
      }
      return false;
    }
    if (isCompetitor(c.company, c.domain)) {
      console.log(`[Competitor] Rejected "${c.company}" (${domain})`);
      return false;
    }
    // Pre-filter: reject non-target countries
    if (c.country && NON_TARGET_COUNTRIES.includes(c.country.toUpperCase())) {
      console.log(`[Country] Rejected "${c.company}" — non-target country: ${c.country}`);
      return false;
    }
    // Pre-filter: region check on AI-generated data (early reject obvious mismatches)
    if (criteriaRegions && c.region && !criteriaRegions.includes(c.region)) {
      console.log(`[Region Pre-filter] Rejected "${c.company}" — ${c.region}, wanted: ${criteriaRegions.join(",")}`);
      return false;
    }
    return true;
  });
  console.log(`[Validation] After exclusion/pre-filter: ${pool.length} candidates`);

  // Cap pool size
  if (pool.length > MAX_VALIDATION_BATCH) {
    console.log(`[Validation] Capping at ${MAX_VALIDATION_BATCH} candidates (had ${pool.length})`);
    pool = pool.slice(0, MAX_VALIDATION_BATCH);
  }

  // Step 2: DNS checks in parallel (batches of 15 — speed improvement)
  for (let i = 0; i < pool.length; i += 15) {
    const batch = pool.slice(i, i + 15);
    const dnsResults = await Promise.all(batch.map(c => checkDNS(c.domain)));
    for (let j = 0; j < batch.length; j++) {
      if (dnsResults[j]) {
        batch[j]._dnsOK = true;
      } else {
        batch[j]._dnsOK = false;
        batch[j]._rejectReason = "Dead domain";
        console.log(`[DNS] Dead domain: ${batch[j].domain} (${batch[j].company})`);
      }
    }
  }

  // Remove dead domains
  pool = pool.filter(c => c._dnsOK !== false);

  // Step 3: Clearbit + Brave validation (sequentially with rate limiting)
  const validated = [];
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    c.confidenceScore = SCORE.AI_BASELINE;
    c.validationSignals = { clearbit: false, dns: c._dnsOK, brave_search: false, linkedin: false };
    c.clearbitData = null;

    // DNS score
    if (c._dnsOK) c.confidenceScore += SCORE.DNS;

    // Clearbit + Brave (parallel for this candidate)
    const [cb, brave] = await Promise.all([checkClearbit(c.domain), checkBraveSearch(c.company, c.domain)]);

    if (cb && cb.found) {
      c.validationSignals.clearbit = true;
      c.confidenceScore += SCORE.CLEARBIT;
      c.clearbitData = cb;

      // Domain mismatch (acquired/repurposed)
      if (cb._rawDomain && c.domain) {
        const cbDomain = cb._rawDomain.toLowerCase().replace(/^www\./, "");
        const cDomain = c.domain.toLowerCase().replace(/^www\./, "");
        if (cbDomain && cbDomain !== cDomain) {
          c.confidenceScore = 0;
          c._rejectReason = `Domain acquired: ${cDomain} → ${cbDomain} (${cb._rawName || "?"})`;
          console.log(`[Domain Mismatch] ${c.company}: ${cDomain} → ${cbDomain}`);
          validated.push(c);
          continue;
        }
      }

      // HQ Region Check (hard gate)
      if (cb.hqCountry && criteriaRegions && criteriaRegions.length > 0) {
        const hqRegion = resolveRegion(cb.hqCountry);
        if (hqRegion && !criteriaRegions.includes(hqRegion)) {
          c.confidenceScore = 0;
          c._rejectReason = `HQ outside region: ${cb.hqCountry} (${hqRegion}), wanted: ${criteriaRegions.join(",")}`;
          console.log(`[HQ Region] Rejected "${c.company}" — Clearbit HQ: ${cb.hqCountry} (${hqRegion})`);
          validated.push(c);
          continue;
        }
        // Override AI-generated country with Clearbit truth
        if (hqRegion) {
          c.country = cb.hqCountry;
          c.region = hqRegion;
        }
      }

      // Non-target countries (sanctioned, etc.)
      if (c.country && NON_TARGET_COUNTRIES.includes(c.country.toUpperCase())) {
        c.confidenceScore = 0;
        c._rejectReason = `Non-target country: ${c.country}`;
        validated.push(c);
        continue;
      }

      // Negative class check
      const negCheck = negativeClassMatch(c, cb);
      if (negCheck.reject) {
        c.confidenceScore = 0;
        c._rejectReason = negCheck.reason;
        console.log(`[Negative Class] Rejected "${c.company}" — ${negCheck.reason}`);
        validated.push(c);
        continue;
      }

      // Clearbit sector gate — reject IT services / professional services without voice product
      const SERVICE_SECTORS = ["information technology and services", "professional services", "computer software", "outsourcing/offshoring", "staffing and recruiting"];
      if (cb.industry && SERVICE_SECTORS.some(s => cb.industry.toLowerCase().includes(s.toLowerCase()))) {
        // Allow if description explicitly mentions voice/call/telephony product
        const descLower = ((cb.description || "") + " " + (c.description || "")).toLowerCase();
        const hasVoiceProduct = descLower.includes("voice ai") || descLower.includes("speech recognition") || descLower.includes("text-to-speech") || descLower.includes("voice platform") || descLower.includes("call automation") || descLower.includes("voicebot") || descLower.includes("ivr") || descLower.includes("telephony") || descLower.includes("sip trunk") || descLower.includes("voice agent") || descLower.includes("conversational ai platform") || descLower.includes("dialer") || descLower.includes("voice api") || descLower.includes("voice recognition") || descLower.includes("speech synthesis") || descLower.includes("voice synthesis") || descLower.includes("call tracking") || descLower.includes("call recording") || descLower.includes("speech analytics") || descLower.includes("voice assistant") || descLower.includes("voice automation") || descLower.includes("automated calling")
          // Multilingual
          || descLower.includes("spracherkennung") || descLower.includes("sprachsynthese") || descLower.includes("sprachsteuerung") || descLower.includes("sprachplattform") || descLower.includes("telefonie") || descLower.includes("sprachassistent") || descLower.includes("sprachbot") || descLower.includes("sprach-ai")
          || descLower.includes("reconnaissance vocale") || descLower.includes("synthèse vocale") || descLower.includes("plateforme vocale") || descLower.includes("téléphonie") || descLower.includes("assistant vocal") || descLower.includes("automatisation d'appels") || descLower.includes("centre d'appels")
          || descLower.includes("reconocimiento de voz") || descLower.includes("síntesis de voz") || descLower.includes("plataforma de voz") || descLower.includes("telefonía") || descLower.includes("asistente de voz") || descLower.includes("automatización de llamadas") || descLower.includes("centro de llamadas")
          || descLower.includes("riconoscimento vocale") || descLower.includes("sintesi vocale") || descLower.includes("piattaforma vocale") || descLower.includes("telefonia") || descLower.includes("assistente vocale") || descLower.includes("chiamate automatiche") || descLower.includes("call center")
          || descLower.includes("språkteknologi") || descLower.includes("talegjenkjenning") || descLower.includes("stemmestyring") || descLower.includes("telefoni") || descLower.includes("stemmeassistent")
          || descLower.includes("spraakherkenning") || descLower.includes("spraaktechnologie") || descLower.includes("telefonie") || descLower.includes("stemassistent") || descLower.includes("spraakbesturing")
          || descLower.includes("rozpoznawanie mowy") || descLower.includes("synteza mowy") || descLower.includes("platforma głosowa") || descLower.includes("telefonia") || descLower.includes("asystent głosowy")
          || descLower.includes("rynanje reči") || descLower.includes("sinteza govora") || descLower.includes("govorna platforma") || descLower.includes("telefonija") || descLower.includes("glasovni asistent")
          || descLower.includes("puheäly") || descLower.includes("puheteknologia") || descLower.includes("puheentunnistus") || descLower.includes("ääniohjaus") || descLower.includes("puheassistentti");
        if (!hasVoiceProduct) {
          c.confidenceScore = 0;
          c._rejectReason = `IT/services company without voice product: ${cb.industry}`;
          console.log(`[Sector Gate] Rejected "${c.company}" — ${cb.industry}, no voice product`);
          validated.push(c);
          continue;
        }
      }
    } else {
      // Clearbit miss — fallback region gate
      if (criteriaRegions && criteriaRegions.length > 0) {
        let regionConfirmed = false;
        // Try Brave snippets
        if (brave.snippets) {
          const snippetLower = brave.snippets.toLowerCase();
          for (const [countryName, region] of Object.entries(COUNTRY_REGION)) {
            if (criteriaRegions.includes(region) && snippetLower.includes(countryName.toLowerCase())) {
              regionConfirmed = true;
              c.country = countryName;
              c.region = region;
              console.log(`[Region Fallback] Brave confirmed "${c.company}" in ${countryName} (${region})`);
              break;
            }
          }
        }
        if (!regionConfirmed) {
          const aiRegion = resolveRegion(c.country);
          if (aiRegion && criteriaRegions.includes(aiRegion)) {
            c.region = aiRegion;
            c.confidenceScore -= 10; // Penalty for unverified region
            console.log(`[Region Fallback] Unverified "${c.company}" — AI says ${c.country} (${aiRegion}), −10 confidence`);
          } else {
            c.confidenceScore = 0;
            c._rejectReason = `HQ region unverified: AI says ${c.country} (${aiRegion || "?"}), no Clearbit/Brave confirmation`;
            console.log(`[Region Fallback] Rejected "${c.company}" — can't verify region`);
            validated.push(c);
            continue;
          }
        }
      }
    }

    // Brave Search signals
    if (brave.found) {
      c.confidenceScore += SCORE.BRAVE_SEARCH;
      c.validationSignals.brave_search = true;
    }
    if (brave.linkedinFound) {
      c.confidenceScore += SCORE.LINKEDIN;
      c.validationSignals.linkedin = true;
    }

    // Evidence extraction
    const evidence = getEvidence(c, c.clearbitData, brave.snippets);
    c.evidenceType = evidence.evidenceType;
    c.evidenceSnippet = evidence.evidenceSnippet;
    c.archetype = evidence.archetype;

    // Evidence gate — must have voice/phone/call/speech evidence
    const isBpoOrCx = c.archetype && (c.archetype.includes("BPO") || c.archetype.includes("CX") || c.archetype.includes("Contact"));
    
    // Tiered evidence system
    const NOT_EVIDENCE = [
      "phone support", "customer service center", "customer support", "customer support operations",
      "appointment booking", "appointment scheduling", "patient portal", "scheduling",
      "care management", "clinical communication", "patient engagement",
      "workforce management", "identity verification",
    ];
    const SECONDARY_EVIDENCE = [
      "debt collection", "collections call center", "bpo", "call center operations", "call handling",
    ];
    const PRIMARY_EVIDENCE = [
      "voice ai", "speech recognition", "speech to text", "text to speech", "tts",
      "voice synthesis", "voice cloning", "voicebot", "conversational ai platform",
      "speech analytics", "voice agent", "voice assistant", "speech synthesis",
      "call automation", "outbound dialer", "ivr", "call tracking", "call analytics",
      "telephony", "sip trunking", "voice biometric", "dialogue system",
      "automated phone calls", "ai voice bot", "ai receptionist", "voice technology",
    ];
    
    const evidenceLower = (c.evidenceSnippet || "").toLowerCase();
    
    // Check if evidence is a NOT_EVIDENCE keyword
    if (NOT_EVIDENCE.some(ne => evidenceLower === ne || evidenceLower.includes(ne))) {
      // Not evidence — reject unless Clearbit description shows actual calling/voice
      const descLower = ((c.clearbitData?.description || "") + " " + (c.description || "")).toLowerCase();
      if (!descLower.includes("automated call") && !descLower.includes("outbound call") && !descLower.includes("voice ai") && !descLower.includes("speech") && !descLower.includes("voice assistant") && !descLower.includes("ivr")) {
        c.confidenceScore = 0;
        c._rejectReason = `Weak evidence: "${evidenceLower}" is not a voice AI buying signal`;
        console.log(`[Evidence Tier] Rejected "${c.company}" — weak evidence: ${evidenceLower}`);
        validated.push(c);
        continue;
      }
    }
    
    // Check if evidence is secondary (debt collection, BPO) — require Clearbit confirmation
    if (SECONDARY_EVIDENCE.some(se => evidenceLower.includes(se))) {
      const descLower = ((c.clearbitData?.description || "") + " " + (c.description || "")).toLowerCase();
      // Only keep if they BUILD voice/calling software, not just USE it
      if (!descLower.includes("software") && !descLower.includes("platform") && !descLower.includes("saas") && !descLower.includes("ai") && !descLower.includes("automated")) {
        c.confidenceScore = 0;
        c._rejectReason = `Secondary evidence without voice product: ${evidenceLower}`;
        console.log(`[Evidence Tier] Rejected "${c.company}" — secondary evidence without voice product (${evidenceLower})`);
        validated.push(c);
        continue;
      }
    }
    
    if (!c.evidenceType && !isBpoOrCx) {
      c.confidenceScore = 0;
      c._rejectReason = "Missing voice/telephony evidence";
      console.log(`[Evidence Gate] Rejected "${c.company}" — no voice evidence`);
      validated.push(c);
      continue;
    }

    validated.push(c);

    // Rate limit between candidates
    // Rate limit removed — batched parallel validation
  }

  return validated;
}

// ─── Save to DB ──────────────────────────────────────────────

async function saveValidatedCandidates(validated, listId, criteriaRegions, jobType, jobId) {
  const memberStatus = jobType === "expand" ? "pending" : "active";
  const addedBy = jobType === "expand" ? "expansion" : "research-agent-v2";
  let added = 0;
  const counts = { saved: 0, rejected_score: 0, rejected_no_clearbit: 0, rejected_tier3: 0, rejected_region: 0 };

  for (const c of validated) {
    const status = scoreToStatus(c.confidenceScore);

    // Rejected by validation
    if (status === "rejected" || c.confidenceScore === 0) {
      console.log(`[Save] Rejected "${c.company}" — ${c._rejectReason || `score ${c.confidenceScore}`}`);
      counts.rejected_score++;
      continue;
    }

    // Quality gate: Clearbit required
    if (!c.validationSignals.clearbit) {
      console.log(`[Quality Gate] Rejected "${c.company}" — no Clearbit data`);
      counts.rejected_no_clearbit++;
      continue;
    }

    // Quality gate: tier1 or tier2 only
    const hasEvidence = !!c.evidenceType;
    const tier = assignConfidenceTier(c.confidenceScore, hasEvidence);
    if (tier === "tier3") {
      console.log(`[Quality Gate] Rejected "${c.company}" — tier3 (score ${c.confidenceScore})`);
      counts.rejected_tier3++;
      continue;
    }

    // Region gate for existing accounts
    try {
      let account = await prisma.aBMAccount.findFirst({
        where: { company: { equals: c.company, mode: "insensitive" } },
      });

      if (account && criteriaRegions) {
        if (account.region && !criteriaRegions.includes(account.region)) {
          console.log(`[Region Gate] Skipped existing "${account.company}" — ${account.region}`);
          counts.rejected_region++;
          continue;
        }
        if (!account.region && c.region && !criteriaRegions.includes(c.region)) {
          counts.rejected_region++;
          continue;
        }
        if (!account.region && !c.region) {
          console.log(`[Region Gate] Skipped existing "${account.company}" — no region data`);
          counts.rejected_region++;
          continue;
        }
      }

      const notesData = {
        description: c.description || null,
        confidenceScore: c.confidenceScore,
        confidenceTier: tier,
        evidenceType: c.evidenceType || null,
        evidenceSnippet: c.evidenceSnippet || null,
        archetype: c.archetype || null,
        validationSignals: c.validationSignals,
        clearbitData: c.clearbitData || null,
        rejectReason: c._rejectReason || null,
        validatedAt: new Date().toISOString(),
        sourceCountry: c._sourceCountry || null,
      };

      if (!account) {
        account = await prisma.aBMAccount.create({
          data: {
            company: c.company, domain: c.domain || null,
            country: c.country || null, region: c.region || null,
            vertical: c.vertical || null, status,
            source: "research-agent-v2", productFit: c.productFit || null,
            currentProvider: c.currentProvider || null, switchSignal: c.switchSignal || null,
            notes: JSON.stringify(notesData),
          },
        });
      } else {
        const updates = {};
        if (!account.productFit && c.productFit) updates.productFit = c.productFit;
        if (!account.region && c.region) updates.region = c.region;
        updates.notes = JSON.stringify(notesData);
        if (status === "validated" && account.status === "identified") updates.status = status;
        await prisma.aBMAccount.update({ where: { id: account.id }, data: updates });
      }

      try {
        await prisma.aBMListMember.create({
          data: { listId, accountId: account.id, status: memberStatus, addedBy, reason: jobType === "expand" ? c._sourceCountry : null },
        });
        added++;
        counts.saved++;
        // Update job progress every 5 saved so the hub shows live progress
        if (added % 5 === 0 && jobId) {
          await prisma.aBMJob.update({ where: { id: jobId }, data: { found: added } }).catch(() => {});
        }
      } catch {} // already in list
    } catch (e) {
      console.error(`[Save] Error for "${c.company}": ${e.message}`);
    }
  }

  console.log(`[Save] Results: ${counts.saved} saved, ${counts.rejected_score} rejected (score), ${counts.rejected_no_clearbit} no Clearbit, ${counts.rejected_tier3} tier3, ${counts.rejected_region} region`);
  return added;
}

// ─── MAIN JOB PROCESSOR ──────────────────────────────────────

async function processJob(job) {
  console.log(`[Job ${job.id}] Starting v2 (${job.jobType}): target ${job.target}`);

  let criteria = null;
  try {
    criteria = JSON.parse(job.query);
    if (!criteria.targetCompanyProfile) criteria = null;
  } catch {}

  if (!criteria) {
    console.log(`[Job ${job.id}] No structured criteria found, falling back to v1 behavior`);
    // Fall back to v1 for simple queries
    return;
  }

  const listInfo = await prisma.aBMList.findUnique({ where: { id: job.listId } });
  await prisma.aBMJob.update({ where: { id: job.id }, data: { status: "running" } });

  // ─── PASS 1: DISCOVERY ────────────────────────────────────
  console.log(`[Job ${job.id}] === PASS 1: DISCOVERY ===`);

  // Get existing companies
  const existingMembers = await prisma.aBMListMember.findMany({
    where: { listId: job.listId },
    include: { account: { select: { company: true, domain: true } } },
  });
  const existingNames = existingMembers.map(m => m.account.company.toLowerCase());

  let allCandidates = [];

  // Source 1: Country-specific AI prompts
  console.log(`[Job ${job.id}] Source 1: Country-specific AI discovery`);
  const aiCandidates = await discoverByCountry(criteria, existingNames);
  allCandidates.push(...aiCandidates);
  console.log(`[Job ${job.id}] AI discovery: ${aiCandidates.length} candidates`);

  // Source 2: Archetype-specific discovery (2nd round)
  console.log(`[Job ${job.id}] Source 2: Archetype-specific discovery`);
  const archetypeCandidates = await discoverByArchetype(criteria, existingNames);
  allCandidates.push(...archetypeCandidates);
  console.log(`[Job ${job.id}] Archetype discovery: ${archetypeCandidates.length} candidates`);

  // Source 3: Brave Search (Perplexica local - disabled)
  console.log(`[Job ${job.id}] Source 3: Brave Search discovery (Perplexica)`);
  const braveCandidates = await discoverByBrave(criteria, existingNames);
  allCandidates.push(...braveCandidates);
  console.log(`[Job ${job.id}] Brave discovery: ${braveCandidates.length} candidates`);

  // Source 4: Brave Web Search API (live web search)
  console.log(`[Job ${job.id}] Source 4: Brave Web Search API (live)`);
  const braveWebCandidates = await discoverByBraveWebSearch(criteria, existingNames);
  allCandidates.push(...braveWebCandidates);
  console.log(`[Job ${job.id}] Brave Web Search: ${braveWebCandidates.length} candidates`);

  // Dedup total pool
  const uniqueCandidates = new Map();
  for (const c of allCandidates) {
    const domain = (c.domain || "").toLowerCase().replace(/^www\./, "");
    if (!domain) continue;
    if (existingNames.includes(c.company?.toLowerCase())) continue;
    if (!uniqueCandidates.has(domain)) {
      uniqueCandidates.set(domain, c);
    }
  }
  const candidatePool = Array.from(uniqueCandidates.values());
  console.log(`[Job ${job.id}] Total unique candidates after dedup: ${candidatePool.length} (from ${allCandidates.length} raw)`);

  // Update job with candidate pool info (don't set found yet — that's validated count)
  await prisma.aBMJob.update({
    where: { id: job.id },
    data: { status: "running", waves: 1, lastWaveAt: new Date() },
  });

  if (candidatePool.length === 0) {
    console.log(`[Job ${job.id}] No candidates found — job complete`);
    await prisma.aBMJob.update({ where: { id: job.id }, data: { status: "done", found: 0 } });
    return;
  }

  // ─── PASS 2: VALIDATION ───────────────────────────────────
  console.log(`[Job ${job.id}] === PASS 2: VALIDATION ===`);

  const criteriaRegions = criteria.regions?.length ? criteria.regions : null;
  const validated = await validateCandidatePool(candidatePool, criteriaRegions);

  // ─── SAVE ─────────────────────────────────────────────────
  console.log(`[Job ${job.id}] === SAVING ===`);

  const added = await saveValidatedCandidates(validated, job.listId, criteriaRegions, job.jobType, job.id);

  // Update job and list
  const memberCount = await prisma.aBMListMember.count({ where: { listId: job.listId } });
  await prisma.aBMJob.update({
    where: { id: job.id },
    data: { status: "done", found: added, waves: 1, dryStreak: 0, lastWaveAt: new Date() },
  });
  await prisma.aBMList.update({ where: { id: job.listId }, data: { count: memberCount } });

  console.log(`[Job ${job.id}] Complete: ${added} saved, ${memberCount} total in list`);

  const listName = listInfo?.name || "Unknown";
  await notifyTelegram(`<b>ABM List Built (v2)</b>\n${listName}: +${added} companies (${memberCount} total)\n${candidatePool.length} candidates → ${validated.filter(v => v.confidenceScore > 0).length} validated → ${added} saved`);
}

// ─── POLL LOOP ───────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;

async function pollLoop() {
  console.log("ABM Worker v2 started. Polling for jobs...");
  console.log(`[Config] Model: ${AI_BACKENDS[0].model}, Clearbit: ${CLEARBIT_KEY ? "configured" : "MISSING"}, Brave: ${BRAVE_SEARCH_ENABLED ? "enabled" : "disabled"}`);

  await loadExclusionData();

  while (true) {
    try {
      await loadExclusionData();

      const jobs = await prisma.aBMJob.findMany({
        where: { status: { in: ["queued", "running"] } },
        orderBy: { createdAt: "asc" },
        take: 1,
      });

      for (const job of jobs) {
        await processJob(job).catch(async (e) => {
          console.error(`[Job ${job.id}] Fatal error:`, e.message);
          await prisma.aBMJob.update({ where: { id: job.id }, data: { status: "failed", error: e.message } }).catch(() => {});
          const listInfo = await prisma.aBMList.findUnique({ where: { id: job.listId } }).catch(() => null);
          await notifyTelegram(`<b>ABM Job Failed (v2)</b>\n${listInfo?.name || job.id}\nError: ${e.message.slice(0, 200)}`);
        });
      }

      if (jobs.length === 0) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      } else {
        await new Promise(r => setTimeout(r, 10000));
      }
    } catch (e) {
      console.error("Poll error:", e.message);
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

pollLoop();
