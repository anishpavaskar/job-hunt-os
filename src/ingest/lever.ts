import { z } from "zod";
import type { LeverCompany } from "../../config/lever-companies";
import type { NormalizedOpportunity } from "./normalize";
import { RESUME_KEYWORDS, TIER1_TAGS, TIER2_TAGS } from "../../config/scoring";

// ─── Lever API schemas ─────────────────────────────────────────

const leverCategoriesSchema = z.object({
  team: z.string().optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  commitment: z.string().optional(),
  allLocations: z.array(z.string()).optional(),
}).passthrough();

const leverPostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string().optional(),
  categories: leverCategoriesSchema.default({}),
  descriptionPlain: z.string().default(""),
  lists: z.array(z.object({
    text: z.string(),
    content: z.string(),
  }).passthrough()).default([]),
}).passthrough();

export type LeverPosting = z.infer<typeof leverPostingSchema>;

// ─── Helpers ───────────────────────────────────────────────────

const LEVER_API = "https://api.lever.co/v0/postings";

const SENIORITY_PATTERNS: [RegExp, string][] = [
  [/\bintern\b/i, "Intern"],
  [/\bjunior\b/i, "Junior"],
  [/\bprincipal\b/i, "Principal"],
  [/\bstaff\b/i, "Staff"],
  [/\blead\b/i, "Lead"],
  [/\bsenior\b/i, "Senior"],
];

function inferSeniority(title: string, commitment?: string): string | null {
  for (const [pattern, label] of SENIORITY_PATTERNS) {
    if (pattern.test(title)) return label;
  }
  // Check commitment for intern/co-op
  if (commitment && /intern|co-op/i.test(commitment)) return "Intern";
  return null;
}

function inferRemote(location?: string, allLocations?: string[], commitment?: string): boolean {
  if (location && /remote/i.test(location)) return true;
  if (allLocations?.some((loc) => /remote/i.test(loc))) return true;
  if (commitment && /remote/i.test(commitment)) return true;
  return false;
}

function buildLocation(location?: string, allLocations?: string[]): string {
  // Prefer allLocations if it has more detail
  if (allLocations && allLocations.length > 1) return allLocations.join("; ");
  if (location) return location;
  if (allLocations && allLocations.length === 1) return allLocations[0];
  return "";
}

function collectTags(categories: LeverPosting["categories"]): string[] {
  const tags: string[] = [];
  if (categories.team) tags.push(categories.team);
  if (categories.department && categories.department !== categories.team) {
    tags.push(categories.department);
  }
  return tags;
}

function extractSkills(...parts: Array<string | null | undefined>): string[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  const candidates = [...TIER1_TAGS, ...TIER2_TAGS, ...RESUME_KEYWORDS];
  return [...new Set(candidates.filter((c) => text.includes(c.toLowerCase())))].slice(0, 12);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Normalizer ────────────────────────────────────────────────

function normalizeLeverPosting(
  company: LeverCompany,
  posting: LeverPosting,
): NormalizedOpportunity {
  const cats = posting.categories;

  return {
    externalKey: `lever:${company.slug}:${posting.id}`,
    roleExternalId: posting.id,
    roleSource: "lever",
    title: posting.text,
    summary: posting.descriptionPlain,
    locations: buildLocation(cats.location, cats.allLocations),
    remoteFlag: inferRemote(cats.location, cats.allLocations, cats.commitment),
    jobUrl: posting.hostedUrl,
    seniorityHint: inferSeniority(posting.text, cats.commitment),
    extractedSkills: extractSkills(posting.text, posting.descriptionPlain),
  };
}

// ─── Fetcher ───────────────────────────────────────────────────

export async function fetchLeverJobs(
  companies: LeverCompany[],
  /** Override fetch for testing */
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<NormalizedOpportunity[]> {
  const allJobs: NormalizedOpportunity[] = [];

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];

    // Rate limiting: 500ms between requests (skip before first)
    if (i > 0) await sleep(500);

    const url = `${LEVER_API}/${company.slug}`;
    let response: Response;
    try {
      response = await fetchFn(url);
    } catch (err) {
      console.warn(`[lever] Failed to fetch ${company.name} (${url}): ${err}`);
      continue;
    }

    if (!response.ok) {
      console.warn(`[lever] HTTP ${response.status} for ${company.name} (${url})`);
      continue;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      console.warn(`[lever] Invalid JSON from ${company.name}`);
      continue;
    }

    if (!Array.isArray(payload)) {
      console.warn(`[lever] Expected array from ${company.name}, got ${typeof payload}`);
      continue;
    }

    for (const rawPosting of payload) {
      const result = leverPostingSchema.safeParse(rawPosting);
      if (!result.success) {
        console.warn(`[lever] Skipping invalid posting from ${company.name}: ${result.error.message}`);
        continue;
      }
      allJobs.push(normalizeLeverPosting(company, result.data));
    }
  }

  return allJobs;
}
