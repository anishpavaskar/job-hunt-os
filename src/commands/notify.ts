import { Command } from "commander";
import { initDb } from "../db";
import { assembleBriefingData, getBriefingSmsSummary } from "./briefing";
import { getLatestBriefingDoc } from "../integrations/google-docs";
import { isTwilioConfigured, sendDailyBriefingSMS } from "../integrations/twilio";

export async function runNotifyCommand(): Promise<string> {
  if (!isTwilioConfigured()) {
    return "SMS skipped: Twilio not configured";
  }

  const latestDoc = getLatestBriefingDoc();
  if (!latestDoc) {
    return "No previous briefing doc found. Run `npm run briefing` first.";
  }

  const db = initDb();
  const briefingData = assembleBriefingData(db, latestDoc.date);
  const { newRoleCount, topScore } = getBriefingSmsSummary(briefingData);

  try {
    await sendDailyBriefingSMS(latestDoc.url, newRoleCount, topScore);
    return `SMS sent for briefing ${latestDoc.date}.`;
  } catch (err) {
    return `SMS failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function registerNotifyCommand(): Command {
  return new Command("notify")
    .description("Send an SMS for the most recent briefing without re-running the scan")
    .action(async () => {
      console.log(await runNotifyCommand());
    });
}
