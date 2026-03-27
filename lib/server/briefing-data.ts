import { initDb } from "@/src/db";
import {
  getConversionStats,
  listBrowseJobs,
  listDrafts,
  listPendingFollowups,
} from "@/src/db/repositories";
import type { ApplicationStatus, BrowseJobRecord } from "@/src/db/types";
import { normalizeJobStatus } from "@/lib/server/web-data";
import type {
  BriefingDashboardData,
  BriefingDraftSummary,
  BriefingFollowupSummary,
  BriefingRoleSummary,
} from "@/lib/web/types";

type ApplicationRow = {
  id: number | string;
  status: ApplicationStatus;
  applied_at: string | null;
};

function percent(numerator: number, denominator: number): string | null {
  if (denominator === 0) return null;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function isAppliedOrBeyond(status: ApplicationStatus): boolean {
  return [
    "applied",
    "followup_due",
    "replied",
    "interview",
    "rejected",
    "archived",
  ].includes(status);
}

function summarizeRole(job: BrowseJobRecord): BriefingRoleSummary {
  const risk = job.risk_bullets_json[0] ?? "No major risk surfaced yet.";
  return {
    jobId: job.id,
    company: job.company_name,
    title: job.title ?? "(General)",
    score: job.score,
    status: normalizeJobStatus(job.application_status ?? job.status),
    url: job.job_url ?? null,
    skillMatches: job.extracted_skills_json.slice(0, 2),
    risk,
    riskLevel: job.risk_bullets_json.length > 0 ? "mid" : "low",
    discoveredAt: job.created_at,
  };
}

function summarizeDraftContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 100) return normalized;
  return `${normalized.slice(0, 97).trimEnd()}...`;
}

export async function getBriefingDashboardData(): Promise<BriefingDashboardData> {
  const db = await initDb();
  const now = new Date();
  const last24HoursCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last7DaysCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    topScoreJobs,
    highPriorityJobs,
    latestJobs,
    pendingFollowups,
    savedDrafts,
    conversion,
    applicationsResponse,
    totalTrackedResponse,
  ] = await Promise.all([
    listBrowseJobs(db, { realRolesOnly: true, sort: "score", limit: 1 }),
    listBrowseJobs(db, {
      minScore: 70,
      status: "new",
      realRolesOnly: true,
      sort: "score",
      limit: 5,
    }),
    listBrowseJobs(db, {
      minScore: 50,
      realRolesOnly: true,
      sort: "tracked",
      limit: 5000,
    }),
    listPendingFollowups(db),
    listDrafts(db),
    getConversionStats(db),
    db.from("applications").select("id, status, applied_at"),
    db.from("jobs").select("id", { count: "exact", head: true }),
  ]);

  if (applicationsResponse.error) {
    throw new Error(`briefing dashboard applications: ${applicationsResponse.error.message}`);
  }
  if (totalTrackedResponse.error) {
    throw new Error(`briefing dashboard tracked count: ${totalTrackedResponse.error.message}`);
  }

  const applicationRows = (applicationsResponse.data ?? []) as ApplicationRow[];
  const appliedAtByApplicationId = new Map<number, string | null>(
    applicationRows.map((row) => [Number(row.id), row.applied_at ?? null]),
  );

  const newTodayMatches = latestJobs.filter((job) => job.created_at >= last24HoursCutoff);
  const shortlisted = applicationRows.length;
  const appliedThisWeek = applicationRows.filter((row) =>
    row.applied_at != null
    && row.applied_at >= last7DaysCutoff
    && isAppliedOrBeyond(row.status),
  ).length;

  const followups = pendingFollowups.map((followup): BriefingFollowupSummary => {
    const appliedAt = followup.application_id != null
      ? appliedAtByApplicationId.get(followup.application_id) ?? null
      : null;
    const daysSinceApplied = appliedAt == null
      ? null
      : Math.max(0, Math.floor((now.getTime() - new Date(appliedAt).getTime()) / (24 * 60 * 60 * 1000)));

    return {
      followupId: followup.id,
      jobId: followup.job_id,
      company: followup.company_name,
      title: followup.title ?? "(General)",
      dueAt: followup.due_at,
      appliedAt,
      daysSinceApplied,
      overdue: new Date(followup.due_at).getTime() <= now.getTime(),
    };
  });

  const drafts = savedDrafts
    .filter((draft) => draft.application_status === "drafted" || draft.application_status == null)
    .map((draft): BriefingDraftSummary => {
      const content = draft.edited_content ?? draft.generated_content;
      return {
        draftId: draft.id,
        jobId: draft.job_id,
        company: draft.company_name,
        title: draft.title ?? "(General)",
        preview: summarizeDraftContent(content),
        content,
        variant: draft.variant,
        updatedAt: draft.updated_at,
      };
    });

  return {
    generatedAt: now.toISOString(),
    isMonday: now.getDay() === 1,
    summary: {
      newRoles: newTodayMatches.length,
      scored60Plus: newTodayMatches.filter((job) => job.score >= 60).length,
      followupsDue: followups.length,
    },
    metrics: {
      topScore: topScoreJobs[0]?.score ?? null,
      appliedThisWeek,
      followupsDue: followups.length,
    },
    highPriorityRoles: highPriorityJobs.map(summarizeRole),
    newTodayRoles: newTodayMatches.slice(0, 15).map(summarizeRole),
    followups,
    drafts,
    funnel: {
      stages: [
        {
          label: "Tracked",
          count: totalTrackedResponse.count ?? 0,
          conversionRate: null,
        },
        {
          label: "Shortlisted",
          count: shortlisted,
          conversionRate: percent(shortlisted, totalTrackedResponse.count ?? 0),
        },
        {
          label: "Applied",
          count: conversion.applied,
          conversionRate: percent(conversion.applied, shortlisted),
        },
        {
          label: "Responded",
          count: conversion.replied,
          conversionRate: percent(conversion.replied, conversion.applied),
        },
        {
          label: "Interview",
          count: conversion.interview,
          conversionRate: percent(conversion.interview, conversion.replied),
        },
      ],
    },
  };
}
