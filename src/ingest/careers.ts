import type { CareerPage } from "../../config/career-pages";
import { extractPostedAt, type NormalizedOpportunity } from "./normalize";
import { RESUME_KEYWORDS, TIER1_TAGS, TIER2_TAGS } from "../../config/scoring";

// ─── Types ─────────────────────────────────────────────────────

export interface RawExtractedRole {
  title: string;
  url: string;
  location?: string;
  description?: string;
  postedAt?: string | null;
  source: "jsonld" | "link_pattern" | "iframe_redirect";
}

export interface CareersScrapeResult {
  company: CareerPage;
  roles: NormalizedOpportunity[];
  rawCount: number;
  strategy: string;
}

// ─── Helpers ───────────────────────────────────────────────────

const SENIORITY_PATTERNS: [RegExp, string][] = [
  [/\bintern\b/i, "Intern"],
  [/\bjunior\b/i, "Junior"],
  [/\bprincipal\b/i, "Principal"],
  [/\bstaff\b/i, "Staff"],
  [/\blead\b/i, "Lead"],
  [/\bsenior\b/i, "Senior"],
];

function inferSeniority(title: string): string | null {
  for (const [pattern, label] of SENIORITY_PATTERNS) {
    if (pattern.test(title)) return label;
  }
  return null;
}

function inferRemote(text: string): boolean {
  return /\bremote\b/i.test(text);
}

function extractSkills(...parts: Array<string | null | undefined>): string[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  const candidates = [...TIER1_TAGS, ...TIER2_TAGS, ...RESUME_KEYWORDS];
  return [...new Set(candidates.filter((c) => text.includes(c.toLowerCase())))].slice(0, 12);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[|\-]\s*(?:Microsoft Careers|Careers at .+|Jobs at .+)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericRoleTitle(title: string): boolean {
  return /^(see details|details|learn more|apply now|apply)$/i.test(title.trim());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve potentially relative URLs against a base */
function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

/** Deduplicate by URL */
function deduplicateRoles(roles: RawExtractedRole[]): RawExtractedRole[] {
  const seen = new Set<string>();
  return roles.filter((r) => {
    const key = r.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Strategy 1: JSON-LD (most reliable) ───────────────────────

function extractJsonLd(html: string, baseUrl: string): RawExtractedRole[] {
  const roles: RawExtractedRole[] = [];
  // Match all <script type="application/ld+json"> blocks
  const scriptRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Direct JobPosting
        if (item["@type"] === "JobPosting") {
          roles.push(parseJobPosting(item, baseUrl));
        }
        // ItemList containing JobPostings
        if (item["@type"] === "ItemList" && Array.isArray(item.itemListElement)) {
          for (const el of item.itemListElement) {
            const posting = el.item ?? el;
            if (posting["@type"] === "JobPosting") {
              roles.push(parseJobPosting(posting, baseUrl));
            }
          }
        }
        // @graph array
        if (Array.isArray(item["@graph"])) {
          for (const node of item["@graph"]) {
            if (node["@type"] === "JobPosting") {
              roles.push(parseJobPosting(node, baseUrl));
            }
          }
        }
      }
    } catch {
      // Malformed JSON-LD, skip
    }
  }

  return roles;
}

function parseJobPosting(posting: Record<string, unknown>, baseUrl: string): RawExtractedRole {
  const title = String(posting.title ?? posting.name ?? "Untitled");
  const url = resolveUrl(String(posting.url ?? posting.sameAs ?? ""), baseUrl);
  const location = extractJobPostingLocation(posting);
  const description = typeof posting.description === "string"
    ? stripHtml(posting.description).slice(0, 500)
    : undefined;
  const postedAt = extractPostedAt(posting, description);

  return { title, url, location, description, postedAt, source: "jsonld" };
}

function extractJobPostingLocation(posting: Record<string, unknown>): string | undefined {
  const loc = posting.jobLocation;
  if (!loc) return undefined;

  if (typeof loc === "string") return loc;

  if (Array.isArray(loc)) {
    return loc
      .map((l) => {
        if (typeof l === "string") return l;
        const addr = (l as Record<string, unknown>).address;
        if (typeof addr === "string") return addr;
        if (addr && typeof addr === "object") {
          const a = addr as Record<string, unknown>;
          return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", ");
        }
        return (l as Record<string, unknown>).name as string | undefined;
      })
      .filter(Boolean)
      .join("; ");
  }

  if (typeof loc === "object") {
    const addr = (loc as Record<string, unknown>).address;
    if (typeof addr === "string") return addr;
    if (addr && typeof addr === "object") {
      const a = addr as Record<string, unknown>;
      return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", ");
    }
    return (loc as Record<string, unknown>).name as string | undefined;
  }

  return undefined;
}

// ─── Strategy 2: Embedded Greenhouse/Lever iframes ─────────────

function extractIframeRedirects(html: string): { provider: string; slug: string } | null {
  // Greenhouse embed
  const ghMatch = html.match(/boards\.greenhouse\.io\/(\w+)/);
  if (ghMatch) return { provider: "greenhouse", slug: ghMatch[1] };

  // Lever embed
  const leverMatch = html.match(/jobs\.lever\.co\/(\w[\w-]*)/);
  if (leverMatch) return { provider: "lever", slug: leverMatch[1] };

  return null;
}

// ─── Strategy 3: Link pattern extraction ───────────────────────

const ROLE_LINK_RE = /<a\s[^>]*href\s*=\s*["']([^"']*(?:\/jobs\/|\/careers\/|\/positions\/|\/openings\/|\/job\/|\/role\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

/** Filter for plausible role titles (not nav links, not "view all", etc.) */
function isPlausibleRoleTitle(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < 3 || cleaned.length > 200) return false;
  // Skip generic nav items
  if (/^(view all|see all|apply|learn more|back|home|about|contact|blog|login|sign)/i.test(cleaned)) return false;
  // Must have at least one word character
  if (!/\w/.test(cleaned)) return false;
  return true;
}

function extractLinkPatterns(html: string, baseUrl: string): RawExtractedRole[] {
  const roles: RawExtractedRole[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  ROLE_LINK_RE.lastIndex = 0;

  while ((match = ROLE_LINK_RE.exec(html)) !== null) {
    const href = match[1];
    const rawText = match[2];
    const title = stripHtml(rawText).trim();

    if (!isPlausibleRoleTitle(title)) continue;

    const url = resolveUrl(href, baseUrl);

    // Skip if it's pointing at the same careers page root
    if (url === baseUrl || url === baseUrl + "/") continue;

    roles.push({
      title,
      url,
      source: "link_pattern",
    });
  }

  return roles;
}

function extractTitleFromHtml(html: string): string | null {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = cleanTitle(stripHtml(match[1]));
  return title || null;
}

function extractPostedAtFromHtml(html: string): string | null {
  const rawPatterns = [
    /"datePosted"\s*:\s*"([^"]+)"/i,
    /"posted_at"\s*:\s*"([^"]+)"/i,
    /"published_at"\s*:\s*"([^"]+)"/i,
    /"created_at"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of rawPatterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const parsed = extractPostedAt({ datePosted: match[1] });
    if (parsed) return parsed;
  }

  return extractPostedAt(undefined, stripHtml(html));
}

async function hydrateLinkRole(
  role: RawExtractedRole,
  fetchFn: typeof globalThis.fetch,
): Promise<RawExtractedRole> {
  let response: Response;
  try {
    response = await fetchFn(role.url);
  } catch {
    return role;
  }

  if (!response.ok) return role;

  let html: string;
  try {
    html = await response.text();
  } catch {
    return role;
  }

  const jsonLdRoles = extractJsonLd(html, role.url);
  const bestJsonLdRole = jsonLdRoles.find((candidate) => !isGenericRoleTitle(candidate.title));
  if (bestJsonLdRole) {
    return {
      ...role,
      title: cleanTitle(bestJsonLdRole.title || role.title),
      location: bestJsonLdRole.location ?? role.location,
      description: bestJsonLdRole.description ?? role.description,
      postedAt: bestJsonLdRole.postedAt ?? role.postedAt ?? extractPostedAtFromHtml(html),
    };
  }

  return {
    ...role,
    title: isGenericRoleTitle(role.title) ? cleanTitle(extractTitleFromHtml(html) ?? role.title) : role.title,
    postedAt: role.postedAt ?? extractPostedAtFromHtml(html),
  };
}

async function hydrateLinkRoles(
  roles: RawExtractedRole[],
  fetchFn: typeof globalThis.fetch,
): Promise<RawExtractedRole[]> {
  const hydrated: RawExtractedRole[] = [];

  for (const role of roles) {
    hydrated.push(await hydrateLinkRole(role, fetchFn));
  }

  return hydrated;
}

// ─── Normalizer ────────────────────────────────────────────────

function normalizeCareerRole(
  company: CareerPage,
  role: RawExtractedRole,
): NormalizedOpportunity {
  const locationText = role.location ?? "";

  return {
    externalKey: `careers:${company.slug}:${role.url}`,
    roleExternalId: role.url,
    roleSource: "careers",
    title: role.title,
    summary: role.description ?? "",
    locations: locationText,
    remoteFlag: inferRemote(locationText) || inferRemote(role.title),
    jobUrl: role.url,
    postedAt: role.postedAt ?? null,
    seniorityHint: inferSeniority(role.title),
    extractedSkills: extractSkills(role.title, role.description),
  };
}

// ─── Main scraper ──────────────────────────────────────────────

export async function scrapeCareerPage(
  company: CareerPage,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<CareersScrapeResult> {
  const empty: CareersScrapeResult = { company, roles: [], rawCount: 0, strategy: "none" };

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    response = await fetchFn(company.careersUrl, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      console.warn(`[careers] Timeout fetching ${company.name} (${company.careersUrl})`);
    } else {
      console.warn(`[careers] Failed to fetch ${company.name}: ${msg}`);
    }
    return empty;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    console.warn(`[careers] HTTP ${response.status} for ${company.name} (${company.careersUrl})`);
    return empty;
  }

  let html: string;
  try {
    html = await response.text();
  } catch {
    console.warn(`[careers] Could not read body from ${company.name}`);
    return empty;
  }

  // Strategy 1: JSON-LD
  const jsonLdRoles = extractJsonLd(html, company.careersUrl);
  if (jsonLdRoles.length > 0) {
    const deduped = deduplicateRoles(jsonLdRoles);
    return {
      company,
      roles: deduped.map((r) => normalizeCareerRole(company, r)),
      rawCount: deduped.length,
      strategy: "jsonld",
    };
  }

  // Strategy 2: Check for embedded Greenhouse/Lever
  const iframe = extractIframeRedirects(html);
  if (iframe) {
    console.warn(
      `[careers] ${company.name} uses embedded ${iframe.provider} (slug: ${iframe.slug}). ` +
      `Consider adding to ${iframe.provider}-companies.ts instead.`,
    );
    return { ...empty, strategy: `iframe_redirect:${iframe.provider}:${iframe.slug}` };
  }

  // Strategy 3: Link patterns
  const linkRoles = extractLinkPatterns(html, company.careersUrl);
  if (linkRoles.length > 0) {
    const deduped = deduplicateRoles(linkRoles);
    const hydrated = await hydrateLinkRoles(deduped, fetchFn);
    return {
      company,
      roles: hydrated.map((r) => normalizeCareerRole(company, r)),
      rawCount: deduped.length,
      strategy: "link_pattern",
    };
  }

  console.warn(`[careers] No roles found on ${company.name} (${company.careersUrl})`);
  return { ...empty, strategy: "none" };
}

export async function scrapeAllCareerPages(
  companies: CareerPage[],
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<CareersScrapeResult[]> {
  const results: CareersScrapeResult[] = [];

  for (let i = 0; i < companies.length; i++) {
    if (i > 0) await sleep(500);
    results.push(await scrapeCareerPage(companies[i], fetchFn));
  }

  return results;
}
