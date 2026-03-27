import { Command } from "commander";
import { initDb } from "../db";
import { listAutoDraftJobs } from "../db/repositories";
import { saveDraftForJob } from "./draft";

export async function runAutoDraftCommand(
  opts: {
    minScore?: number;
    sendToGmail?: boolean;
    variant?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{ generated: number; gmailCreated: number; skipped: number }> {
  const db = await initDb();
  const minScore = opts.minScore ?? 80;
  const jobs = await listAutoDraftJobs(db, minScore);

  let generated = 0;
  let gmailCreated = 0;

  for (const job of jobs) {
    try {
      const result = await saveDraftForJob(db, job, {
        variant: opts.variant ?? "auto",
        sendToGmail: opts.sendToGmail ?? false,
        markDrafted: true,
        notes: `Auto-drafted from batch queue at threshold ${minScore}`,
        fetchImpl: opts.fetchImpl,
      });
      generated += 1;
      if (result.gmailDraftId) {
        gmailCreated += 1;
      }
    } catch (err) {
      if (opts.sendToGmail) {
        try {
          await saveDraftForJob(db, job, {
            variant: opts.variant ?? "auto",
            sendToGmail: false,
            markDrafted: true,
            notes: `Auto-drafted locally after Gmail failure at threshold ${minScore}`,
            fetchImpl: opts.fetchImpl,
          });
          generated += 1;
        } catch (fallbackErr) {
          console.warn(
            `[auto-draft] Skipped ${job.company_name}${job.title ? ` — ${job.title}` : ""}: ${
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
            }`,
          );
          continue;
        }

        console.warn(
          `[auto-draft] Gmail draft failed for ${job.company_name}${job.title ? ` — ${job.title}` : ""}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }

      console.warn(
        `[auto-draft] Skipped ${job.company_name}${job.title ? ` — ${job.title}` : ""}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return {
    generated,
    gmailCreated,
    skipped: Math.max(0, jobs.length - generated),
  };
}

export function registerAutoDraftCommand(): Command {
  return new Command("auto-draft")
    .description("Generate saved drafts for high-scoring new roles")
    .option("--min-score <score>", "minimum score threshold", "80")
    .option("--send-to-gmail", "also create Gmail drafts for each generated draft")
    .option("--variant <name>", "draft variant label", "auto")
    .action(async (opts: { minScore?: string; sendToGmail?: boolean; variant?: string }) => {
      const minScore = parseInt(opts.minScore ?? "80", 10);
      const result = await runAutoDraftCommand({
        minScore: Number.isFinite(minScore) ? minScore : 80,
        sendToGmail: opts.sendToGmail ?? false,
        variant: opts.variant ?? "auto",
      });
      console.log(`Generated ${result.generated} drafts. ${result.gmailCreated} Gmail drafts created.`);
      if (result.skipped > 0) {
        console.log(`Skipped ${result.skipped} roles.`);
      }
    });
}
