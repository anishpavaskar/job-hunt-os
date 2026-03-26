import { Command } from "commander";
import dotenv from "dotenv";
import { registerAutoDraftCommand } from "./commands/auto-draft";
import { registerApplyCommand } from "./commands/apply";
import { registerDraftCommand } from "./commands/draft";
import { registerDraftsCommand } from "./commands/drafts";
import { registerFollowupsCommand } from "./commands/followups";
import { registerImportCommand } from "./commands/import";
import { registerNotifyCommand } from "./commands/notify";
import { registerProfileCommand } from "./commands/profile";
import { registerProspectRefreshCommand } from "./commands/prospect-refresh";
import { registerReviewCommand } from "./commands/review";
import { registerScanCommand } from "./commands/scan";
import { registerStatsCommand } from "./commands/stats";
import { registerTodayCommand } from "./commands/today";
import { registerBriefingCommand } from "./commands/briefing";
import { registerScanCareersCommand } from "./commands/scan-careers";

dotenv.config();

const program = new Command();

program
  .name("job-hunt-os")
  .description("CLI-first MVP for scanning, reviewing, and tracking job applications");

program.addCommand(registerScanCommand());
program.addCommand(registerImportCommand());
program.addCommand(registerNotifyCommand());
program.addCommand(registerProspectRefreshCommand());
program.addCommand(registerReviewCommand());
program.addCommand(registerTodayCommand());
program.addCommand(registerStatsCommand());
program.addCommand(registerAutoDraftCommand());
program.addCommand(registerDraftCommand());
program.addCommand(registerDraftsCommand());
program.addCommand(registerApplyCommand());
program.addCommand(registerFollowupsCommand());
program.addCommand(registerProfileCommand());
program.addCommand(registerBriefingCommand());
program.addCommand(registerScanCareersCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(`[job-hunt-os] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
