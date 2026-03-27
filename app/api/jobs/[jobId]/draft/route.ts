import type { NextRequest } from "next/server";
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
  const numericJobId = parseJobId(jobId);
  if (numericJobId == null) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as {
    action?: "generate" | "gmail";
    variant?: string;
    note?: string;
  } | null;

  const db = await initDb();
  const job = await getJobById(db, numericJobId);
  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  if (body?.action === "gmail") {
    const existingDraft = await getLatestDraftByJobId(db, numericJobId);
    if (!existingDraft) {
      return Response.json({ error: "No saved draft exists for this job." }, { status: 404 });
    }

    const gmailDraftId = await createGmailDraft(
      "",
      buildDraftSubject(job),
      existingDraft.edited_content ?? existingDraft.generated_content,
    );

    await upsertDraft(db, {
      jobId: numericJobId,
      applicationId: existingDraft.application_id,
      variant: existingDraft.variant,
      generatedContent: existingDraft.generated_content,
      editedContent: existingDraft.edited_content,
      gmailDraftId,
    });

    const refreshedDraft = await getLatestDraftByJobId(db, numericJobId);
    return Response.json({
      ok: true,
      jobId: numericJobId,
      draft: refreshedDraft ? toWebDraftDetail(refreshedDraft) : null,
      gmailDraftId,
    });
  }

  await saveDraftForJob(db, job, {
    variant: body?.variant ?? "default",
    markDrafted: true,
    notes: parseNote(body?.note),
  });

  const [application, draft] = await Promise.all([
    getApplicationByJobId(db, numericJobId),
    getLatestDraftByJobId(db, numericJobId),
  ]);

  return Response.json({
    ok: true,
    jobId: numericJobId,
    status: normalizeJobStatus(application?.status ?? "drafted"),
    application: application ? toWebApplicationDetail(application) : null,
    draft: draft ? toWebDraftDetail(draft) : null,
  });
}
