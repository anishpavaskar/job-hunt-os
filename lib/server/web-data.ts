import { initDb } from "@/src/db";
import {
  getConversionStats,
  getApplicationByJobId,
  getJobById,
  getLatestDraftByJobId,
  getPendingFollowupByJobId,
  listBrowseJobs,
  listDrafts,
  listNextActions,
  listPendingFollowups,
} from "@/src/db/repositories";
import type {
  ApplicationRecord,
  BrowseJobRecord,
  ConversionStats,
  DraftRecord,
  FollowupRecord,
  JobRecord,
  NextActionRecord,
} from "@/src/db/types";
import type {
  AnalyticsOverviewData,
  AnalyticsSourceKey,
  Job,
  JobApplicationDetail,
  JobDetailData,
  JobDraftDetail,
  JobFollowupDetail,
  PipelineStage,
  ShellSummary,
  TodayAction,
  WebJobSource,
  WebJobStatus,
} from "@/lib/web/types";

export const PIPELINE_ORDER: WebJobStatus[] = [
  "new",
  "reviewed",
  "saved",
  "shortlisted",
  "drafted",
  "applied",
  "followup_due",
  "replied",
  "interview",
  "rejected",
  "archived",
];

export const STATUS_LABELS: Record<WebJobStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  saved: "Saved",
  shortlisted: "Shortlisted",
  drafted: "Drafted",
  applied: "Applied",
  followup_due: "Follow-up due",
  replied: "Replied",
  interview: "Interview",
  rejected: "Rejected",
  archived: "Archived",
};

function normalizeSource(provider?: string | null): WebJobSource {
  switch ((provider ?? "").toLowerCase()) {
    case "yc":
      return "yc";
    case "greenhouse":
      return "greenhouse";
    case "lever":
      return "lever";
    case "linkedin":
      return "linkedin";
    case "indeed":
      return "indeed";
    default:
      return "careers";
  }
}

export function normalizeJobStatus(status: string | null | undefined): WebJobStatus {
  switch (status) {
    case "reviewed":
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
      return "new";
  }
}

export function toWebJob(job: JobRecord): Job {
  return {
    id: String(job.id),
    title: job.title ?? "(General)",
    company: job.company_name,
    location: job.locations,
    source: normalizeSource(job.provider),
    score: job.score,
    status: normalizeJobStatus(job.application_status ?? job.status),
    skills: job.extracted_skills_json,
    risks: job.risk_bullets_json,
    postedAt: job.posted_at ?? job.created_at,
    updatedAt: job.updated_at,
    url: job.job_url,
    description: job.summary,
    scoreBreakdown: job.score_breakdown_json,
    explanation: job.explanation_bullets_json,
    isProspect: Boolean(job.score_breakdown_json.prospect_listed),
  };
}

function formatCompensationValue(value: number | null, currency: string | null): string | null {
  if (value == null) return null;
  if (currency === "USD" || currency == null) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-US")}`;
  }
}

function formatCompensation(job: JobRecord): string | null {
  const min = formatCompensationValue(job.compensation_min, job.compensation_currency);
  const max = formatCompensationValue(job.compensation_max, job.compensation_currency);
  if (!min && !max) return null;

  const range = min && max ? `${min} - ${max}` : min ?? max ?? "";
  return job.compensation_period ? `${range} / ${job.compensation_period}` : range;
}

export function toWebApplicationDetail(application: ApplicationRecord): JobApplicationDetail {
  return {
    id: application.id,
    status: normalizeJobStatus(application.status),
    appliedAt: application.applied_at,
    notes: application.notes,
    interviewStage: application.interview_stage,
    lastContactedAt: application.last_contacted_at,
  };
}

export function toWebFollowupDetail(followup: FollowupRecord): JobFollowupDetail {
  return {
    id: followup.id,
    dueAt: followup.due_at,
    note: followup.note,
    overdue: new Date(followup.due_at).getTime() <= Date.now(),
  };
}

export function toWebDraftDetail(draft: DraftRecord): JobDraftDetail {
  return {
    id: draft.id,
    variant: draft.variant,
    content: draft.edited_content ?? draft.generated_content,
    updatedAt: draft.updated_at,
    gmailDraftId: draft.gmail_draft_id,
  };
}

export async function getJobDetailData(jobId: number): Promise<JobDetailData | null> {
  const db = await initDb();
  const job = await getJobById(db, jobId);
  if (!job) return null;

  const [application, followup, draft] = await Promise.all([
    getApplicationByJobId(db, jobId),
    getPendingFollowupByJobId(db, jobId),
    getLatestDraftByJobId(db, jobId),
  ]);

  return {
    ...toWebJob(job),
    remote: job.remote_flag,
    seniorityHint: job.seniority_hint,
    compensation: formatCompensation(job),
    sourceUrl: job.source_url,
    application: application ? toWebApplicationDetail(application) : null,
    followup: followup ? toWebFollowupDetail(followup) : null,
    draft: draft ? toWebDraftDetail(draft) : null,
  };
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "No completed scan yet";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

async function countLatestScannedSources(): Promise<{ sourcesScanned: number; latestCompletedAt: string | null }> {
  const db = await initDb();
  const { data: latest, error: latestError } = await db
    .from("scans")
    .select("started_at, completed_at")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    throw new Error(`latest scan summary: ${latestError.message}`);
  }
  if (!latest?.started_at) {
    return { sourcesScanned: 0, latestCompletedAt: null };
  }

  const { count, error } = await db
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("started_at", latest.started_at)
    .not("completed_at", "is", null);
  if (error) {
    throw new Error(`latest scan source count: ${error.message}`);
  }

  return {
    sourcesScanned: count ?? 0,
    latestCompletedAt: latest.completed_at ?? null,
  };
}

export async function getShellSummary(): Promise<ShellSummary> {
  const db = await initDb();
  const { count: trackedRoles, error: jobsError } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true });
  if (jobsError) {
    throw new Error(`tracked roles count: ${jobsError.message}`);
  }

  const [scanSummary, followups, drafts] = await Promise.all([
    countLatestScannedSources(),
    listPendingFollowups(db),
    listDrafts(db),
  ]);

  const draftsPending = drafts.filter((draft) =>
    draft.application_status === "drafted" || draft.application_status === null,
  ).length;

  return {
    trackedRoles: trackedRoles ?? 0,
    sourcesScanned: scanSummary.sourcesScanned,
    followupsDue: followups.length,
    draftsPending,
    latestCompletedAt: scanSummary.latestCompletedAt,
  };
}

export function getShellStatusLabel(summary: ShellSummary): string {
  return formatRelativeTime(summary.latestCompletedAt);
}

function toTodayAction(action: NextActionRecord): TodayAction {
  return {
    id: `${action.actionType}:${action.jobId}`,
    actionType: action.actionType,
    company: action.companyName,
    title: action.title ?? "(General)",
    score: action.score,
    reason: action.reason,
    nextStep: action.nextStep,
    dueAt: action.dueAt ?? null,
    location: action.locations,
    status: normalizeJobStatus(action.status),
    skills: action.extractedSkills,
    risk: action.risk,
    whyMatch: action.whyMatch,
  };
}

export async function getTodayActions(limit = 12): Promise<TodayAction[]> {
  const db = await initDb();
  const actions = await listNextActions(db, limit);
  return actions.map(toTodayAction);
}

function countStages(jobs: BrowseJobRecord[]): PipelineStage[] {
  const counts = new Map<WebJobStatus, number>(PIPELINE_ORDER.map((status) => [status, 0]));
  for (const job of jobs) {
    const status = normalizeJobStatus(job.application_status ?? job.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return PIPELINE_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: counts.get(status) ?? 0,
  }));
}

function summarizeDraft(draft: DraftRecord) {
  return {
    id: draft.id,
    company: draft.company_name,
    title: draft.title ?? "(General)",
    variant: draft.variant,
    updatedAt: draft.updated_at,
    gmailDraftId: draft.gmail_draft_id,
  };
}

function summarizeFollowup(followup: FollowupRecord) {
  return {
    id: followup.id,
    company: followup.company_name,
    title: followup.title ?? "(General)",
    dueAt: followup.due_at,
    note: followup.note,
  };
}

export async function getPipelineOverview(): Promise<{
  stages: PipelineStage[];
  followups: ReturnType<typeof summarizeFollowup>[];
  drafts: ReturnType<typeof summarizeDraft>[];
  conversion: ConversionStats;
}> {
  const db = await initDb();
  const [jobs, followups, drafts, conversion] = await Promise.all([
    listBrowseJobs(db, { limit: 5000, sort: "tracked" }),
    listPendingFollowups(db),
    listDrafts(db),
    getConversionStats(db),
  ]);

  return {
    stages: countStages(jobs),
    followups: followups.slice(0, 8).map(summarizeFollowup),
    drafts: drafts
      .filter((draft) => draft.application_status === "drafted" || draft.application_status === null)
      .slice(0, 8)
      .map(summarizeDraft),
    conversion,
  };
}

const ANALYTICS_SOURCE_ORDER: Array<{ key: AnalyticsSourceKey; label: string }> = [
  { key: "yc", label: "YC" },
  { key: "greenhouse", label: "Greenhouse" },
  { key: "lever", label: "Lever" },
  { key: "careers", label: "Careers" },
  { key: "manual", label: "Manual" },
];

const APPLIED_STATUSES = new Set(["applied", "followup_due", "replied", "interview", "rejected", "archived"]);
const RESPONDED_STATUSES = new Set(["replied", "interview", "rejected", "archived"]);

function normalizeAnalyticsSource(provider?: string | null): AnalyticsSourceKey {
  switch ((provider ?? "").toLowerCase()) {
    case "yc":
      return "yc";
    case "greenhouse":
      return "greenhouse";
    case "lever":
      return "lever";
    case "manual":
      return "manual";
    default:
      return "careers";
  }
}

function makeScoreDistribution(jobs: BrowseJobRecord[]): AnalyticsOverviewData["scoreDistribution"] {
  const buckets: AnalyticsOverviewData["scoreDistribution"] = Array.from({ length: 10 }, (_, index) => {
    const rangeStart = index * 10;
    const rangeEnd = index === 9 ? 100 : rangeStart + 9;
    return {
      label: `${rangeStart}-${rangeEnd}`,
      rangeStart,
      rangeEnd,
      count: 0,
      color: rangeStart >= 80 ? "green" : rangeStart >= 60 ? "amber" : "gray",
    };
  });

  for (const job of jobs) {
    const score = Math.max(0, Math.min(100, Math.round(job.score)));
    const bucketIndex = Math.min(9, Math.floor(score / 10));
    buckets[bucketIndex] = {
      ...buckets[bucketIndex],
      count: buckets[bucketIndex].count + 1,
    };
  }

  return buckets;
}

function makeSourceBreakdown(jobs: BrowseJobRecord[]): AnalyticsOverviewData["sourceBreakdown"] {
  const summary = new Map<AnalyticsSourceKey, { roles: number; scoreTotal: number; roles60Plus: number; appliedCount: number }>(
    ANALYTICS_SOURCE_ORDER.map(({ key }) => [key, { roles: 0, scoreTotal: 0, roles60Plus: 0, appliedCount: 0 }]),
  );

  for (const job of jobs) {
    const key = normalizeAnalyticsSource(job.provider);
    const current = summary.get(key)!;
    current.roles += 1;
    current.scoreTotal += job.score;
    if (job.score >= 60) current.roles60Plus += 1;
    if (APPLIED_STATUSES.has(job.status)) current.appliedCount += 1;
  }

  return ANALYTICS_SOURCE_ORDER.map(({ key, label }) => {
    const current = summary.get(key)!;
    return {
      source: key,
      label,
      roles: current.roles,
      averageScore: current.roles === 0 ? 0 : current.scoreTotal / current.roles,
      roles60Plus: current.roles60Plus,
      appliedCount: current.appliedCount,
    };
  });
}

function hasReachedShortlisted(status: string): boolean {
  return ["shortlisted", "drafted", "applied", "followup_due", "replied", "interview", "rejected", "archived"].includes(status);
}

function hasReachedDrafted(status: string): boolean {
  return ["drafted", "applied", "followup_due", "replied", "interview", "rejected", "archived"].includes(status);
}

function makeFunnel(jobs: BrowseJobRecord[]): AnalyticsOverviewData["funnel"] {
  const stages = [
    { key: "new", label: "New", count: jobs.length },
    { key: "shortlisted", label: "Shortlisted", count: jobs.filter((job) => hasReachedShortlisted(job.status)).length },
    { key: "drafted", label: "Drafted", count: jobs.filter((job) => hasReachedDrafted(job.status)).length },
    { key: "applied", label: "Applied", count: jobs.filter((job) => APPLIED_STATUSES.has(job.status)).length },
    { key: "responded", label: "Responded", count: jobs.filter((job) => RESPONDED_STATUSES.has(job.status)).length },
    { key: "interview", label: "Interview", count: jobs.filter((job) => job.status === "interview").length },
  ] as AnalyticsOverviewData["funnel"];

  return stages.map((stage, index) => {
    if (index === 0) {
      return { ...stage, conversionFromPrevious: null };
    }

    const previous = stages[index - 1].count;
    return {
      ...stage,
      conversionFromPrevious: previous === 0 ? 0 : stage.count / previous,
    };
  });
}

function makeTimeline(jobs: BrowseJobRecord[]): AnalyticsOverviewData["timeline"] {
  const points: AnalyticsOverviewData["timeline"] = [];
  const counts = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    counts.set(key, 0);
    points.push({ date: key, count: 0 });
  }

  for (const job of jobs) {
    const key = job.created_at.slice(0, 10);
    if (!counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return points.map((point) => ({
    ...point,
    count: counts.get(point.date) ?? 0,
  }));
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverviewData> {
  const db = await initDb();
  const [jobs, applicationsResult, eventsResult] = await Promise.all([
    listBrowseJobs(db, { limit: 100000, sort: "tracked" }),
    db.from("applications").select("id, status, applied_at, response_received, last_contacted_at, updated_at"),
    db.from("application_events").select("application_id, next_status, created_at"),
  ]);

  if (applicationsResult.error) {
    throw new Error(`analytics applications: ${applicationsResult.error.message}`);
  }
  if (eventsResult.error) {
    throw new Error(`analytics application events: ${eventsResult.error.message}`);
  }

  const applications = (applicationsResult.data ?? []) as Array<{
    id: number;
    status: string;
    applied_at: string | null;
    response_received: boolean;
    last_contacted_at: string | null;
    updated_at: string;
  }>;
  const responseEvents = new Map<number, string>();
  for (const event of (eventsResult.data ?? []) as Array<{ application_id: number; next_status: string | null; created_at: string }>) {
    if (!event.next_status || !RESPONDED_STATUSES.has(event.next_status)) continue;
    const previous = responseEvents.get(event.application_id);
    if (!previous || event.created_at < previous) {
      responseEvents.set(event.application_id, event.created_at);
    }
  }

  const applicationsSent = applications.filter((application) => APPLIED_STATUSES.has(application.status)).length;
  const responsesReceived = applications.filter((application) => RESPONDED_STATUSES.has(application.status)).length;
  const responseDurationsDays = applications.flatMap((application) => {
    if (!application.applied_at || !RESPONDED_STATUSES.has(application.status)) return [];

    const responseAt =
      responseEvents.get(application.id)
      ?? application.last_contacted_at
      ?? (application.response_received ? application.updated_at : null)
      ?? application.updated_at;

    const diffMs = new Date(responseAt).getTime() - new Date(application.applied_at).getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return [];
    return [diffMs / 86_400_000];
  });

  return {
    summary: {
      totalRolesTracked: jobs.length,
      rolesScored70Plus: jobs.filter((job) => job.score >= 70).length,
      applicationsSent,
      responsesReceived,
      responseRate: applicationsSent === 0 ? 0 : responsesReceived / applicationsSent,
      averageDaysToResponse:
        responseDurationsDays.length === 0
          ? null
          : responseDurationsDays.reduce((sum, value) => sum + value, 0) / responseDurationsDays.length,
    },
    scoreDistribution: makeScoreDistribution(jobs),
    sourceBreakdown: makeSourceBreakdown(jobs),
    funnel: makeFunnel(jobs),
    timeline: makeTimeline(jobs),
  };
}

export async function getPipelineJobs(): Promise<Job[]> {
  const db = await initDb();
  const jobs = await listBrowseJobs(db, { limit: 5000, sort: "tracked" });
  return jobs.map(toWebJob);
}
