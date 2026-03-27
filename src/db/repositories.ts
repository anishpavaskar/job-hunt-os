import {
  IC_TITLE_KEYWORDS,
  MODERATE_MISMATCH_TITLE_KEYWORDS,
  STRONG_MISMATCH_TITLE_KEYWORDS,
  SURFACED_ROLE_CAP_PER_COMPANY,
  TODAY_RANKING,
} from "../../config/scoring";
import { rerankItemsWithAnthropic } from "../ai/anthropic-rerank";
import {
  ApplicationEventRecord,
  ApplicationRecord,
  ApplicationStatus,
  ApplicationUpdateInput,
  BaselineSnapshotRecord,
  BrowseFilters,
  BrowseJobRecord,
  ConversionStats,
  DraftRecord,
  DraftUpsertInput,
  FollowupRecord,
  FollowupStatus,
  FollowupUpdateInput,
  JobRecord,
  JobSourceInput,
  JobStatus,
  JobUpsertInput,
  NextActionRecord,
  ReviewFilters,
  ScoreBreakdown,
  ScoreRangeStats,
  SourceStats,
} from "./types";
import type { DbClient } from "./client";

type DbRow = Record<string, any>;
type StatusRow = { status: ApplicationStatus };
const EXTERNAL_KEY_QUERY_FALLBACK_BATCH_SIZE = 25;
const JOB_PAGE_SIZE = 1000;

function normalizeTitle(title?: string | null): string {
  return (title ?? "").toLowerCase().trim();
}

function mapJobToAnthropicCandidate(job: JobRecord) {
  return {
    id: job.id,
    company: job.company_name,
    title: job.title,
    summary: job.summary,
    locations: job.locations,
    remoteFlag: job.remote_flag,
    postedAt: job.posted_at,
    score: job.score,
    scoreBreakdown: job.score_breakdown_json,
    extractedSkills: job.extracted_skills_json,
    explanationBullets: job.explanation_bullets_json,
    riskBullets: job.risk_bullets_json,
    status: job.status,
    roleSource: job.role_source,
  };
}

function mapActionToAnthropicCandidate(action: NextActionRecord) {
  return {
    id: action.jobId,
    company: action.companyName,
    title: action.title,
    summary: action.summary,
    locations: action.locations,
    remoteFlag: action.remoteFlag,
    score: action.score,
    scoreBreakdown: action.scoreBreakdown,
    extractedSkills: action.extractedSkills,
    explanationBullets: action.whyMatch,
    riskBullets: action.risk ? [action.risk] : [],
    status: action.status,
    roleSource: "role",
  };
}

function hasKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function isLikelyICTitle(title?: string | null): boolean {
  const normalized = normalizeTitle(title);
  return normalized.length > 0 && hasKeyword(normalized, IC_TITLE_KEYWORDS);
}

function isStrongTitleMismatch(title?: string | null): boolean {
  const normalized = normalizeTitle(title);
  if (!normalized) return false;
  return hasKeyword(normalized, STRONG_MISMATCH_TITLE_KEYWORDS) && !isLikelyICTitle(normalized);
}

function titleRankingPenalty(title?: string | null): number {
  const normalized = normalizeTitle(title);
  if (!normalized) return 0;

  if (isStrongTitleMismatch(normalized)) return 45;

  let penalty = 0;
  if (hasKeyword(normalized, MODERATE_MISMATCH_TITLE_KEYWORDS) && !isLikelyICTitle(normalized)) {
    penalty += 20;
  }
  if (normalized.includes("engineering manager")) penalty += 18;
  if (normalized.includes("manager")) penalty += 10;
  return penalty;
}

const APPLY_HARD_EXCLUDE_TITLE_KEYWORDS = [
  "marketing",
  "sales",
  "sourcing",
  "supply manager",
  "supply chain",
  "enablement",
  "specialist",
  "account executive",
  "account-based",
  "customer success",
  "finance",
  "gtm",
  "go-to-market",
  "scientist",
  "analyst",
  "recruiter",
  "operations manager",
] as const;

const APPLY_TARGET_TITLE_KEYWORDS = [
  "backend",
  "platform",
  "developer platform",
  "infrastructure",
  "infra",
  "devops",
  "site reliability",
  "sre",
  "reliability",
  "distributed systems",
  "deployment",
  "cloud infrastructure",
  "data infrastructure",
  "ml infrastructure",
  "machine learning infrastructure",
  "storage",
  "network",
  "networking",
  "data engineer",
  "data engineering",
] as const;

function isHardApplyTitleMismatch(title?: string | null): boolean {
  const normalized = normalizeTitle(title);
  if (!normalized) return false;
  if (hasKeyword(normalized, APPLY_HARD_EXCLUDE_TITLE_KEYWORDS)) return true;
  if (normalized.includes("staff") || normalized.includes("principal")) return true;
  return false;
}

function hasPreferredApplyTitleSignal(title?: string | null): boolean {
  const normalized = normalizeTitle(title);
  if (!normalized) return false;
  return hasKeyword(normalized, APPLY_TARGET_TITLE_KEYWORDS);
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asObject<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function maybeJobStatus(status: ApplicationStatus): JobStatus {
  switch (status) {
    case "saved":
    case "shortlisted":
    case "drafted":
    case "applied":
    case "followup_due":
    case "replied":
    case "interview":
    case "rejected":
    case "archived":
      return status;
    default:
      return "reviewed";
  }
}

function assertNoError<T>(error: { message: string } | null, context: string, data?: T | null): T {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
  if (data == null) {
    throw new Error(`${context}: empty response`);
  }
  return data;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function capItemsPerCompany<T>(
  items: T[],
  getCompanyName: (item: T) => string,
  maxPerCompany: number | null,
): T[] {
  if (maxPerCompany == null) return items;
  if (maxPerCompany <= 0) return [];
  const companyCounts = new Map<string, number>();
  return items.filter((item) => {
    const key = getCompanyName(item).toLowerCase();
    const count = companyCounts.get(key) ?? 0;
    if (count >= maxPerCompany) return false;
    companyCounts.set(key, count + 1);
    return true;
  });
}

function mapJobUpsertInput(input: JobUpsertInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    source_id: input.sourceId,
    scan_id: input.scanId,
    external_key: input.externalKey,
    role_external_id: input.roleExternalId ?? null,
    role_source: input.roleSource,
    company_name: input.companyName,
    title: input.title ?? null,
    summary: input.summary,
    website: input.website,
    locations: input.locations,
    remote_flag: input.remoteFlag ?? false,
    job_url: input.jobUrl,
    regions_json: input.regions,
    tags_json: input.tags,
    industries_json: input.industries,
    stage: input.stage,
    batch: input.batch,
    team_size: input.teamSize ?? null,
    seniority_hint: input.seniorityHint ?? null,
    compensation_min: input.compensationMin ?? null,
    compensation_max: input.compensationMax ?? null,
    compensation_currency: input.compensationCurrency ?? null,
    compensation_period: input.compensationPeriod ?? null,
    extracted_skills_json: input.extractedSkills ?? [],
    top_company: input.topCompany,
    is_hiring: input.isHiring,
    score: input.score,
    score_reasons_json: input.scoreReasons,
    score_breakdown_json: input.scoreBreakdown,
    explanation_bullets_json: input.explanationBullets,
    risk_bullets_json: input.riskBullets,
    status: input.status ?? "new",
    updated_at: new Date().toISOString(),
  };

  if (input.postedAt) {
    row.posted_at = input.postedAt;
  }

  return row;
}

function normalizeJobRow(row: Record<string, any>): JobRecord {
  const source = Array.isArray(row.job_sources) ? row.job_sources[0] : row.job_sources ?? {};
  return {
    id: row.id,
    source_id: row.source_id,
    scan_id: row.scan_id,
    external_key: row.external_key,
    role_external_id: row.role_external_id ?? null,
    role_source: row.role_source,
    company_name: row.company_name,
    external_id: row.external_id ?? source.external_id ?? "",
    source_url: row.source_url ?? source.url ?? "",
    provider: row.provider ?? source.provider ?? undefined,
    title: row.title ?? null,
    summary: row.summary,
    website: row.website,
    locations: row.locations,
    remote_flag: Boolean(row.remote_flag),
    job_url: row.job_url,
    posted_at: row.posted_at ?? null,
    regions_json: asArray(row.regions_json),
    tags_json: asArray(row.tags_json),
    industries_json: asArray(row.industries_json),
    stage: row.stage,
    batch: row.batch,
    team_size: row.team_size ?? null,
    seniority_hint: row.seniority_hint ?? null,
    compensation_min: row.compensation_min ?? null,
    compensation_max: row.compensation_max ?? null,
    compensation_currency: row.compensation_currency ?? null,
    compensation_period: row.compensation_period ?? null,
    extracted_skills_json: asArray(row.extracted_skills_json),
    top_company: Boolean(row.top_company),
    is_hiring: Boolean(row.is_hiring),
    score: row.score,
    score_reasons_json: asArray(row.score_reasons_json),
    score_breakdown_json: asObject<ScoreBreakdown>(row.score_breakdown_json, {
      roleFit: 0,
      stackFit: 0,
      seniorityFit: 0,
      freshness: 0,
      companySignal: 0,
    }),
    explanation_bullets_json: asArray(row.explanation_bullets_json),
    risk_bullets_json: asArray(row.risk_bullets_json),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    application_status: row.application_status ?? null,
  };
}

function normalizeDraftRow(row: Record<string, any>): DraftRecord {
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs ?? {};
  const application = Array.isArray(row.applications) ? row.applications[0] : row.applications ?? {};
  return {
    id: row.id,
    job_id: row.job_id,
    application_id: row.application_id ?? null,
    variant: row.variant,
    generated_content: row.generated_content,
    edited_content: row.edited_content ?? null,
    gmail_draft_id: row.gmail_draft_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    company_name: row.company_name ?? job.company_name,
    title: row.title ?? job.title ?? null,
    application_status: row.application_status ?? application.status ?? null,
  };
}

function normalizeApplicationRow(row: Record<string, any>): ApplicationRecord {
  return {
    id: row.id,
    job_id: row.job_id,
    applied_at: row.applied_at ?? null,
    status: row.status,
    notes: row.notes ?? null,
    applied_url: row.applied_url ?? null,
    resume_version: row.resume_version ?? null,
    outreach_draft_version: row.outreach_draft_version ?? null,
    response_received: Boolean(row.response_received),
    response_type: row.response_type ?? null,
    interview_stage: row.interview_stage ?? null,
    rejection_reason: row.rejection_reason ?? null,
    last_contacted_at: row.last_contacted_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeEventRow(row: Record<string, any>): ApplicationEventRecord {
  return {
    id: row.id,
    application_id: row.application_id,
    event_type: row.event_type,
    previous_status: row.previous_status ?? null,
    next_status: row.next_status ?? null,
    note: row.note ?? null,
    metadata_json: asObject(row.metadata_json, {}),
    created_at: row.created_at,
  };
}

function normalizeFollowupRow(row: Record<string, any>): FollowupRecord {
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs ?? {};
  return {
    id: row.id,
    job_id: row.job_id,
    application_id: row.application_id ?? null,
    due_at: row.due_at,
    status: row.status,
    note: row.note ?? null,
    company_name: row.company_name ?? job.company_name,
    website: row.website ?? job.website,
    title: row.title ?? job.title ?? null,
  };
}

async function fetchJobsWithSource(db: DbClient): Promise<JobRecord[]> {
  const rows: DbRow[] = [];
  let from = 0;

  while (true) {
    const to = from + JOB_PAGE_SIZE - 1;
    const { data, error } = await db
      .from("jobs")
      .select("*, job_sources!inner(provider, external_id, url)")
      .order("id", { ascending: true })
      .range(from, to);
    const page = assertNoError(error, "fetch jobs", data) as DbRow[];
    rows.push(...page);
    if (page.length < JOB_PAGE_SIZE) break;
    from += JOB_PAGE_SIZE;
  }

  return rows.map((row: DbRow) => normalizeJobRow(row));
}

export async function createScan(
  db: DbClient,
  provider: string,
  startedAt: string,
  sourceCounts?: unknown,
): Promise<number> {
  const { data, error } = await db
    .from("scans")
    .insert({
      provider,
      started_at: startedAt,
      raw_count: 0,
      valid_count: 0,
      source_counts_json: sourceCounts ?? {},
    })
    .select("id")
    .single();
  return assertNoError(error, "create scan", data).id;
}

export async function completeScan(
  db: DbClient,
  scanId: number,
  rawCount: number,
  validCount: number,
  completedAt: string,
  sourceCounts?: unknown,
): Promise<void> {
  const { error } = await db
    .from("scans")
    .update({
      raw_count: rawCount,
      valid_count: validCount,
      completed_at: completedAt,
      source_counts_json: sourceCounts ?? {},
    })
    .eq("id", scanId);
  assertNoError(error, "complete scan", {});
}

export async function getExistingJobExternalKeys(
  db: DbClient,
  externalKeys: string[],
): Promise<Set<string>> {
  const matches = new Set<string>();
  const uniqueKeys = [...new Set(externalKeys)];

  const loadChunk = async (part: string[]): Promise<void> => {
    if (part.length === 0) return;
    try {
      const { data, error } = await db.from("jobs").select("external_key").in("external_key", part);
      const rows = assertNoError(error, "get existing job keys", data) as DbRow[];
      rows.forEach((row: DbRow) => matches.add(String(row.external_key)));
    } catch (error) {
      if (part.length <= EXTERNAL_KEY_QUERY_FALLBACK_BATCH_SIZE) {
        throw error;
      }

      const midpoint = Math.ceil(part.length / 2);
      await loadChunk(part.slice(0, midpoint));
      await loadChunk(part.slice(midpoint));
    }
  };

  for (const part of chunk(uniqueKeys, 100)) {
    await loadChunk(part);
  }
  return matches;
}

export async function upsertJobSource(
  db: DbClient,
  input: JobSourceInput,
): Promise<number> {
  const { data, error } = await db
    .from("job_sources")
    .upsert(
      {
        provider: input.provider,
        external_id: input.externalId,
        url: input.url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,external_id" },
    )
    .select("id")
    .single();
  return assertNoError(error, "upsert job source", data).id;
}

export async function getBaselineSnapshotByLabel(
  db: DbClient,
  label: string,
): Promise<BaselineSnapshotRecord | undefined> {
  const { data, error } = await db
    .from("baseline_snapshots")
    .select("*")
    .eq("label", label)
    .maybeSingle();
  if (error) throw new Error(`get baseline snapshot: ${error.message}`);
  return data as BaselineSnapshotRecord | undefined;
}

export async function createBaselineSnapshot(
  db: DbClient,
  label: string,
  effectiveDate: string,
): Promise<number> {
  const { data, error } = await db
    .from("baseline_snapshots")
    .insert({ label, effective_date: effectiveDate })
    .select("id")
    .single();
  return assertNoError(error, "create baseline snapshot", data).id;
}

export async function deleteBaselineSnapshot(
  db: DbClient,
  baselineId: number,
): Promise<void> {
  const { error } = await db.from("baseline_snapshots").delete().eq("id", baselineId);
  assertNoError(error, "delete baseline snapshot", {});
}

export async function snapshotJobsIntoBaseline(
  db: DbClient,
  baselineId: number,
  opts: {
    includeFallback?: boolean;
    minScore?: number;
  } = {},
): Promise<number> {
  const includeFallback = opts.includeFallback ?? false;
  const minScore = opts.minScore ?? 0;
  const rows = (await fetchJobsWithSource(db))
    .filter((job) => job.score >= minScore)
    .filter((job) => includeFallback || job.role_source !== "company_fallback")
    .filter((job) => ["new", "reviewed", "saved", "shortlisted", "drafted", "applied", "followup_due", "replied", "interview"].includes(job.status))
    .sort((a, b) => b.score - a.score || a.company_name.localeCompare(b.company_name) || (a.title ?? "").localeCompare(b.title ?? ""));

  if (rows.length === 0) return 0;

  const payload = rows.map((row) => ({
    baseline_id: baselineId,
    job_id: row.id,
    score_snapshot: row.score,
    status_snapshot: row.status,
    role_source_snapshot: row.role_source,
    posted_at_snapshot: row.posted_at,
    discovered_at_snapshot: row.created_at,
  }));

  for (const part of chunk(payload, 500)) {
    const { error } = await db.from("baseline_jobs").insert(part);
    assertNoError(error, "snapshot jobs into baseline", {});
  }

  return rows.length;
}

export async function upsertJob(
  db: DbClient,
  input: JobUpsertInput,
): Promise<number> {
  const { data, error } = await db
    .from("jobs")
    .upsert(mapJobUpsertInput(input), { onConflict: "external_key" })
    .select("id")
    .single();
  return assertNoError(error, "upsert job", data).id;
}

export async function upsertJobsBatch(
  db: DbClient,
  inputs: JobUpsertInput[],
): Promise<void> {
  for (const part of chunk(inputs, inputs.length > 1000 ? 500 : inputs.length || 1)) {
    if (part.length === 0) continue;
    const { error } = await db
      .from("jobs")
      .upsert(part.map(mapJobUpsertInput), { onConflict: "external_key" });
    assertNoError(error, "batch upsert jobs", {});
  }
}

export async function listJobs(
  db: DbClient,
  filters: ReviewFilters,
): Promise<JobRecord[]> {
  let jobs = await fetchJobsWithSource(db);

  if (filters.query) {
    const q = filters.query.toLowerCase();
    jobs = jobs.filter((job) =>
      job.company_name.toLowerCase().includes(q)
      || (job.title ?? "").toLowerCase().includes(q)
      || job.summary.toLowerCase().includes(q)
      || job.tags_json.some((tag) => tag.toLowerCase().includes(q))
      || job.industries_json.some((industry) => industry.toLowerCase().includes(q)),
    );
  }
  if (filters.minScore != null) {
    jobs = jobs.filter((job) => job.score >= filters.minScore!);
  }
  if (filters.status) {
    jobs = jobs.filter((job) => job.status === filters.status);
  }
  if (filters.remoteOnly) {
    jobs = jobs.filter((job) => job.remote_flag);
  }
  if (filters.todayOnly) {
    jobs = jobs.filter((job) => ["new", "reviewed", "saved", "shortlisted", "drafted"].includes(job.status));
  }

  const limit = filters.limit ?? 20;
  const sortedJobs = jobs
    .sort((left, right) => {
      const fallbackDiff = (left.role_source === "company_fallback" ? 1 : 0) - (right.role_source === "company_fallback" ? 1 : 0);
      if (fallbackDiff !== 0) return fallbackDiff;

      const leftPenalty = titleRankingPenalty(left.title);
      const rightPenalty = titleRankingPenalty(right.title);
      const leftTodayRank = filters.todayOnly
        ? left.score - leftPenalty + (left.remote_flag ? 5 : 0) + ((left.compensation_min != null || left.compensation_max != null) ? 4 : 0) + (left.risk_bullets_json.length === 0 ? 3 : 0) - (left.status === "reviewed" ? 2 : 0)
        : left.score - leftPenalty;
      const rightTodayRank = filters.todayOnly
        ? right.score - rightPenalty + (right.remote_flag ? 5 : 0) + ((right.compensation_min != null || right.compensation_max != null) ? 4 : 0) + (right.risk_bullets_json.length === 0 ? 3 : 0) - (right.status === "reviewed" ? 2 : 0)
        : right.score - rightPenalty;
      if (rightTodayRank !== leftTodayRank) return rightTodayRank - leftTodayRank;
      if (right.score !== left.score) return right.score - left.score;
      const titleNullDiff = (left.title == null ? 1 : 0) - (right.title == null ? 1 : 0);
      if (titleNullDiff !== 0) return titleNullDiff;
      return left.company_name.localeCompare(right.company_name) || (left.title ?? "").localeCompare(right.title ?? "");
    });

  const rerankedJobs = await rerankItemsWithAnthropic(
    sortedJobs,
    mapJobToAnthropicCandidate,
    { purpose: filters.todayOnly ? "apply" : "review", candidateLimit: Math.max(limit * 3, 30) },
  );

  return capItemsPerCompany(rerankedJobs, (job) => job.company_name, SURFACED_ROLE_CAP_PER_COMPANY).slice(0, limit);
}

export async function getJobByQuery(
  db: DbClient,
  query: string,
): Promise<JobRecord | undefined> {
  const jobs = await fetchJobsWithSource(db);
  const normalized = query.toLowerCase();

  const exact = jobs
    .filter((job) => job.company_name.toLowerCase() === normalized || (job.title ?? "").toLowerCase() === normalized)
    .sort((a, b) => {
      const titleDiff = ((a.title ?? "").toLowerCase() === normalized ? 0 : 1) - ((b.title ?? "").toLowerCase() === normalized ? 0 : 1);
      if (titleDiff !== 0) return titleDiff;
      const fallbackDiff = (a.role_source === "company_fallback" ? 1 : 0) - (b.role_source === "company_fallback" ? 1 : 0);
      if (fallbackDiff !== 0) return fallbackDiff;
      if (b.score !== a.score) return b.score - a.score;
      const titleNullDiff = (a.title == null ? 1 : 0) - (b.title == null ? 1 : 0);
      if (titleNullDiff !== 0) return titleNullDiff;
      return `${a.company_name} ${a.title ?? ""}`.length - `${b.company_name} ${b.title ?? ""}`.length;
    })[0];
  if (exact) return exact;

  return jobs
    .filter((job) => job.company_name.toLowerCase().includes(normalized) || (job.title ?? "").toLowerCase().includes(normalized) || `${job.company_name} ${job.title ?? ""}`.toLowerCase().includes(normalized))
    .sort((a, b) => {
      const exactTitleDiff = ((a.title ?? "").toLowerCase() === normalized ? 0 : 1) - ((b.title ?? "").toLowerCase() === normalized ? 0 : 1);
      if (exactTitleDiff !== 0) return exactTitleDiff;
      const fallbackDiff = (a.role_source === "company_fallback" ? 1 : 0) - (b.role_source === "company_fallback" ? 1 : 0);
      if (fallbackDiff !== 0) return fallbackDiff;
      if (b.score !== a.score) return b.score - a.score;
      const titleNullDiff = (a.title == null ? 1 : 0) - (b.title == null ? 1 : 0);
      if (titleNullDiff !== 0) return titleNullDiff;
      return `${a.company_name} ${a.title ?? ""}`.length - `${b.company_name} ${b.title ?? ""}`.length;
    })[0];
}

export async function getJobById(
  db: DbClient,
  jobId: number,
): Promise<JobRecord | undefined> {
  const jobs = await fetchJobsWithSource(db);
  return jobs.find((job) => job.id === jobId);
}

export async function listBrowseJobs(
  db: DbClient,
  filters: BrowseFilters,
): Promise<BrowseJobRecord[]> {
  let jobs = await fetchJobsWithSource(db) as BrowseJobRecord[];

  if (filters.query) {
    const q = filters.query.toLowerCase();
    jobs = jobs.filter((job) =>
      job.company_name.toLowerCase().includes(q)
      || (job.title ?? "").toLowerCase().includes(q)
      || job.summary.toLowerCase().includes(q)
      || job.tags_json.some((tag) => tag.toLowerCase().includes(q))
      || job.industries_json.some((industry) => industry.toLowerCase().includes(q)),
    );
  }
  if (filters.minScore != null) jobs = jobs.filter((job) => job.score >= filters.minScore!);
  if (filters.status) jobs = jobs.filter((job) => job.status === filters.status);
  if (filters.remoteOnly) jobs = jobs.filter((job) => job.remote_flag);
  if (filters.source) jobs = jobs.filter((job) => job.provider === filters.source);
  if (filters.prospectOnly) jobs = jobs.filter((job) => Boolean(job.score_breakdown_json.prospect_listed));
  if (filters.realRolesOnly) jobs = jobs.filter((job) => job.role_source !== "company_fallback");
  if (filters.postedWithinDays != null) {
    const cutoff = Date.now() - filters.postedWithinDays * 24 * 60 * 60 * 1000;
    jobs = jobs.filter((job) => job.posted_at != null && new Date(job.posted_at).getTime() >= cutoff);
  }
  if (filters.trackedWithinDays != null) {
    const cutoff = Date.now() - filters.trackedWithinDays * 24 * 60 * 60 * 1000;
    jobs = jobs.filter((job) => new Date(job.created_at).getTime() >= cutoff);
  }

  const limit = filters.limit ?? 50;
  const perCompanyCap = filters.capPerCompany === undefined
    ? SURFACED_ROLE_CAP_PER_COMPANY
    : filters.capPerCompany;
  const sortedJobs = jobs
    .sort((a, b) => {
      if (filters.sort === "posted") {
        const aMissing = a.posted_at == null ? 1 : 0;
        const bMissing = b.posted_at == null ? 1 : 0;
        if (aMissing !== bMissing) return aMissing - bMissing;
        const postedDiff = new Date(b.posted_at ?? 0).getTime() - new Date(a.posted_at ?? 0).getTime();
        if (postedDiff !== 0) return postedDiff;
      } else if (filters.sort === "tracked") {
        const trackedDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (trackedDiff !== 0) return trackedDiff;
      } else if (filters.sort === "company") {
        const companyDiff = a.company_name.localeCompare(b.company_name);
        if (companyDiff !== 0) return companyDiff;
      } else {
        const fallbackDiff = (a.role_source === "company_fallback" ? 1 : 0) - (b.role_source === "company_fallback" ? 1 : 0);
        if (fallbackDiff !== 0) return fallbackDiff;
      }

      const aRank = a.score - titleRankingPenalty(a.title);
      const bRank = b.score - titleRankingPenalty(b.title);
      if (bRank !== aRank) return bRank - aRank;
      if (b.score !== a.score) return b.score - a.score;
      const titleNullDiff = (a.title == null ? 1 : 0) - (b.title == null ? 1 : 0);
      if (titleNullDiff !== 0) return titleNullDiff;
      return a.company_name.localeCompare(b.company_name) || (a.title ?? "").localeCompare(b.title ?? "");
    });

  if (filters.sort !== "score") {
    return capItemsPerCompany(sortedJobs, (job) => job.company_name, perCompanyCap).slice(0, limit);
  }

  const rerankedJobs = await rerankItemsWithAnthropic(
    sortedJobs,
    mapJobToAnthropicCandidate,
    { purpose: "browse", candidateLimit: Math.max(limit * 3, 40) },
  );

  return capItemsPerCompany(rerankedJobs, (job) => job.company_name, perCompanyCap).slice(0, limit);
}

export async function getApplicationByJobId(
  db: DbClient,
  jobId: number,
): Promise<ApplicationRecord | undefined> {
  const { data, error } = await db.from("applications").select("*").eq("job_id", jobId).maybeSingle();
  if (error) throw new Error(`get application by job: ${error.message}`);
  return data ? normalizeApplicationRow(data as Record<string, any>) : undefined;
}

export async function upsertDraft(
  db: DbClient,
  input: DraftUpsertInput,
): Promise<number> {
  const { data: existingData, error: existingError } = await db
    .from("drafts")
    .select("id, application_id, gmail_draft_id")
    .eq("job_id", input.jobId)
    .eq("variant", input.variant)
    .maybeSingle();
  if (existingError) throw new Error(`get existing draft: ${existingError.message}`);

  const { data, error } = await db
    .from("drafts")
    .upsert({
      job_id: input.jobId,
      application_id: input.applicationId ?? existingData?.application_id ?? null,
      variant: input.variant,
      generated_content: input.generatedContent,
      edited_content: input.editedContent ?? null,
      gmail_draft_id: input.gmailDraftId ?? existingData?.gmail_draft_id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "job_id,variant" })
    .select("id")
    .single();
  const draftId = assertNoError(error, "upsert draft", data).id;

  if (input.applicationId != null) {
    await createApplicationEvent(
      db,
      input.applicationId,
      existingData ? "draft_updated" : "draft_saved",
      null,
      null,
      undefined,
      { draftId, variant: input.variant, gmailDraftId: input.gmailDraftId ?? existingData?.gmail_draft_id ?? null },
    );
  }

  return draftId;
}

export async function listDrafts(
  db: DbClient,
  query?: string,
): Promise<DraftRecord[]> {
  const { data, error } = await db
    .from("drafts")
    .select("*, jobs!inner(company_name, title), applications(status)")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  const rows = (assertNoError(error, "list drafts", data) as DbRow[]).map((row: DbRow) => normalizeDraftRow(row));
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter((draft: DraftRecord) =>
    draft.company_name.toLowerCase().includes(q)
    || (draft.title ?? "").toLowerCase().includes(q)
    || draft.variant.toLowerCase().includes(q),
  );
}

export async function getDraftById(
  db: DbClient,
  draftId: number,
): Promise<DraftRecord | undefined> {
  const { data, error } = await db
    .from("drafts")
    .select("*, jobs!inner(company_name, title), applications(status)")
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw new Error(`get draft by id: ${error.message}`);
  return data ? normalizeDraftRow(data as Record<string, any>) : undefined;
}

export async function getLatestDraftByJobId(
  db: DbClient,
  jobId: number,
): Promise<DraftRecord | undefined> {
  const { data, error } = await db
    .from("drafts")
    .select("*, jobs!inner(company_name, title), applications(status)")
    .eq("job_id", jobId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`get latest draft by job id: ${error.message}`);
  return data ? normalizeDraftRow(data as Record<string, any>) : undefined;
}

export async function listAutoDraftJobs(
  db: DbClient,
  minScore: number,
): Promise<JobRecord[]> {
  const jobs = await fetchJobsWithSource(db);
  const { data: draftsData, error: draftsError } = await db.from("drafts").select("job_id");
  if (draftsError) throw new Error(`list auto-draft jobs: ${draftsError.message}`);
  const draftedJobIds = new Set(((draftsData ?? []) as DbRow[]).map((row: DbRow) => Number(row.job_id)));
  return jobs
    .filter((job) => job.score >= minScore)
    .filter((job) => job.status === "new")
    .filter((job) => !draftedJobIds.has(job.id))
    .sort((a, b) => {
      const fallbackDiff = (a.role_source === "company_fallback" ? 1 : 0) - (b.role_source === "company_fallback" ? 1 : 0);
      if (fallbackDiff !== 0) return fallbackDiff;
      return b.score - a.score || a.company_name.localeCompare(b.company_name) || (a.title ?? "").localeCompare(b.title ?? "");
    });
}

function scoreAction(
  type: "followup" | "send_draft" | "apply",
  score: number,
  dueAt?: string | null,
): number {
  const now = Date.now();
  const dueMs = dueAt ? new Date(dueAt).getTime() : null;
  const dueInDays = dueMs != null ? (dueMs - now) / (1000 * 60 * 60 * 24) : null;

  if (type === "followup") {
    if (dueInDays == null) return score + 40;
    if (dueInDays <= 0) return score + 80;
    if (dueInDays <= 1) return score + 65;
    if (dueInDays <= 3) return score + 50;
    return score + 35;
  }
  if (type === "send_draft") {
    return score + 45;
  }
  return score + 20;
}

function buildWhyMatch(job: JobRecord): string[] {
  return job.explanation_bullets_json.filter(Boolean).slice(0, 2).length > 0
    ? job.explanation_bullets_json.filter(Boolean).slice(0, 2)
    : [`${job.score} score from the current fit model`];
}

function hasMinimumApplyFit(breakdown: NextActionRecord["scoreBreakdown"]): boolean {
  const roleFitOk = breakdown.roleFit >= TODAY_RANKING.applyMinRoleFit;
  const stackFitOk = breakdown.stackFit >= TODAY_RANKING.applyMinStackFit;
  const combinedFitOk =
    (breakdown.roleFit + breakdown.stackFit) >= TODAY_RANKING.applyMinCombinedFit;
  return roleFitOk && stackFitOk && combinedFitOk;
}

function hasStrongTechnicalFit(breakdown: NextActionRecord["scoreBreakdown"]): boolean {
  return breakdown.roleFit >= TODAY_RANKING.strongRoleFit || breakdown.stackFit >= TODAY_RANKING.strongStackFit;
}

function isTechnicalBullet(bullet: string): boolean {
  const normalized = bullet.toLowerCase();
  return normalized.includes("role fit")
    || normalized.includes("stack aligns")
    || normalized.includes("target role")
    || normalized.includes("target role families");
}

function isSoftSignalBullet(bullet: string): boolean {
  const normalized = bullet.toLowerCase();
  return normalized.includes("remote")
    || normalized.includes("fresh enough")
    || normalized.includes("prospect-curated")
    || normalized.includes("company signal")
    || normalized.includes("hiring posture");
}

function isSoftSignalDriven(job: JobRecord, breakdown: NextActionRecord["scoreBreakdown"]): boolean {
  if (hasStrongTechnicalFit(breakdown)) return false;
  const bullets = job.explanation_bullets_json.filter(Boolean);
  if (bullets.length === 0) return false;
  return bullets.every((bullet) => isSoftSignalBullet(bullet) && !isTechnicalBullet(bullet));
}

function buildRisk(job: JobRecord): string | null {
  return job.risk_bullets_json[0] ?? null;
}

function buildNextStep(type: "followup" | "send_draft" | "apply", risk: string | null): string {
  if (type === "followup") return "send the follow-up now";
  if (type === "send_draft") return "polish the saved draft and send the application";
  if (risk?.toLowerCase().includes("compensation")) return "do a quick final check, then apply today";
  return "apply today while the fit is fresh";
}

function buildApplyReason(status: JobStatus, breakdown: NextActionRecord["scoreBreakdown"]): string {
  if (status === "shortlisted") return "Already shortlisted and ready for a decision today";
  if (status === "saved") return "Already saved; worth pushing to a real apply decision";
  if (breakdown.freshness >= 7) return "Fresh enough to prioritize from recent hiring activity";
  return "Strong unapplied match in your queue";
}

function scoreApplyAction(job: JobRecord, breakdown: NextActionRecord["scoreBreakdown"]): number {
  let rank =
    (breakdown.roleFit * TODAY_RANKING.roleFitWeight)
    + (breakdown.stackFit * TODAY_RANKING.stackFitWeight)
    + (breakdown.seniorityFit * TODAY_RANKING.seniorityFitWeight)
    + (breakdown.freshness * TODAY_RANKING.freshnessWeight)
    + (breakdown.companySignal * TODAY_RANKING.companySignalWeight)
    + TODAY_RANKING.applyBaseScore;

  rank -= titleRankingPenalty(job.title);
  if (isSoftSignalDriven(job, breakdown)) rank -= TODAY_RANKING.softSignalPenalty;
  return rank;
}

export async function listNextActions(
  db: DbClient,
  limit = 10,
  opts: { includeFallback?: boolean } = {},
): Promise<NextActionRecord[]> {
  const includeFallback = opts.includeFallback ?? false;
  const jobs = await fetchJobsWithSource(db);
  const filteredJobs = includeFallback ? jobs : jobs.filter((job) => job.role_source !== "company_fallback");

  const { data: followupsData, error: followupsError } = await db
    .from("followups")
    .select("*, jobs!inner(company_name, title, website)")
    .eq("status", "pending");
  if (followupsError) throw new Error(`list next actions followups: ${followupsError.message}`);

  const { data: applicationsData, error: applicationsError } = await db.from("applications").select("*");
  if (applicationsError) throw new Error(`list next actions applications: ${applicationsError.message}`);
  const applications = ((applicationsData ?? []) as DbRow[]).map((row: DbRow) => normalizeApplicationRow(row));
  const applicationsByJobId = new Map(applications.map((application: ApplicationRecord) => [application.job_id, application]));

  const { data: draftsData, error: draftsError } = await db.from("drafts").select("*");
  if (draftsError) throw new Error(`list next actions drafts: ${draftsError.message}`);
  const drafts = (draftsData ?? []) as Array<Record<string, any>>;

  const actions: NextActionRecord[] = [];

  for (const row of (followupsData ?? []) as Array<Record<string, any>>) {
    const followup = normalizeFollowupRow(row);
    const job = filteredJobs.find((candidate) => candidate.id === followup.job_id);
    if (!job) continue;
    const risk = buildRisk(job);
    actions.push({
      actionType: "followup",
      rankScore: scoreAction("followup", job.score, followup.due_at),
      companyName: job.company_name,
      title: job.title,
      summary: job.summary,
      locations: job.locations,
      remoteFlag: job.remote_flag,
      stage: job.stage,
      batch: job.batch,
      extractedSkills: job.extracted_skills_json,
      tags: job.tags_json,
      industries: job.industries_json,
      score: job.score,
      scoreBreakdown: job.score_breakdown_json,
      status: job.status,
      reason: followup.due_at <= new Date().toISOString() ? `Follow-up overdue since ${followup.due_at}` : `Follow-up due ${followup.due_at}`,
      whyMatch: buildWhyMatch(job),
      risk,
      nextStep: buildNextStep("followup", risk),
      dueAt: followup.due_at,
      jobId: job.id,
      applicationId: followup.application_id,
      followupId: followup.id,
    });
  }

  for (const application of applications.filter((item: ApplicationRecord) => item.status === "drafted")) {
    const job = filteredJobs.find((candidate) => candidate.id === application.job_id);
    if (!job) continue;
    const risk = buildRisk(job);
    const relatedDrafts = drafts.filter((draft) => draft.application_id === application.id || draft.job_id === job.id);
    const latestDraft = relatedDrafts.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
    actions.push({
      actionType: "send_draft",
      rankScore: scoreAction("send_draft", job.score),
      companyName: job.company_name,
      title: job.title,
      summary: job.summary,
      locations: job.locations,
      remoteFlag: job.remote_flag,
      stage: job.stage,
      batch: job.batch,
      extractedSkills: job.extracted_skills_json,
      tags: job.tags_json,
      industries: job.industries_json,
      score: job.score,
      scoreBreakdown: job.score_breakdown_json,
      status: job.status,
      reason: latestDraft ? "Draft is ready; this is close to submission" : "Application is drafted",
      whyMatch: buildWhyMatch(job),
      risk,
      nextStep: buildNextStep("send_draft", risk),
      dueAt: null,
      jobId: job.id,
      applicationId: application.id,
    });
  }

  for (const job of filteredJobs) {
    const application = applicationsByJobId.get(job.id);
    if (!["new", "reviewed", "saved", "shortlisted"].includes(job.status)) continue;
    if (application && !["saved", "shortlisted"].includes(application.status as ApplicationStatus)) continue;
    if (actions.some((action) => action.jobId === job.id && action.actionType === "followup")) continue;
    if (isStrongTitleMismatch(job.title)) continue;
    if (isHardApplyTitleMismatch(job.title)) continue;
    if (!hasPreferredApplyTitleSignal(job.title)) continue;
    const breakdown = job.score_breakdown_json;
    if (breakdown.seniorityFit <= 1) continue;
    if (!hasMinimumApplyFit(breakdown)) continue;
    const risk = buildRisk(job);
    actions.push({
      actionType: "apply",
      rankScore: scoreApplyAction(job, breakdown),
      companyName: job.company_name,
      title: job.title,
      summary: job.summary,
      locations: job.locations,
      remoteFlag: job.remote_flag,
      stage: job.stage,
      batch: job.batch,
      extractedSkills: job.extracted_skills_json,
      tags: job.tags_json,
      industries: job.industries_json,
      score: job.score,
      scoreBreakdown: breakdown,
      status: job.status,
      reason: buildApplyReason(job.status, breakdown),
      whyMatch: buildWhyMatch(job),
      risk,
      nextStep: buildNextStep("apply", risk),
      dueAt: null,
      jobId: job.id,
    });
  }

  const sortedActions = actions
    .sort((left, right) => right.rankScore - left.rankScore || right.score - left.score || left.companyName.localeCompare(right.companyName))
  ;

  const nonApplyActions = sortedActions.filter((action) => action.actionType !== "apply");
  const applyActions = sortedActions.filter((action) => action.actionType === "apply");
  const rerankedApplyActions = await rerankItemsWithAnthropic(
    applyActions,
    mapActionToAnthropicCandidate,
    { purpose: "apply", candidateLimit: Math.max(limit * 3, 25) },
  );
  const cappedApplyActions = capItemsPerCompany(
    rerankedApplyActions,
    (action) => action.companyName,
    TODAY_RANKING.applyMaxPerCompany,
  );

  return [...nonApplyActions, ...cappedApplyActions].slice(0, limit);
}

export async function createApplicationEvent(
  db: DbClient,
  applicationId: number,
  eventType: string,
  previousStatus: ApplicationStatus | null,
  nextStatus: ApplicationStatus | null,
  note?: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await db
    .from("application_events")
    .insert({
      application_id: applicationId,
      event_type: eventType,
      previous_status: previousStatus,
      next_status: nextStatus,
      note: note ?? null,
      metadata_json: metadata ?? {},
    })
    .select("id")
    .single();
  return assertNoError(error, "create application event", data).id;
}

export async function getApplicationEvents(
  db: DbClient,
  applicationId: number,
): Promise<ApplicationEventRecord[]> {
  const { data, error } = await db
    .from("application_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("id", { ascending: true });
  const rows = assertNoError(error, "get application events", data) as DbRow[];
  return rows.map((row: DbRow) => normalizeEventRow(row));
}

export async function upsertApplication(
  db: DbClient,
  jobId: number,
  input: ApplicationUpdateInput,
): Promise<number> {
  const existing = await getApplicationByJobId(db, jobId);
  const payload = {
    job_id: jobId,
    applied_at: input.appliedAt ?? existing?.applied_at ?? null,
    status: input.status,
    notes: input.note ?? existing?.notes ?? null,
    applied_url: input.appliedUrl ?? existing?.applied_url ?? null,
    resume_version: input.resumeVersion ?? existing?.resume_version ?? null,
    outreach_draft_version: input.outreachDraftVersion ?? existing?.outreach_draft_version ?? null,
    response_received: input.responseReceived ?? existing?.response_received ?? false,
    response_type: input.responseType ?? existing?.response_type ?? null,
    interview_stage: input.interviewStage ?? existing?.interview_stage ?? null,
    rejection_reason: input.rejectionReason ?? existing?.rejection_reason ?? null,
    last_contacted_at: input.lastContactedAt ?? existing?.last_contacted_at ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("applications")
    .upsert(payload, { onConflict: "job_id" })
    .select("id")
    .single();
  const applicationId = assertNoError(error, "upsert application", data).id;

  await createApplicationEvent(
    db,
    applicationId,
    "status_changed",
    existing?.status ?? null,
    input.status,
    input.note,
    {
      appliedAt: input.appliedAt ?? null,
      appliedUrl: input.appliedUrl ?? null,
      resumeVersion: input.resumeVersion ?? null,
      outreachDraftVersion: input.outreachDraftVersion ?? null,
      responseReceived: input.responseReceived ?? null,
      responseType: input.responseType ?? null,
      interviewStage: input.interviewStage ?? null,
      rejectionReason: input.rejectionReason ?? null,
      lastContactedAt: input.lastContactedAt ?? null,
    },
  );

  const { error: jobError } = await db
    .from("jobs")
    .update({ status: maybeJobStatus(input.status), updated_at: new Date().toISOString() })
    .eq("id", jobId);
  assertNoError(jobError, "update job status from application", {});

  return applicationId;
}

export async function createFollowup(
  db: DbClient,
  jobId: number,
  applicationId: number | null,
  dueAt: string,
  note?: string,
  status: FollowupStatus = "pending",
): Promise<number> {
  const { data, error } = await db
    .from("followups")
    .insert({
      job_id: jobId,
      application_id: applicationId,
      due_at: dueAt,
      status,
      note: note ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const followupId = assertNoError(error, "create followup", data).id;
  if (applicationId != null) {
    await createApplicationEvent(db, applicationId, "followup_created", null, null, note, { dueAt, status });
  }
  return followupId;
}

export async function listPendingFollowups(db: DbClient): Promise<FollowupRecord[]> {
  const { data, error } = await db
    .from("followups")
    .select("*, jobs!inner(company_name, website, title)")
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .order("id", { ascending: true });
  const rows = assertNoError(error, "list pending followups", data) as DbRow[];
  return rows.map((row: DbRow) => normalizeFollowupRow(row));
}

export async function getFollowupById(
  db: DbClient,
  followupId: number,
): Promise<FollowupRecord | undefined> {
  const { data, error } = await db
    .from("followups")
    .select("*, jobs!inner(company_name, website, title)")
    .eq("id", followupId)
    .maybeSingle();
  if (error) throw new Error(`get followup by id: ${error.message}`);
  return data ? normalizeFollowupRow(data as Record<string, any>) : undefined;
}

export async function getPendingFollowupByJobId(
  db: DbClient,
  jobId: number,
): Promise<FollowupRecord | undefined> {
  const { data, error } = await db
    .from("followups")
    .select("*, jobs(company_name, website, title)")
    .eq("job_id", jobId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`get pending followup by job id: ${error.message}`);
  return data ? normalizeFollowupRow(data as Record<string, any>) : undefined;
}

export async function updateFollowup(
  db: DbClient,
  followupId: number,
  input: FollowupUpdateInput,
): Promise<void> {
  const existing = await getFollowupById(db, followupId);
  if (!existing) {
    throw new Error(`Follow-up ${followupId} not found.`);
  }

  const { error } = await db
    .from("followups")
    .update({
      due_at: input.dueAt ?? existing.due_at,
      status: input.status ?? existing.status,
      note: input.note ?? existing.note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", followupId);
  assertNoError(error, "update followup", {});

  if (existing.application_id != null) {
    const eventType =
      input.status === "done"
        ? "followup_done"
        : input.status === "skipped"
          ? "followup_skipped"
          : input.dueAt
            ? "followup_rescheduled"
            : "followup_updated";
    await createApplicationEvent(
      db,
      existing.application_id,
      eventType,
      null,
      null,
      input.note,
      {
        previousDueAt: existing.due_at,
        nextDueAt: input.dueAt ?? existing.due_at,
        nextStatus: input.status ?? existing.status,
      },
    );
  }
}

export async function getConversionStats(db: DbClient): Promise<ConversionStats> {
  const { data, error } = await db.from("applications").select("status");
  const rows = assertNoError(error, "get conversion stats", data) as StatusRow[];
  const statuses = rows.map((row: StatusRow) => row.status);
  return {
    saved: statuses.length,
    applied: statuses.filter((status) => ["applied", "followup_due", "replied", "interview", "rejected", "archived"].includes(status)).length,
    replied: statuses.filter((status) => ["replied", "interview", "rejected", "archived"].includes(status)).length,
    interview: statuses.filter((status) => status === "interview").length,
  };
}

export async function getScoreRangeStats(db: DbClient): Promise<ScoreRangeStats[]> {
  const jobs = await fetchJobsWithSource(db);
  const { data, error } = await db.from("applications").select("job_id, status");
  const applications = assertNoError(error, "get score range stats applications", data) as DbRow[];
  const byJob = new Map<number, ApplicationStatus>((applications ?? []).map((row: DbRow) => [Number(row.job_id), row.status as ApplicationStatus]));

  const buckets = new Map<string, ScoreRangeStats>();
  const labelFor = (score: number): string => {
    if (score >= 85) return "85-100";
    if (score >= 70) return "70-84";
    if (score >= 55) return "55-69";
    return "0-54";
  };

  for (const job of jobs) {
    const label = labelFor(job.score);
    const bucket = buckets.get(label) ?? { range: label, total: 0, applied: 0, replied: 0, interview: 0 };
    const status = byJob.get(job.id);
    bucket.total += 1;
    if (status && ["applied", "followup_due", "replied", "interview", "rejected", "archived"].includes(status)) bucket.applied += 1;
    if (status && ["replied", "interview", "rejected", "archived"].includes(status)) bucket.replied += 1;
    if (status === "interview") bucket.interview += 1;
    buckets.set(label, bucket);
  }

  const order = ["85-100", "70-84", "55-69", "0-54"];
  return order.map((label) => buckets.get(label) ?? { range: label, total: 0, applied: 0, replied: 0, interview: 0 });
}

export async function getSourceStats(db: DbClient): Promise<SourceStats[]> {
  const jobs = await fetchJobsWithSource(db);
  const { data, error } = await db.from("applications").select("job_id, status");
  const applications = assertNoError(error, "get source stats applications", data) as DbRow[];
  const byJob = new Map<number, ApplicationStatus>((applications ?? []).map((row: DbRow) => [Number(row.job_id), row.status as ApplicationStatus]));

  const buckets = new Map<string, SourceStats>();
  for (const job of jobs) {
    const source = job.provider ?? "unknown";
    const bucket = buckets.get(source) ?? { source, total: 0, applied: 0, replied: 0, interview: 0 };
    const status = byJob.get(job.id);
    bucket.total += 1;
    if (status && ["applied", "followup_due", "replied", "interview", "rejected", "archived"].includes(status)) bucket.applied += 1;
    if (status && ["replied", "interview", "rejected", "archived"].includes(status)) bucket.replied += 1;
    if (status === "interview") bucket.interview += 1;
    buckets.set(source, bucket);
  }

  return [...buckets.values()].sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));
}

export async function markJobStatus(
  db: DbClient,
  jobId: number,
  status: JobStatus,
): Promise<void> {
  const { error } = await db
    .from("jobs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  assertNoError(error, "mark job status", {});
}
