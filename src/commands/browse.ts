import { Command } from "commander";
import { initDb } from "../db";
import { listBrowseJobs } from "../db/repositories";
import { BrowseJobRecord } from "../db/types";
import { buildBrowseFilters } from "../filter/jobs";

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : "unknown";
}

function compactLocation(value: string): string {
  return value
    .replace(/,?\s*\[object Object\]/g, "")
    .replace(/\s*[;|]\s*/g, " • ")
    .replace(/,([A-Z]{2,3})(\b)/g, ", $1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFlags(job: BrowseJobRecord): string[] {
  const flags: string[] = [];
  const breakdown = job.score_breakdown_json as { prospect_listed?: boolean };
  if (breakdown.prospect_listed) flags.push("Prospect");
  if (job.remote_flag) flags.push("Remote");
  if (job.role_source === "company_fallback") flags.push("YC company");
  return flags;
}

function buildHeader(index: number, job: BrowseJobRecord): string {
  const title = job.title ?? "(General)";
  return `#${index + 1} [${job.score}] ${job.company_name} — ${title}`;
}

function buildMeta(job: BrowseJobRecord): string {
  const parts = [
    `source: ${job.provider}`,
    `type: ${job.role_source === "company_fallback" ? "company" : "role"}`,
    `status: ${job.status}`,
    `posted: ${formatDate(job.posted_at)}`,
    `tracked: ${formatDate(job.created_at)}`,
  ];
  return `  ${parts.join(" | ")}`;
}

function buildContext(job: BrowseJobRecord): string | null {
  const segments: string[] = [];
  if (job.locations) segments.push(compactLocation(job.locations));
  const skills = job.extracted_skills_json.slice(0, 4);
  if (skills.length > 0) segments.push(`skills: ${skills.join(", ")}`);
  const flags = buildFlags(job);
  if (flags.length > 0) segments.push(`flags: ${flags.join(", ")}`);
  return segments.length > 0 ? `  ${segments.join(" | ")}` : null;
}

function buildSummary(job: BrowseJobRecord): string | null {
  const bullet = job.explanation_bullets_json[0];
  if (!bullet) return null;
  return `  why: ${bullet}`;
}

export function runBrowseCommand(opts: {
  query?: string;
  minScore?: string;
  status?: string;
  remote?: boolean;
  source?: string;
  prospect?: boolean;
  realRoles?: boolean;
  postedWithinDays?: string;
  trackedWithinDays?: string;
  sort?: string;
  limit?: string;
}): Promise<string[]> {
  return (async () => {
  const db = await initDb();
  const filters = buildBrowseFilters(opts);
  const jobs = await listBrowseJobs(db, filters);

  const lines: string[] = [];
  lines.push(`Showing ${jobs.length} jobs`);

  for (const [index, job] of jobs.entries()) {
    lines.push(buildHeader(index, job));
    lines.push(buildMeta(job));
    const context = buildContext(job);
    if (context) lines.push(context);
    const summary = buildSummary(job);
    if (summary) lines.push(summary);
    lines.push(`  url: ${job.job_url}`);
  }

  return lines;
  })();
}

export function registerBrowseCommand(): Command {
  return new Command("browse")
    .description("Browse tracked jobs with source, date, and fit filters")
    .option("--query <text>", "search by company, title, summary, tags, or industries")
    .option("--min-score <number>", "minimum score filter")
    .option("--status <status>", "job status filter")
    .option("--source <source>", "yc, greenhouse, lever, careers, manual, or all", "all")
    .option("--remote", "remote-only jobs")
    .option("--prospect", "only companies on the Prospect list")
    .option("--real-roles", "exclude company fallback rows")
    .option("--posted-within-days <number>", "only jobs with posted_at within the last N days")
    .option("--tracked-within-days <number>", "only jobs first tracked within the last N days")
    .option("--sort <sort>", "score, posted, tracked, or company", "score")
    .option("--limit <number>", "max jobs to show", "30")
    .action(async (opts) => {
      const lines = await runBrowseCommand(opts);
      if (lines.length <= 1) {
        console.log("No jobs matched your filters.");
        return;
      }
      for (const line of lines) console.log(line);
    });
}
