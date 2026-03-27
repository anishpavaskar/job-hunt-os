import type { NextRequest } from "next/server";
import { initDb } from "@/src/db";
import { updateFollowup } from "@/src/db/repositories";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ followupId: string }> },
) {
  const { followupId } = await context.params;
  const numericFollowupId = Number.parseInt(followupId, 10);
  if (!Number.isFinite(numericFollowupId)) {
    return Response.json({ error: "Invalid follow-up id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as {
    action?: "done" | "snooze";
    days?: number;
  } | null;

  if (body?.action !== "done" && body?.action !== "snooze") {
    return Response.json({ error: "Unsupported follow-up action." }, { status: 400 });
  }

  const db = await initDb();
  if (body.action === "done") {
    await updateFollowup(db, numericFollowupId, { status: "done" });
    return Response.json({ ok: true, followupId: numericFollowupId, status: "done" });
  }

  const days = Number.isFinite(body.days) && body.days != null ? Math.max(1, Math.floor(body.days)) : 3;
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + days);
  await updateFollowup(db, numericFollowupId, { dueAt: dueAt.toISOString() });

  return Response.json({
    ok: true,
    followupId: numericFollowupId,
    status: "pending",
    dueAt: dueAt.toISOString(),
  });
}
