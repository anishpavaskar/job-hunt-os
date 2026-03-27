import type { NextRequest } from "next/server";
import { startApiRequest } from "@/lib/server/api-debug";
import { initDb } from "@/src/db";
import { updateFollowup } from "@/src/db/repositories";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ followupId: string }> },
) {
  const { followupId } = await context.params;
  const logger = startApiRequest("/api/followups/[followupId]", { followupId });
  const numericFollowupId = Number.parseInt(followupId, 10);
  if (!Number.isFinite(numericFollowupId)) {
    logger.finish({ status: 400, invalidFollowupId: followupId });
    return Response.json({ error: "Invalid follow-up id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as {
    action?: "done" | "snooze";
    days?: number;
  } | null;

  if (body?.action !== "done" && body?.action !== "snooze") {
    logger.finish({ status: 400, reason: "unsupported_action" });
    return Response.json({ error: "Unsupported follow-up action." }, { status: 400 });
  }

  const db = await initDb();
  if (body.action === "done") {
    await logger.query("updateFollowup_done", () => updateFollowup(db, numericFollowupId, { status: "done" }));
    logger.finish({ status: 200, followupId: numericFollowupId, action: "done" });
    return Response.json({ ok: true, followupId: numericFollowupId, status: "done" });
  }

  const days = Number.isFinite(body.days) && body.days != null ? Math.max(1, Math.floor(body.days)) : 3;
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + days);
  await logger.query("updateFollowup_snooze", () => updateFollowup(db, numericFollowupId, { dueAt: dueAt.toISOString() }));

  logger.finish({ status: 200, followupId: numericFollowupId, action: "snooze" });
  return Response.json({
    ok: true,
    followupId: numericFollowupId,
    status: "pending",
    dueAt: dueAt.toISOString(),
  });
}
