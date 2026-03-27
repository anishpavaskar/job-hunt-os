import { Command } from "commander";
import { initDb } from "../db";
import { listJobs } from "../db/repositories";
import { JobRecord } from "../db/types";
import { buildReviewFilters } from "../filter/jobs";

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSummary(value: string): string {
  const cleaned = stripHtml(value);
  return cleaned.length > 140 ? `${cleaned.slice(0, 137)}...` : cleaned;
}

function recommendedNextAction(job: JobRecord, risk: string): string {
  switch (job.status) {
    case "new":
    case "saved":
      return "shortlist and draft outreach";
    case "shortlisted":
      return "draft outreach and prep application";
    case "drafted":
      return "submit application today";
    case "applied":
    case "followup_due":
      return "send a follow-up";
    case "replied":
      return "reply quickly and move to scheduling";
    case "interview":
      return "prep for interview loop";
    case "rejected":
      return "archive this role";
    case "archived":
      return "keep archived";
    default:
      return risk.includes("Compensation") ? "research details before applying" : "review and decide today";
  }
}

export function runReviewCommand(opts: {
  query?: string;
  minScore?: string;
  status?: string;
  remote?: boolean;
  today?: boolean;
  limit?: string;
}): Promise<string[]> {
  return (async () => {
    const db = await initDb();
    const filters = buildReviewFilters(opts);
    const jobs = await listJobs(db, filters);
    return jobs.map((job, index) => {
      const breakdown = job.score_breakdown_json;
      const positivesList = job.explanation_bullets_json.slice(0, 2);
      const risk = job.risk_bullets_json[0] ?? "No major risk surfaced";
      const title = job.title ? ` - ${job.title}` : "";
      const remote = job.remote_flag ? " | remote" : "";
      const seniority = job.seniority_hint ? ` | ${job.seniority_hint}` : "";
      const skills = job.extracted_skills_json.slice(0, 4).join(", ");
      const compensation =
        job.compensation_min != null || job.compensation_max != null
          ? ` | comp ${job.compensation_currency ?? ""} ${job.compensation_min ?? "?"}-${job.compensation_max ?? "?"}${job.compensation_period ? `/${job.compensation_period}` : ""}`.replace(/\s+/g, " ").trim()
          : "";
      const header = `#${index + 1} [${job.score}] ${job.company_name}${title} | ${compactSummary(job.summary)}${remote}${seniority}${compensation ? ` | ${compensation}` : ""}`;
      const scoreLine = `  fit: role ${breakdown.roleFit ?? 0}, stack ${breakdown.stackFit ?? 0}, seniority ${breakdown.seniorityFit ?? 0}, freshness ${breakdown.freshness ?? 0}, company ${breakdown.companySignal ?? 0}`;
      const positiveLine = `  top reasons: ${positivesList.join("; ") || "No clear positives recorded"}`;
      const riskLine = `  top risk: ${risk}`;
      const skillsLine = skills ? `  skills: ${skills}` : null;
      const actionLine = `  next action: ${recommendedNextAction(job, risk)}`;
      return [header, scoreLine, positiveLine, riskLine, skillsLine, actionLine].filter(Boolean).join("\n");
    });
  })();
}

export function registerReviewCommand(): Command {
  return new Command("review")
    .description("Review top jobs from SQLite")
    .option("--query <text>", "search by company, summary, tags, or industries")
    .option("--min-score <number>", "minimum score filter")
    .option("--status <status>", "job status filter")
    .option("--remote", "remote-only jobs")
    .option("--today", "show the best jobs to apply to today")
    .option("--limit <number>", "max jobs to show", "20")
    .action(async (opts) => {
      const lines = await runReviewCommand(opts);
      if (lines.length === 0) {
        console.log("No jobs matched your filters.");
        return;
      }
      for (const line of lines) console.log(line);
    });
}
