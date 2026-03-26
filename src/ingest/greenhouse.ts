import { z } from "zod";
import type { GreenhouseCompany } from "../../config/greenhouse-companies";
import type { NormalizedOpportunity } from "./normalize";
import { RESUME_KEYWORDS, TIER1_TAGS, TIER2_TAGS } from "../../config/scoring";

// ─── Greenhouse API schemas ────────────────────────────────────

const greenhouseDepartmentSchema = z.object({
  name: z.string(),
}).passthrough();

const greenhouseLocationSchema = z.object({
  name: z.string(),
}).passthrough();

const greenhouseJobSchema = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  location: greenhouseLocationSchema,
  content: z.string().default(""),
  departments: z.array(greenhouseDepartmentSchema).default([]),
}).passthrough();

const greenhouseListResponseSchema = z.object({
  jobs: z.array(z.unknown()),
});

export type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;

// ─── Helpers ───────────────────────────────────────────────────

const BOARDS_API = "https://boards-api.greenhouse.io/v1/boards";

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

function inferRemote(location: string): boolean {
  return /remote/i.test(location);
}

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

function extractSkills(...parts: Array<string | null | undefined>): string[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  const candidates = [...TIER1_TAGS, ...TIER2_TAGS, ...RESUME_KEYWORDS];
  return [...new Set(candidates.filter((c) => text.includes(c.toLowerCase())))].slice(0, 12);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Normalizer ────────────────────────────────────────────────

function normalizeGreenhouseJob(
  company: GreenhouseCompany,
  job: GreenhouseJob,
): NormalizedOpportunity {
  const plainContent = stripHtml(job.content);

  return {
    externalKey: `greenhouse:${company.slug}:${job.id}`,
    roleExternalId: String(job.id),
    roleSource: "greenhouse",
    title: job.title,
    summary: plainContent,
    locations: job.location.name,
    remoteFlag: inferRemote(job.location.name),
    jobUrl: job.absolute_url,
    seniorityHint: inferSeniority(job.title),
    extractedSkills: extractSkills(job.title, plainContent),
  };
}

// ─── Fetcher ───────────────────────────────────────────────────

export interface FetchGreenhouseResult {
  jobs: NormalizedOpportunity[];
  rawCount: number;
  skipped: number;
}

export interface GreenhouseSlugAuditEntry {
  slug: string;
  companyName: string;
  httpResult: string;
  jobsReturned: number;
}

export async function fetchGreenhouseJobs(
  companies: GreenhouseCompany[],
  /** Override fetch for testing */
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  opts: {
    audit?: (entry: GreenhouseSlugAuditEntry) => void;
  } = {},
): Promise<NormalizedOpportunity[]> {
  const allJobs: NormalizedOpportunity[] = [];

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const reportAudit = (httpResult: string, jobsReturned: number) => {
      opts.audit?.({
        slug: company.slug,
        companyName: company.name,
        httpResult,
        jobsReturned,
      });
    };

    // Rate limiting: 500ms between requests (skip before first)
    if (i > 0) await sleep(500);

    const url = `${BOARDS_API}/${company.slug}/jobs`;
    let response: Response;
    try {
      response = await fetchFn(url);
    } catch (err) {
      console.warn(`[greenhouse] Failed to fetch ${company.name} (${url}): ${err}`);
      reportAudit("network_error", 0);
      continue;
    }

    if (!response.ok) {
      console.warn(`[greenhouse] HTTP ${response.status} for ${company.name} (${url})`);
      reportAudit(`HTTP ${response.status}`, 0);
      continue;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      console.warn(`[greenhouse] Invalid JSON from ${company.name}`);
      reportAudit(`HTTP ${response.status} invalid_json`, 0);
      continue;
    }

    const listResult = greenhouseListResponseSchema.safeParse(payload);
    if (!listResult.success) {
      console.warn(`[greenhouse] Unexpected response shape for ${company.name}`);
      reportAudit(`HTTP ${response.status} invalid_shape`, 0);
      continue;
    }

    let jobsReturned = 0;
    for (const rawJob of listResult.data.jobs) {
      const jobResult = greenhouseJobSchema.safeParse(rawJob);
      if (!jobResult.success) {
        console.warn(`[greenhouse] Skipping invalid job from ${company.name}: ${jobResult.error.message}`);
        continue;
      }
      allJobs.push(normalizeGreenhouseJob(company, jobResult.data));
      jobsReturned += 1;
    }
    reportAudit(`HTTP ${response.status}`, jobsReturned);
  }

  return allJobs;
}
