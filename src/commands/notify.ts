import { Command } from "commander";
import { initDb } from "../db";
import { assembleBriefingData } from "./briefing";
import { sendBriefingHtmlEmail } from "../integrations/gmail";

export async function runNotifyCommand(): Promise<string> {
  const db = await initDb();
  const { data, error } = await db
    .from("scans")
    .select("completed_at")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load latest scan: ${error.message}`);
  }
  const latestScan = data as { completed_at: string } | null;
  const date = latestScan?.completed_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const briefingData = await assembleBriefingData(db, date);

  try {
    const messageId = await sendBriefingHtmlEmail(briefingData);
    return `Gmail briefing sent for ${briefingData.date} (${messageId}).`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("MY_EMAIL") || message.includes("NOTIFY_EMAIL_TO")) {
      return "Gmail notification skipped: MY_EMAIL (or NOTIFY_EMAIL_TO) not configured";
    }
    return `Gmail briefing failed: ${message}`;
  }
}

export function registerNotifyCommand(): Command {
  return new Command("notify")
    .description("Send the latest HTML briefing email again without re-running the scan")
    .action(async () => {
      console.log(await runNotifyCommand());
    });
}
