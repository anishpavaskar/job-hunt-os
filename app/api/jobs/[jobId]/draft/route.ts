import type { NextRequest } from "next/server";
import { startApiRequest } from "@/lib/server/api-debug";
import { buildDraftSubject, saveDraftForJob } from "@/src/commands/draft";
import { initDb } from "@/src/db";
import {
  getApplicationByJobId,
  getJobById,
  getLatestDraftByJobId,
  upsertDraft,
} from "@/src/db/repositories";
import { createGmailDraft } from "@/src/integrations/gmail";
import { normalizeJobStatus, toWebApplicationDetail, toWebDraftDetail } from "@/lib/server/web-data";

export const dynamic = "force-dynamic";

function parseJobId(jobId: string): number | null {
  const numericJobId = Number.parseInt(jobId, 10);
  return Number.isFinite(numericJobId) ? numericJobId : null;
}

function parseNote(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const logger = startApiRequest("/api/jobs/[jobId]/draft", { jobId });
  const numericJobId = parseJobId(jobId);
  if (numericJobId == null) {
    logger.finish({ status: 400, invalidJobId: jobId });
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as {
    action?: "generate" | "gmail";
    variant?: string;
    note?: string;
  } | null;

  const db = await initDb();
  const job = await logger.query("getJobById", () => getJobById(db, numericJobId));
  if (!job) {
    logger.finish({ status: 404, numericJobId });
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  if (body?.action === "gmail") {
    const existingDraft = await logger.query("getLatestDraftByJobId", () => getLatestDraftByJobId(db, numericJobId));
    if (!existingDraft) {
      logger.finish({ status: 404, numericJobId, reason: "missing_saved_draft" });
      return Response.json({ error: "No saved draft exists for this job." }, { status: 404 });
    }

    const gmailDraftId = await logger.query("createGmailDraft", () => createGmailDraft(
      "",
      buildDraftSubject(job),
      existingDraft.edited_content ?? existingDraft.generated_content,
    ));

    await logger.query("upsertDraft", () => upsertDraft(db, {
      jobId: numericJobId,
      applicationId: existingDraft.application_id,
      variant: existingDraft.variant,
      generatedContent: existingDraft.generated_content,
      editedContent: existingDraft.edited_content,
      gmailDraftId,
    }));

    const refreshedDraft = await logger.query("getLatestDraftByJobId_after_upsert", () => getLatestDraftByJobId(db, numericJobId));
    logger.finish({ status: 200, numericJobId, action: "gmail" });
    return Response.json({
      ok: true,
      jobId: numericJobId,
      draft: refreshedDraft ? toWebDraftDetail(refreshedDraft) : null,
      gmailDraftId,
    });
  }

  await logger.query("saveDraftForJob", () => saveDraftForJob(db, job, {
    variant: body?.variant ?? "default",
    markDrafted: true,
    notes: parseNote(body?.note),
  }));

  const [application, draft] = await Promise.all([
    logger.query("getApplicationByJobId", () => getApplicationByJobId(db, numericJobId)),
    logger.query("getLatestDraftByJobId", () => getLatestDraftByJobId(db, numericJobId)),
  ]);

  logger.finish({ status: 200, numericJobId, action: "generate" });
  return Response.json({
    ok: true,
    jobId: numericJobId,
    status: normalizeJobStatus(application?.status ?? "drafted"),
    application: application ? toWebApplicationDetail(application) : null,
    draft: draft ? toWebDraftDetail(draft) : null,
  });
}
