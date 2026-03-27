import { Command } from "commander";
import { initDb } from "../db";
import { createFollowup, getJobByQuery, upsertApplication } from "../db/repositories";
import { ApplicationStatus, InterviewStage, ResponseType } from "../db/types";

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export async function runApplyCommand(
  query: string,
  followupDays: number,
  opts: {
    notes?: string;
    status?: ApplicationStatus;
    appliedUrl?: string;
    resumeVersion?: string;
    outreachDraftVersion?: string;
    responseReceived?: boolean;
    responseType?: ResponseType;
    interviewStage?: InterviewStage;
    rejectionReason?: string;
    lastContactedAt?: string | null;
  } = {},
): Promise<{ companyName: string; dueAt: string | null }> {
  const db = await initDb();
  const job = await getJobByQuery(db, query);
  if (!job) {
    throw new Error(`No job matching "${query}" found in Supabase. Run scan first.`);
  }

  const appliedAt = new Date().toISOString();
  const status = opts.status ?? "applied";
  const applicationId = await upsertApplication(db, job.id, {
    status,
    appliedAt: status === "applied" ? appliedAt : null,
    note: opts.notes,
    appliedUrl: opts.appliedUrl,
    resumeVersion: opts.resumeVersion,
    outreachDraftVersion: opts.outreachDraftVersion,
    responseReceived: opts.responseReceived,
    responseType: opts.responseType,
    interviewStage: opts.interviewStage,
    rejectionReason: opts.rejectionReason,
    lastContactedAt: opts.lastContactedAt ?? (status === "applied" ? appliedAt : null),
  });
  let dueAt: string | null = null;
  if (status === "applied" || status === "followup_due") {
    dueAt = addDaysIso(followupDays);
    await createFollowup(db, job.id, applicationId, dueAt, `Follow up with ${job.company_name}`);
  }

  return { companyName: job.title ? `${job.company_name} - ${job.title}` : job.company_name, dueAt };
}

export function registerApplyCommand(): Command {
  return new Command("apply")
    .description("Mark a job as applied and schedule a follow-up")
    .argument("<company>", "company name to search")
    .option("--followup-days <days>", "days until follow-up", "7")
    .option("--status <status>", "saved, shortlisted, drafted, applied, followup_due, replied, interview, rejected, archived")
    .option("--notes <text>", "notes to store with the application")
    .option("--applied-url <url>", "URL used to submit the application")
    .option("--resume-version <version>", "resume version label")
    .option("--outreach-draft-version <version>", "outreach draft version label")
    .option("--response-received", "mark that a response has been received")
    .option("--response-type <type>", "email, linkedin, phone, referral, other")
    .option("--interview-stage <stage>", "recruiter_screen, hiring_manager, technical, onsite, final, offer")
    .option("--rejection-reason <reason>", "optional rejection reason")
    .option("--last-contacted-at <iso>", "override the last contacted timestamp")
    .action(async (query: string, opts: {
      followupDays?: string;
      notes?: string;
      status?: ApplicationStatus;
      appliedUrl?: string;
      resumeVersion?: string;
      outreachDraftVersion?: string;
      responseReceived?: boolean;
      responseType?: ResponseType;
      interviewStage?: InterviewStage;
      rejectionReason?: string;
      lastContactedAt?: string;
    }) => {
      const days = parseInt(opts.followupDays ?? "7", 10);
      const result = await runApplyCommand(query, Number.isFinite(days) ? days : 7, {
        notes: opts.notes,
        status: opts.status,
        appliedUrl: opts.appliedUrl,
        resumeVersion: opts.resumeVersion,
        outreachDraftVersion: opts.outreachDraftVersion,
        responseReceived: opts.responseReceived,
        responseType: opts.responseType,
        interviewStage: opts.interviewStage,
        rejectionReason: opts.rejectionReason,
        lastContactedAt: opts.lastContactedAt ?? null,
      });
      console.log(
        result.dueAt
          ? `Updated ${result.companyName}. Follow-up due ${result.dueAt}`
          : `Updated ${result.companyName}.`,
      );
    });
}
