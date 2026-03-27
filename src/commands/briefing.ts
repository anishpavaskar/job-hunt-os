import { Command } from "commander";
import { initDb } from "../db";
import {
  getApplicationEvents,
  listBrowseJobs,
  listPendingFollowups,
  listDrafts,
  getConversionStats,
  listNextActions,
  listJobs,
} from "../db/repositories";
import { getProspectMatch, loadProspectCompanies } from "../ingest/prospect";
import type {
  BriefingData,
  BriefingNewRole,
  BriefingFollowup,
  BriefingDraft,
  BriefingFunnel,
  BriefingApplyNowRole,
} from "../briefing/types";
import { countActualNewRoles } from "../briefing/types";
import { sendBriefingHtmlEmail } from "../integrations/gmail";
import { loadProfile } from "../config/profile";
import type { Profile } from "../config/types";
import type { ApplicationStatus, JobRecord } from "../db/types";

type DbStatusRow = { status: string; applied_at?: string | null };
type DbApplicationRefRow = { id: number | string; applied_at: string | null };
type DbApplicationJobRow = { job_id: number | string; status: string };

// ─── Data assembly (exported for testing) ──────────────────────

export const DEFAULT_BRIEFING_MIN_SCORE = 50;
export const DEFAULT_BRIEFING_LOOKBACK_DAYS = 14;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function getDateWindow(dateStr?: string): { startIso: string; endIso: string } | null {
  if (!dateStr) return null;
  const date = dateStr;
  return {
    startIso: `${date}T00:00:00.000Z`,
    endIso: `${date}T23:59:59.999Z`,
  };
}

function percent(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function isMonday(dateStr?: string): boolean {
  const d = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
  return d.getDay() === 1;
}

function computeStackMatch(extractedSkills: string[], profile: Profile | null): number {
  if (!profile || extractedSkills.length === 0) return 0;
  const skillsLower = new Set(extractedSkills.map((s) => s.toLowerCase()));
  const tier1Count = profile.skills_tier1.filter((s) => skillsLower.has(s.toLowerCase())).length;
  const tier2Count = profile.skills_tier2.filter((s) => skillsLower.has(s.toLowerCase())).length;
  return Math.min(tier1Count * 2 + tier2Count, 10);
}

function formatLocationForBriefing(locations: string): string {
  return locations
    .split(/[|;]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" • ");
}

function safeFormatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export async function assembleNewRoles(
  db: Awaited<ReturnType<typeof initDb>>,
  prospectNames: Set<string>,
  dateStr?: string,
  opts: { includeFallback?: boolean; minScore?: number; profile?: Profile | null } = {},
): Promise<BriefingNewRole[]> {
  const dateWindow = getDateWindow(dateStr);
  const includeFallback = opts.includeFallback ?? false;
  const minScore = opts.minScore ?? DEFAULT_BRIEFING_MIN_SCORE;
  const profile = opts.profile ?? null;
  let rows = await listBrowseJobs(db, {
    minScore,
    realRolesOnly: !includeFallback,
    sort: "score",
    limit: 5000,
  });
  const { data: applicationsData, error: applicationsError } = await db.from("applications").select("job_id,status");
  if (applicationsError) {
    throw new Error(`assemble new roles applications: ${applicationsError.message}`);
  }
  const applicationStatusByJobId = new Map<number, ApplicationStatus>(
    ((applicationsData ?? []) as DbApplicationJobRow[]).map((row: DbApplicationJobRow) => [
      Number(row.job_id),
      row.status as ApplicationStatus,
    ]),
  );

  rows = rows
    .filter((job) => includeFallback || job.role_source !== "company_fallback")
    .filter((job) => {
      if (dateWindow) {
        const created = new Date(job.created_at).toISOString();
        return created >= dateWindow.startIso && created <= dateWindow.endIso;
      }
      return ["new", "reviewed", "saved", "shortlisted", "drafted"].includes(job.status);
    })
    .sort((a, b) => b.score - a.score || a.company_name.localeCompare(b.company_name))
    .slice(0, 50);

  const MAX_ROLES_PER_COMPANY = 2;
  const output: BriefingNewRole[] = [];
  const companyCounts = new Map<string, number>();
  const totalPerCompany = new Map<string, number>();
  let rankCounter = 1;

  for (const row of rows) {
    const companyLower = row.company_name.toLowerCase();
    const companyTotal = (totalPerCompany.get(companyLower) ?? 0) + 1;
    totalPerCompany.set(companyLower, companyTotal);
  }

  for (const row of rows) {
    const companyLower = row.company_name.toLowerCase();
    const isProspect = prospectNames.has(companyLower) || getProspectMatch(row.company_name) !== null;
    const seen = (companyCounts.get(companyLower) ?? 0) + 1;
    companyCounts.set(companyLower, seen);

    if (seen > MAX_ROLES_PER_COMPANY) {
      const overflowCount = (totalPerCompany.get(companyLower) ?? 0) - MAX_ROLES_PER_COMPANY;
      if (overflowCount > 0 && !output.some((role) => role.kind === "overflow" && role.company === row.company_name)) {
        output.push({
          kind: "overflow" as const,
          rank: null,
          score: null,
          company: row.company_name,
          role: `+${overflowCount} more roles at ${row.company_name}`,
          location: "",
          whyItFits: "Similar roles hidden to keep the briefing readable",
          topRisk: null,
          applyLink: null,
          isProspect,
          remoteFlag: row.remote_flag,
          discoveredDate: safeFormatDate(row.created_at) ?? "",
          postedDate: safeFormatDate(row.posted_at),
          extractedSkills: [],
          stackMatch: 0,
          applicationStatus: null,
        });
      }
      continue;
    }

    const explanations = row.explanation_bullets_json;
    const risks = row.risk_bullets_json;
    const extractedSkills = row.extracted_skills_json;
    const stackMatch = computeStackMatch(extractedSkills, profile);
    const applicationStatus = applicationStatusByJobId.get(row.id) ?? null;

    output.push({
      kind: "role",
      rank: rankCounter,
      score: row.score,
      company: row.company_name,
      role: row.title ?? "(General)",
      location: row.locations,
      whyItFits: explanations[0] ?? "Strong overall fit score",
      topRisk: risks[0] ?? null,
      applyLink: row.job_url,
      isProspect,
      remoteFlag: row.remote_flag,
      discoveredDate: safeFormatDate(row.created_at) ?? "",
      postedDate: safeFormatDate(row.posted_at),
      extractedSkills,
      stackMatch,
      applicationStatus,
    });
    rankCounter += 1;
  }

  return output;
}

export async function assembleFollowups(db: Awaited<ReturnType<typeof initDb>>): Promise<BriefingFollowup[]> {
  const followups = await listPendingFollowups(db);
  const { data: applicationsData, error: applicationsError } = await db
    .from("applications")
    .select("id, applied_at");
  if (applicationsError) {
    throw new Error(`assemble followups applications: ${applicationsError.message}`);
  }
  const appliedAtById = new Map<number, string | null>(
    ((applicationsData ?? []) as DbApplicationRefRow[]).map((row: DbApplicationRefRow) => [
      Number(row.id),
      row.applied_at,
    ]),
  );

  return Promise.all(followups.map(async (f) => {
    let lastAction = "Follow-up scheduled";
    let appliedDate: string | null = null;

    if (f.application_id) {
      const event = (await getApplicationEvents(db, f.application_id)).slice(-1)[0];
      if (event) {
        lastAction = `${event.event_type.replace(/_/g, " ")} (${formatDate(event.created_at)})`;
      }

      const appliedAt = appliedAtById.get(f.application_id) ?? null;
      if (appliedAt) {
        appliedDate = formatDate(appliedAt);
      }
    }

    return {
      company: f.company_name,
      role: f.title,
      dueDate: formatDate(f.due_at),
      lastAction,
      notes: f.note,
      appliedDate,
    };
  }));
}

export async function assembleApplyNow(
  db: Awaited<ReturnType<typeof initDb>>,
): Promise<BriefingApplyNowRole[]> {
  const seenCompanies = new Set<string>();
  const primary = (await listNextActions(db, 50))
    .filter((action) => action.actionType === "apply")
    .filter((action) => {
      const key = action.companyName.toLowerCase();
      if (seenCompanies.has(key)) return false;
      seenCompanies.add(key);
      return true;
    })
    .slice(0, 5)
    .map((action, i) => {
      const risk = action.risk ?? null;
      const title = action.title ?? "(General)";
      const location = formatLocationForBriefing(action.locations);
      return {
        rank: i + 1,
        score: action.score,
        company: action.companyName,
        role: title,
        location,
        whyNow: action.reason,
        topRisk: risk,
        applyLink: "",
      };
    });

  if (primary.length > 0) {
    return primary;
  }

  const fallbackSeen = new Set<string>();
  const fallbackCandidates = (await listJobs(db, {
    minScore: 50,
    todayOnly: true,
    limit: 50,
  }))
    .filter((job) => job.role_source !== "company_fallback")
    .filter((job) => {
      const breakdown = job.score_breakdown_json;
      const combined = breakdown.roleFit + breakdown.stackFit;
      const bestDimension = Math.max(breakdown.roleFit, breakdown.stackFit);
      return combined >= 18 && bestDimension >= 10;
    })
    .filter((job) => {
      const key = job.company_name.toLowerCase();
      if (fallbackSeen.has(key)) return false;
      fallbackSeen.add(key);
      return true;
    })
    .slice(0, 5);

  return fallbackCandidates.map((job, index) => {
    const explanations = job.explanation_bullets_json;
    const risks = job.risk_bullets_json;
    return {
      rank: index + 1,
      score: job.score,
      company: job.company_name,
      role: job.title ?? "(General)",
      location: formatLocationForBriefing(job.locations),
      whyNow: explanations[0] ?? "Good technical match worth reviewing today",
      topRisk: risks[0] ?? null,
      applyLink: job.job_url,
    };
  });
}

export async function assembleDrafts(db: Awaited<ReturnType<typeof initDb>>): Promise<BriefingDraft[]> {
  const allDrafts = await listDrafts(db);

  return allDrafts
    .filter((d) => d.application_status === "drafted" || d.application_status === null)
    .map((d) => ({
      company: d.company_name,
      role: d.title,
      draftVariant: d.variant,
      createdDate: formatDate(d.created_at),
    }));
}

export async function assembleWeeklyFunnel(db: Awaited<ReturnType<typeof initDb>>): Promise<BriefingFunnel> {
  const { count: totalTracked, error: jobsError } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true });
  if (jobsError) {
    throw new Error(`assemble weekly funnel jobs: ${jobsError.message}`);
  }

  const weekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: applicationsData, error: applicationsError } = await db
    .from("applications")
    .select("applied_at,status");
  if (applicationsError) {
    throw new Error(`assemble weekly funnel applications: ${applicationsError.message}`);
  }
  const weekApplied = ((applicationsData ?? []) as DbStatusRow[]).filter((row: DbStatusRow) =>
    row.applied_at && row.applied_at >= weekCutoff
    && ["applied", "followup_due", "replied", "interview", "rejected", "archived"].includes(row.status as string),
  ).length;

  const conversion = await getConversionStats(db);

  return {
    totalTracked: totalTracked ?? 0,
    appliedThisWeek: weekApplied,
    responsesReceived: conversion.replied,
    interviewsScheduled: conversion.interview,
    applyToResponseRate: percent(conversion.replied, conversion.applied),
    responseToInterviewRate: percent(conversion.interview, conversion.replied),
  };
}

async function countLatestScannedSources(db: Awaited<ReturnType<typeof initDb>>): Promise<number> {
  const { data: latest, error: latestError } = await db
    .from("scans")
    .select("started_at")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    throw new Error(`count latest scanned sources: ${latestError.message}`);
  }
  if (!latest?.started_at) return 0;
  const { count, error } = await db
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("started_at", latest.started_at)
    .not("completed_at", "is", null);
  if (error) {
    throw new Error(`count latest scanned sources: ${error.message}`);
  }
  return count ?? 0;
}

export async function assembleBriefingData(
  db: Awaited<ReturnType<typeof initDb>>,
  dateOverride?: string,
  opts: { includeFallback?: boolean; minScore?: number } = {},
): Promise<BriefingData> {
  const date = dateOverride ?? todayISO();
  const roleWindowDate = dateOverride;
  const prospectCompanies = loadProspectCompanies();
  const prospectNames = new Set(prospectCompanies.map((c) => c.name.toLowerCase()));

  let profile: Profile | null = null;
  try {
    profile = loadProfile() ?? null;
  } catch {
    console.warn("[briefing] Failed to load profile.json; stackMatch metrics will default to 0");
  }

  const { count: totalTrackedCount, error: totalTrackedError } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true });
  if (totalTrackedError) {
    throw new Error(`assemble briefing total tracked: ${totalTrackedError.message}`);
  }

  const { data: applicationsData, error: applicationsError } = await db
    .from("applications")
    .select("status");
  if (applicationsError) {
    throw new Error(`assemble briefing applications: ${applicationsError.message}`);
  }
  const applicationStatuses = ((applicationsData ?? []) as DbStatusRow[]).map((row: DbStatusRow) => row.status);
  const appliedCount = applicationStatuses.filter((status: string) =>
    ["applied", "followup_due", "replied", "interview", "rejected", "archived", "offer"].includes(status),
  ).length;

  const workflowCounts = {
    saved: applicationStatuses.filter((status: string) => ["saved", "shortlisted"].includes(status)).length,
    drafted: applicationStatuses.filter((status: string) => status === "drafted").length,
    applied: applicationStatuses.filter((status: string) => ["applied", "followup_due", "replied", "rejected", "archived"].includes(status)).length,
    interview: applicationStatuses.filter((status: string) => status === "interview").length,
  };

  const sourcesScanned = await countLatestScannedSources(db);

  const applyNow = await assembleApplyNow(db);

  return {
    date,
    applyNow,
    newRoles: await assembleNewRoles(db, prospectNames, roleWindowDate, { ...opts, profile }),
    followups: await assembleFollowups(db),
    drafts: await assembleDrafts(db),
    funnel: isMonday(date) ? await assembleWeeklyFunnel(db) : null,
    appliedCount,
    workflowCounts,
    totalTracked: totalTrackedCount ?? 0,
    sourcesScanned,
  };
}

// ─── CLI command ───────────────────────────────────────────────

export interface BriefingCommandOptions {
  scan?: boolean;
  date?: string;
  includeFallback?: boolean;
}

export async function runBriefingCommand(opts: BriefingCommandOptions = {}): Promise<void> {
  if (opts.scan !== false) {
    console.log("[briefing] Scanning all sources...");
    try {
      const { runScanCommand } = await import("./scan");
      const scanResult = await runScanCommand();
      console.log(
        `[briefing] Scan done. Upserted ${scanResult.upserted} roles (${scanResult.newCount} new).`,
      );
    } catch (err) {
      console.warn(
        `[briefing] Scan failed, continuing with existing data: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const db = await initDb();
  const data = await assembleBriefingData(db, opts.date, { includeFallback: opts.includeFallback });
  const newRoleCount = countActualNewRoles(data.newRoles);

  console.log(`[briefing] Assembling briefing for ${data.date}`);
  console.log(
    `  Newly discovered (${DEFAULT_BRIEFING_MIN_SCORE}+, ${opts.includeFallback ? "including fallback" : "real roles only"}): ${newRoleCount}`,
  );
  console.log(`  Best apply-now: ${data.applyNow.length}`);
  console.log(`  Pending follow-ups: ${data.followups.length}`);
  console.log(`  Unsent drafts: ${data.drafts.length}`);
  if (data.funnel) {
    console.log(
      `  Weekly funnel: ${data.funnel.totalTracked} tracked, ${data.funnel.appliedThisWeek} applied this week`,
    );
  }

  try {
    const messageId = await sendBriefingHtmlEmail(data);
    console.log(`\n[briefing] Email sent (message ID: ${messageId})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Missing Google credentials")) {
      console.error(`[briefing] ${msg}`);
      console.error(
        "[briefing] Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in .env",
      );
    } else if (msg.includes("MY_EMAIL")) {
      console.error(`[briefing] ${msg}`);
      console.error(
        "[briefing] Set MY_EMAIL (or NOTIFY_EMAIL_TO) in .env to specify the recipient.",
      );
    } else {
      throw err;
    }
  }
}

export function registerBriefingCommand(): Command {
  return new Command("briefing")
    .description("Send today's job hunt briefing as a styled HTML email via Gmail")
    .option("--no-scan", "Skip scanning sources before generating briefing")
    .option("--date <date>", "Override the briefing date (YYYY-MM-DD)")
    .option("--include-fallback", "include company-level fallback records in briefing new roles")
    .action(async (opts: BriefingCommandOptions) => {
      await runBriefingCommand(opts);
    });
}
