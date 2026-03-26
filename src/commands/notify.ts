import { Command } from "commander";
import { initDb } from "../db";
import { assembleBriefingData } from "./briefing";
import { getLatestBriefingDoc } from "../integrations/google-docs";
import { createBriefingNotificationDraft } from "../integrations/gmail";

export async function runNotifyCommand(): Promise<string> {
  const latestDoc = getLatestBriefingDoc();
  if (!latestDoc) {
    return "No previous briefing doc found. Run `npm run briefing` first.";
  }

  const db = initDb();
  const briefingData = assembleBriefingData(db, latestDoc.date);

  try {
    const draftId = await createBriefingNotificationDraft(briefingData, latestDoc.url);
    return `Gmail draft created for briefing ${latestDoc.date} (${draftId}).`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("NOTIFY_EMAIL_TO")) {
      return "Gmail notification skipped: NOTIFY_EMAIL_TO not configured";
    }
    return `Gmail draft failed: ${message}`;
  }
}

export function registerNotifyCommand(): Command {
  return new Command("notify")
    .description("Create a Gmail draft for the most recent briefing without re-running the scan")
    .action(async () => {
      console.log(await runNotifyCommand());
    });
}
