import { Command } from "commander";
import { initDb } from "../db";
import { listPendingFollowups, updateFollowup } from "../db/repositories";

export async function runFollowupsCommand(): Promise<string[]> {
  const db = await initDb();
  const rows = await listPendingFollowups(db);
  return rows.map((row) => {
    const title = row.title ? ` - ${row.title}` : "";
    return `#${row.id} | ${row.due_at} | ${row.company_name}${title} | ${row.note ?? "follow-up"}`;
  });
}

export async function runFollowupAction(
  followupId: number,
  action: "done" | "skip" | "reschedule",
  days?: number,
  note?: string,
): Promise<string> {
  const db = await initDb();
  if (action === "done") {
    await updateFollowup(db, followupId, { status: "done", note });
    return `Marked follow-up ${followupId} done.`;
  }
  if (action === "skip") {
    await updateFollowup(db, followupId, { status: "skipped", note });
    return `Skipped follow-up ${followupId}.`;
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + (days ?? 3));
  await updateFollowup(db, followupId, { dueAt: dueAt.toISOString(), note });
  return `Rescheduled follow-up ${followupId} to ${dueAt.toISOString()}.`;
}

export function registerFollowupsCommand(): Command {
  return new Command("followups")
    .description("List pending follow-up reminders")
    .option("--done <id>", "mark a follow-up done")
    .option("--skip <id>", "skip a follow-up")
    .option("--reschedule <id>", "reschedule a follow-up")
    .option("--days <days>", "days to move a rescheduled follow-up", "3")
    .option("--note <text>", "optional note for the follow-up action")
    .action(async (opts: { done?: string; skip?: string; reschedule?: string; days?: string; note?: string }) => {
      if (opts.done) {
        console.log(await runFollowupAction(parseInt(opts.done, 10), "done", undefined, opts.note));
        return;
      }
      if (opts.skip) {
        console.log(await runFollowupAction(parseInt(opts.skip, 10), "skip", undefined, opts.note));
        return;
      }
      if (opts.reschedule) {
        const days = parseInt(opts.days ?? "3", 10);
        console.log(await runFollowupAction(parseInt(opts.reschedule, 10), "reschedule", days, opts.note));
        return;
      }

      const lines = await runFollowupsCommand();
      if (lines.length === 0) {
        console.log("No pending follow-ups.");
        return;
      }
      for (const line of lines) console.log(line);
    });
}
