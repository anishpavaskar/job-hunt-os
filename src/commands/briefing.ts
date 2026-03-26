import Database from "better-sqlite3";
import { Command } from "commander";
import { initDb } from "../db";
import {
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
import { countVisibleNewRoles } from "../briefing/types";
import { sendBriefingHtmlEmail } from "../integrations/gmail";
import { loadProfile } from "../config/profile";
import type { Profile } from "../config/types";
import type { JobRecord } from "../db/types";

// ─── Data assembly (exported for testing) ──────────────────────

export const DEFAULT_BRIEFING_MIN_SCORE = 50;
export const DEFAULT_BRIEFING_LOOKBACK_DAYS = 14;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function getDateWindow(dateStr?: string): { startIso: string; endIso: string } {
  if (!dateStr) {
    const end = new Date();
    const start = new Date(end.getTime() - DEFAULT_BRIEFING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    };
  }

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

function parseJsonArray(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function formatLocationForBriefing(locations: string): string {
  return locations
    .split(/[|;]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" • ");
}

export function assembleNewRoles(
  db: Database.Database,
  prospectNames: Set<string>,
  dateStr?: string,
  opts: { includeFallback?: boolean; minScore?: number; profile?: Profile | null } = {},
): BriefingNewRole[] {
  const { startIso, endIso } = getDateWindow(dateStr);
  const includeFallback = opts.includeFallback ?? false;
  const minScore = opts.minScore ?? DEFAULT_BRIEFING_MIN_SCORE;
  const profile = opts.profile ?? null;
  const fallbackClause = includeFallback ? "" : `AND jobs.role_source != 'company_fallback'`;
  const rows = db
    .prepare(
      `SELECT jobs.*, job_sources.external_id, job_sources.url AS source_url, applications.status AS application_status
       FROM jobs
       JOIN job_sources ON job_sources.id = jobs.source_id
       LEFT JOIN applications ON applications.job_id = jobs.id
       WHERE jobs.score >= ?
         AND datetime(jobs.created_at) >= datetime(?)
         AND datetime(jobs.created_at) <= datetime(?)
         ${fallbackClause}
       ORDER BY jobs.score DESC, jobs.company_name ASC
       LIMIT 50`,
    )
    .all(minScore, startIso, endIso) as JobRecord[];

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
          remoteFlag: row.remote_flag === 1,
          extractedSkills: [],
          stackMatch: 0,
          applicationStatus: null,
        });
      }
      continue;
    }

    const explanations = parseJsonArray(row.explanation_bullets_json);
    const risks = parseJsonArray(row.risk_bullets_json);
    const extractedSkills = parseJsonArray(row.extracted_skills_json);
    const stackMatch = computeStackMatch(extractedSkills, profile);
    const applicationStatus = (row as JobRecord & { application_status?: string | null }).application_status ?? null;

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
      remoteFlag: row.remote_flag === 1,
      extractedSkills,
      stackMatch,
      applicationStatus,
    });
    rankCounter += 1;
  }

  return output;
}

export function assembleFollowups(db: Database.Database): BriefingFollowup[] {
  const followups = listPendingFollowups(db);

  return followups.map((f) => {
    let lastAction = "Follow-up scheduled";
    let appliedDate: string | null = null;

    if (f.application_id) {
      const event = db
        .prepare(
          `SELECT event_type, created_at FROM application_events
           WHERE application_id = ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(f.application_id) as { event_type: string; created_at: string } | undefined;
      if (event) {
        lastAction = `${event.event_type.replace(/_/g, " ")} (${formatDate(event.created_at)})`;
      }

      const application = db
        .prepare(`SELECT applied_at FROM applications WHERE id = ?`)
        .get(f.application_id) as { applied_at: string | null } | undefined;
      if (application?.applied_at) {
        appliedDate = formatDate(application.applied_at);
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
  });
}

export function assembleApplyNow(
  db: Database.Database,
): BriefingApplyNowRole[] {
  const seenCompanies = new Set<string>();
  const primary = listNextActions(db, 50)
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
  const fallbackCandidates = listJobs(db, {
    minScore: 50,
    todayOnly: true,
    limit: 50,
  })
    .filter((job) => job.role_source !== "company_fallback")
    .filter((job) => {
      const breakdown = JSON.parse(job.score_breakdown_json) as {
        roleFit: number;
        stackFit: number;
      };
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
    const explanations: string[] = JSON.parse(job.explanation_bullets_json);
    const risks: string[] = JSON.parse(job.risk_bullets_json);
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

export function assembleDrafts(db: Database.Database): BriefingDraft[] {
  const allDrafts = listDrafts(db);

  return allDrafts
    .filter((d) => d.application_status === "drafted" || d.application_status === null)
    .map((d) => ({
      company: d.company_name,
      role: d.title,
      draftVariant: d.variant,
      createdDate: formatDate(d.created_at),
    }));
}

export function assembleWeeklyFunnel(db: Database.Database): BriefingFunnel {
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM jobs`)
    .get() as { count: number };

  const weekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const weekApplied = db
    .prepare(
      `SELECT COUNT(*) AS count FROM applications
       WHERE applied_at >= ? AND status IN ('applied', 'followup_due', 'replied', 'interview', 'rejected', 'archived')`,
    )
    .get(weekCutoff) as { count: number };

  const conversion = getConversionStats(db);

  return {
    totalTracked: totalRow.count,
    appliedThisWeek: weekApplied.count,
    responsesReceived: conversion.replied,
    interviewsScheduled: conversion.interview,
    applyToResponseRate: percent(conversion.replied, conversion.applied),
    responseToInterviewRate: percent(conversion.interview, conversion.replied),
  };
}

function countLatestScannedSources(db: Database.Database): number {
  const latest = db
    .prepare(`SELECT started_at FROM scans WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1`)
    .get() as { started_at: string } | undefined;
  if (!latest?.started_at) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM scans WHERE started_at = ? AND completed_at IS NOT NULL`)
    .get(latest.started_at) as { count: number };
  return row.count;
}

export function assembleBriefingData(
  db: Database.Database,
  dateOverride?: string,
  opts: { includeFallback?: boolean; minScore?: number } = {},
): BriefingData {
  const date = dateOverride ?? todayISO();
  const prospectCompanies = loadProspectCompanies();
  const prospectNames = new Set(prospectCompanies.map((c) => c.name.toLowerCase()));

  let profile: Profile | null = null;
  try {
    profile = loadProfile() ?? null;
  } catch {
    console.warn("[briefing] Failed to load profile.json; stackMatch metrics will default to 0");
  }

  const totalTracked = (
    db.prepare(`SELECT COUNT(*) AS count FROM jobs`).get() as { count: number }
  ).count;

  const appliedCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM applications
         WHERE status IN ('applied', 'followup_due', 'replied', 'interview', 'rejected', 'archived', 'offer')`,
      )
      .get() as { count: number }
  ).count;

  const workflowCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('saved', 'shortlisted') THEN 1 ELSE 0 END) AS saved,
         SUM(CASE WHEN status = 'drafted' THEN 1 ELSE 0 END) AS drafted,
         SUM(CASE WHEN status IN ('applied', 'followup_due', 'replied', 'rejected', 'archived') THEN 1 ELSE 0 END) AS applied,
         SUM(CASE WHEN status = 'interview' THEN 1 ELSE 0 END) AS interview
       FROM applications`,
    )
    .get() as {
      saved: number | null;
      drafted: number | null;
      applied: number | null;
      interview: number | null;
    };

  const sourcesScanned = countLatestScannedSources(db);

  const applyNow = assembleApplyNow(db);

  return {
    date,
    applyNow,
    newRoles: assembleNewRoles(db, prospectNames, date, { ...opts, profile }),
    followups: assembleFollowups(db),
    drafts: assembleDrafts(db),
    funnel: isMonday(date) ? assembleWeeklyFunnel(db) : null,
    appliedCount,
    workflowCounts: {
      saved: workflowCounts.saved ?? 0,
      drafted: workflowCounts.drafted ?? 0,
      applied: workflowCounts.applied ?? 0,
      interview: workflowCounts.interview ?? 0,
    },
    totalTracked,
    sourcesScanned,
  };
}

export function getBriefingSmsSummary(data: BriefingData): { newRoleCount: number; topScore: number } {
  const visibleRolesCount = countVisibleNewRoles(data.newRoles);
  const topRole = data.newRoles.find((role) => role.kind !== "overflow");
  return {
    newRoleCount: visibleRolesCount,
    topScore: topRole?.score ?? 0,
  };
}

// ─── CLI command ───────────────────────────────────────────────

export function registerBriefingCommand(): Command {
  return new Command("briefing")
    .description("Send today's job hunt briefing as a styled HTML email via Gmail")
    .option("--no-scan", "Skip scanning sources before generating briefing")
    .option("--date <date>", "Override the briefing date (YYYY-MM-DD)")
    .option("--include-fallback", "include company-level fallback records in briefing new roles")
    .action(async (opts: { scan?: boolean; date?: string; includeFallback?: boolean }) => {
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

      const db = initDb();
      const data = assembleBriefingData(db, opts.date, { includeFallback: opts.includeFallback });

      console.log(`[briefing] Assembling briefing for ${data.date}`);
      const summary = getBriefingSmsSummary(data);
      console.log(
        `  Newly discovered (${DEFAULT_BRIEFING_MIN_SCORE}+, ${opts.includeFallback ? "including fallback" : "real roles only"}): ${summary.newRoleCount}`,
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
    });
}
