import type { NextRequest } from "next/server";
import { initDb } from "@/src/db";
import {
  createFollowup,
  getApplicationByJobId,
  getPendingFollowupByJobId,
  upsertApplication,
} from "@/src/db/repositories";
import type { ApplicationStatus, InterviewStage } from "@/src/db/types";
import {
  getJobDetailData,
  normalizeJobStatus,
  toWebApplicationDetail,
  toWebFollowupDetail,
} from "@/lib/server/web-data";

export const dynamic = "force-dynamic";

const MUTABLE_STATUSES = new Set<string>([
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
]);

function parseJobId(jobId: string): number | null {
  const numericJobId = Number.parseInt(jobId, 10);
  return Number.isFinite(numericJobId) ? numericJobId : null;
}

function parseNote(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const numericJobId = parseJobId(jobId);
  if (numericJobId == null) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  const detail = await getJobDetailData(numericJobId);
  if (!detail) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  return Response.json(detail);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const numericJobId = parseJobId(jobId);
  if (numericJobId == null) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as {
    status?: string;
    note?: string;
    interviewStage?: string;
  } | null;

  const requestedStatus = body?.status;
  if (requestedStatus && !MUTABLE_STATUSES.has(requestedStatus as ApplicationStatus)) {
    return Response.json({ error: "Unsupported job status update." }, { status: 400 });
  }

  const interviewStage = typeof body?.interviewStage === "string"
    ? body.interviewStage as InterviewStage
    : undefined;
  const note = parseNote(body?.note);

  const db = await initDb();
  const existingApplication = await getApplicationByJobId(db, numericJobId);
  if (!requestedStatus && note === undefined) {
    return Response.json({ error: "No job changes were provided." }, { status: 400 });
  }
  if (!requestedStatus && !existingApplication) {
    return Response.json({ error: "Save a status first before storing notes." }, { status: 400 });
  }

  if (requestedStatus === "reviewed") {
    if (existingApplication) {
      return Response.json({ error: "Reviewed is only available before an application record exists." }, { status: 400 });
    }

    const { error } = await db
      .from("jobs")
      .update({ status: "reviewed", updated_at: new Date().toISOString() })
      .eq("id", numericJobId);
    if (error) {
      return Response.json({ error: `Failed to update job: ${error.message}` }, { status: 500 });
    }

    return Response.json({
      ok: true,
      jobId: numericJobId,
      status: "reviewed",
      interviewStage: null,
      note: null,
      application: null,
      followup: null,
    });
  }

  const status = (requestedStatus ?? existingApplication?.status) as ApplicationStatus;
  const appliedAt = status === "applied" || status === "followup_due"
    ? existingApplication?.applied_at ?? new Date().toISOString()
    : undefined;

  await upsertApplication(db, numericJobId, {
    status,
    note,
    appliedAt,
    interviewStage,
    responseReceived: status === "replied" || status === "interview" ? true : undefined,
    lastContactedAt: status === "applied" || status === "replied" || status === "interview"
      ? new Date().toISOString()
      : undefined,
  });

  if (status === "applied" || status === "followup_due") {
    const pendingFollowup = await getPendingFollowupByJobId(db, numericJobId);
    if (!pendingFollowup) {
      const followupDueAt = new Date();
      followupDueAt.setDate(followupDueAt.getDate() + 7);
      const application = await getApplicationByJobId(db, numericJobId);
      await createFollowup(
        db,
        numericJobId,
        application?.id ?? null,
        followupDueAt.toISOString(),
        "Follow up on application",
      );
    }
  }

  const [application, followup] = await Promise.all([
    getApplicationByJobId(db, numericJobId),
    getPendingFollowupByJobId(db, numericJobId),
  ]);

  return Response.json({
    ok: true,
    jobId: numericJobId,
    status: normalizeJobStatus(status),
    interviewStage: application?.interview_stage ?? interviewStage ?? null,
    note: application?.notes ?? (note === "" ? null : note ?? null),
    application: application ? toWebApplicationDetail(application) : null,
    followup: followup ? toWebFollowupDetail(followup) : null,
  });
}
