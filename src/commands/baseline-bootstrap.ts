import { Command } from "commander";
import { initDb } from "../db";
import {
  createBaselineSnapshot,
  deleteBaselineSnapshot,
  getBaselineSnapshotByLabel,
  snapshotJobsIntoBaseline,
} from "../db/repositories";

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function runBaselineBootstrapCommand(opts: {
  days?: string;
  label?: string;
  minScore?: string;
  includeFallback?: boolean;
  replace?: boolean;
}): Promise<string> {
  return (async () => {
  const db = await initDb();
  const days = Math.max(1, Number.parseInt(opts.days ?? "30", 10) || 30);
  const minScore = Math.max(0, Number.parseInt(opts.minScore ?? "0", 10) || 0);
  const effectiveDate = toIsoDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const label = opts.label?.trim() || `baseline_${days}d`;

  const existing = await getBaselineSnapshotByLabel(db, label);
  if (existing && !opts.replace) {
    throw new Error(`Baseline "${label}" already exists. Re-run with --replace to rebuild it.`);
  }
  if (existing && opts.replace) {
    await deleteBaselineSnapshot(db, existing.id);
  }

  const baselineId = await createBaselineSnapshot(db, label, effectiveDate);
  const count = await snapshotJobsIntoBaseline(db, baselineId, {
    includeFallback: opts.includeFallback,
    minScore,
  });

  return [
    `Baseline snapshot created.`,
    `label: ${label}`,
    `effective date: ${effectiveDate}`,
    `jobs captured: ${count}`,
    `filters: minScore=${minScore}, includeFallback=${opts.includeFallback ? "yes" : "no"}`,
  ].join("\n");
  })();
}

export function registerBaselineBootstrapCommand(): Command {
  return new Command("baseline-bootstrap")
    .description("Create a one-time baseline cohort from the current tracked inventory")
    .option("--days <number>", "how far back the baseline should be treated as effective", "30")
    .option("--label <text>", "snapshot label", "")
    .option("--min-score <number>", "minimum score to include", "0")
    .option("--include-fallback", "include company fallback rows as well as real roles")
    .option("--replace", "replace an existing snapshot with the same label")
    .action(async (opts) => {
      console.log(await runBaselineBootstrapCommand(opts));
    });
}
