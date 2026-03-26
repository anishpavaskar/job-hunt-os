import Database from "better-sqlite3";
import { Command } from "commander";
import { initDb } from "../db";
import {
  listPendingFollowups,
  listDrafts,
  getConversionStats,
} from "../db/repositories";
import { loadProspectCompanies } from "../ingest/prospect";
import type {
  BriefingData,
  BriefingNewRole,
  BriefingFollowup,
  BriefingDraft,
  BriefingFunnel,
} from "../integrations/google-docs";
import { createOrUpdateBriefingDoc } from "../integrations/google-docs";
import { isTwilioConfigured, sendDailyBriefingSMS } from "../integrations/twilio";
import type { JobRecord } from "../db/types";

// ─── Data assembly (exported for testing) ──────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function getDateWindow(dateStr?: string): { startIso: string; endIso: string } {
  const date = dateStr ?? todayISO();
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

export function assembleNewRoles(
  db: Database.Database,
  prospectNames: Set<string>,
  dateStr?: string,
): BriefingNewRole[] {
  const { startIso, endIso } = getDateWindow(dateStr);
  const rows = db
    .prepare(
      `SELECT jobs.*, job_sources.external_id, job_sources.url AS source_url
       FROM jobs
       JOIN job_sources ON job_sources.id = jobs.source_id
       WHERE jobs.score >= 60
         AND jobs.created_at >= ?
         AND jobs.created_at <= ?
       ORDER BY jobs.score DESC, jobs.company_name ASC
       LIMIT 50`,
    )
    .all(startIso, endIso) as JobRecord[];

  return rows.map((row, i) => {
    const explanations: string[] = JSON.parse(row.explanation_bullets_json);
    const risks: string[] = JSON.parse(row.risk_bullets_json);
    const companyLower = row.company_name.toLowerCase();
    const isProspect = prospectNames.has(companyLower);

    return {
      rank: i + 1,
      score: row.score,
      company: row.company_name,
      role: row.title ?? "(General)",
      location: row.locations,
      whyItFits: explanations[0] ?? "Strong overall fit score",
      topRisk: risks[0] ?? null,
      applyLink: row.job_url,
      isProspect,
    };
  });
}

export function assembleFollowups(db: Database.Database): BriefingFollowup[] {
  const followups = listPendingFollowups(db);

  return followups.map((f) => {
    // Get last application event for context
    let lastAction = "Follow-up scheduled";
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
    }

    return {
      company: f.company_name,
      role: f.title,
      dueDate: formatDate(f.due_at),
      lastAction,
      notes: f.note,
    };
  });
}

export function assembleDrafts(db: Database.Database): BriefingDraft[] {
  const allDrafts = listDrafts(db);

  // Only include drafts whose application is in "drafted" state (unsent)
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

  // Applications created/updated this week (last 7 days)
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

export function assembleBriefingData(
  db: Database.Database,
  dateOverride?: string,
): BriefingData {
  const date = dateOverride ?? todayISO();
  const prospectCompanies = loadProspectCompanies();
  const prospectNames = new Set(prospectCompanies.map((c) => c.name.toLowerCase()));

  return {
    date,
    newRoles: assembleNewRoles(db, prospectNames, date),
    followups: assembleFollowups(db),
    drafts: assembleDrafts(db),
    funnel: isMonday(date) ? assembleWeeklyFunnel(db) : null,
  };
}

export function getBriefingSmsSummary(data: BriefingData): { newRoleCount: number; topScore: number } {
  return {
    newRoleCount: data.newRoles.length,
    topScore: data.newRoles[0]?.score ?? 0,
  };
}

// ─── CLI command ───────────────────────────────────────────────

export function registerBriefingCommand(): Command {
  return new Command("briefing")
    .description("Generate a Google Doc with today's job hunt briefing")
    .option("--no-scan", "Skip scanning sources before generating briefing")
    .option("--date <date>", "Override the briefing date (YYYY-MM-DD)")
    .action(async (opts: { scan?: boolean; date?: string }) => {
      // Run scan first unless --no-scan
      if (opts.scan !== false) {
        console.log("[briefing] Scanning all sources...");
        try {
          const { runScanCommand } = await import("./scan");
          const scanResult = await runScanCommand();
          console.log(
            `[briefing] Scan done. Upserted ${scanResult.upserted} roles.`,
          );
        } catch (err) {
          console.warn(
            `[briefing] Scan failed, continuing with existing data: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      const db = initDb();
      const data = assembleBriefingData(db, opts.date);

      console.log(`[briefing] Assembling briefing for ${data.date}`);
      console.log(`  New roles (60+): ${data.newRoles.length}`);
      console.log(`  Pending follow-ups: ${data.followups.length}`);
      console.log(`  Unsent drafts: ${data.drafts.length}`);
      if (data.funnel) {
        console.log(`  Weekly funnel: ${data.funnel.totalTracked} tracked, ${data.funnel.appliedThisWeek} applied this week`);
      }

      try {
        const docUrl = await createOrUpdateBriefingDoc(data);
        console.log(`\n[briefing] Doc ready: ${docUrl}`);

        if (isTwilioConfigured()) {
          try {
            const { newRoleCount, topScore } = getBriefingSmsSummary(data);
            await sendDailyBriefingSMS(docUrl, newRoleCount, topScore);
            console.log("[briefing] SMS sent.");
          } catch (err) {
            console.warn(`[briefing] SMS failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          console.log("[briefing] SMS skipped: Twilio not configured");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Missing Google credentials")) {
          console.error(`[briefing] ${msg}`);
          console.error("[briefing] Briefing data assembled but Google Doc was not created.");
          console.error("[briefing] Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and optionally GOOGLE_DRIVE_FOLDER_ID.");
        } else {
          throw err;
        }
      }
    });
}
