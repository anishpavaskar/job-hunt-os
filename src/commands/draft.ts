import { Command } from "commander";
import { execSync } from "child_process";
import fs from "fs";
import Database from "better-sqlite3";
import { HEALTH_KEYWORDS } from "../../config/scoring";
import { loadProfile } from "../config/profile";
import type { Profile } from "../config/types";
import { initDb } from "../db";
import { getApplicationByJobId, getJobByQuery, upsertApplication, upsertDraft } from "../db/repositories";
import { JobRecord } from "../db/types";
import { createGmailDraft } from "../integrations/gmail";

const INFRA_TAGS = ["DevOps", "Infrastructure", "Kubernetes", "Cloud Computing", "Developer Tools"];
const AI_TAGS = ["AI", "Machine Learning", "Generative AI", "NLP", "Deep Learning", "Artificial Intelligence"];

const HOOKS = {
  infra:
    "At Dell EMC, I designed a zero-downtime Kubernetes upgrade platform using Go microservices and Helm that cut rollout time by 35%. I also owned a Python Platform SDK that standardized deployments for global teams.",
  ai:
    "I've built production AI systems including a FastAPI RAG agent with AWS API Gateway and K8s CronJobs, plus integrated anomaly-detection into observability pipelines for predictive scaling at Dell EMC.",
  healthcare:
    "At Dell EMC, I built distributed microservices and observability systems with the same reliability rigor healthcare demands -- zero-downtime upgrades, predictive monitoring, and CI/CD that reduced QA effort by 40%.",
  default:
    "At Dell EMC, I built Go microservices for a zero-downtime K8s upgrade platform, owned a Python SDK framework for global teams, and modernized CI/CD pipelines that doubled deployment cadence.",
} as const;

function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

function pickHookType(tags: string[]): keyof typeof HOOKS {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (INFRA_TAGS.some((tag) => lower.includes(tag.toLowerCase()))) return "infra";
  if (AI_TAGS.some((tag) => lower.includes(tag.toLowerCase()))) return "ai";
  if (HEALTH_KEYWORDS.some((tag) => lower.includes(tag.toLowerCase()))) return "healthcare";
  return "default";
}

export function generateDraft(job: JobRecord): string {
  const tags = parseJsonArray(job.tags_json);
  const hook = HOOKS[pickHookType(tags)];
  const teamLine =
    job.team_size != null && job.team_size <= 50
      ? "I thrive in smaller teams where I own things end-to-end."
      : "I've shipped across global distributed teams and can contribute at any scale.";

  const roleLine = job.title ? `I'm especially interested in the ${job.title} role.` : "";

  return `Hi ${job.company_name} team,

Software Engineer, 3 years building distributed systems and cloud-native platforms. "${job.summary}" -- this is exactly the kind of problem I want to work on.

${roleLine}

${hook}

${teamLine} Would love to chat.

Anish Pavaskar
anpavaskar@gmail.com | 408-218-0722`;
}

function buildAnthropicSystemPrompt(profile?: Profile): string {
  const profileBlock = profile ? JSON.stringify(profile, null, 2) : "No saved candidate profile found.";
  return `You write concise, direct outreach emails for job applications.

Use the candidate profile below as the source of truth. Reference specific overlaps between the candidate and the company or role. Avoid generic praise, filler, or exaggerated claims. Keep the email under 200 words and make it feel human and targeted.

Candidate profile:
${profileBlock}`;
}

function buildAnthropicUserPrompt(job: JobRecord): string {
  const extractedSkills = parseJsonArray(job.extracted_skills_json);
  const reasons = parseJsonArray(job.explanation_bullets_json);
  const risks = parseJsonArray(job.risk_bullets_json);

  return `Write a concise outreach email for this opportunity.

Company: ${job.company_name}
Role title: ${job.title ?? "General software role"}
Summary: ${job.summary}
Location: ${job.locations}
Remote: ${job.remote_flag === 1 ? "yes" : "no / unclear"}
Job URL: ${job.job_url}
Extracted skills: ${extractedSkills.join(", ") || "None"}
Score reasons: ${reasons.join("; ") || "None"}
Risks: ${risks.join("; ") || "None"}

Output only the email body. Make it specific to the job and company context.`;
}

async function generateAnthropicDraft(
  job: JobRecord,
  profile?: Profile,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: buildAnthropicSystemPrompt(profile),
      messages: [{ role: "user", content: buildAnthropicUserPrompt(job) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.filter((item) => item.type === "text").map((item) => item.text).join("").trim();
  if (!text) {
    throw new Error("Anthropic API returned empty response");
  }
  return text;
}

export async function generatePersonalizedDraft(
  job: JobRecord,
  opts: {
    profile?: Profile;
    cwd?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string> {
  const profile = opts.profile ?? loadProfile(opts.cwd);
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateAnthropicDraft(job, profile, opts.fetchImpl);
    } catch {
      return generateDraft(job);
    }
  }
  return generateDraft(job);
}

export function buildDraftSubject(job: JobRecord): string {
  return `Re: ${job.title ?? "Software Engineer"} — ${job.company_name}`;
}

export async function saveDraftForJob(
  db: Database.Database,
  job: JobRecord,
  opts: {
    variant?: string;
    editedContent?: string | null;
    sendToGmail?: boolean;
    markDrafted?: boolean;
    notes?: string;
    fetchImpl?: typeof fetch;
    generatedContent?: string;
  } = {},
): Promise<{ draftId: number; draftContent: string; gmailDraftId: string | null; applicationId: number | null }> {
  const draftContent = opts.generatedContent ?? await generatePersonalizedDraft(job, { fetchImpl: opts.fetchImpl });
  const editedContent = opts.editedContent ?? null;

  let application = getApplicationByJobId(db, job.id);
  let applicationId = application?.id ?? null;
  if (opts.markDrafted) {
    applicationId = upsertApplication(db, job.id, {
      status: "drafted",
      note: opts.notes,
      outreachDraftVersion: opts.variant ?? "default",
    });
    application = getApplicationByJobId(db, job.id);
    applicationId = application?.id ?? applicationId;
  }

  let gmailDraftId: string | null = null;
  if (opts.sendToGmail) {
    gmailDraftId = await createGmailDraft("", buildDraftSubject(job), editedContent ?? draftContent);
  }

  const draftId = upsertDraft(db, {
    jobId: job.id,
    applicationId,
    variant: opts.variant ?? "default",
    generatedContent: draftContent,
    editedContent,
    gmailDraftId,
  });

  return {
    draftId,
    draftContent,
    gmailDraftId,
    applicationId,
  };
}

export async function runDraftCommand(
  query: string,
  opts: {
    copy?: boolean;
    openUrl?: boolean;
    save?: boolean;
    variant?: string;
    editedFile?: string;
    sendToGmail?: boolean;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string> {
  const db = initDb();
  const job = getJobByQuery(db, query);
  if (!job) {
    throw new Error(`No job matching "${query}" found in SQLite. Run scan first.`);
  }

  const editedContent = opts.editedFile ? fs.readFileSync(opts.editedFile, "utf-8") : null;
  const shouldPersist = opts.save || opts.sendToGmail;

  let draft = await generatePersonalizedDraft(job, { fetchImpl: opts.fetchImpl });
  if (shouldPersist) {
    const result = await saveDraftForJob(db, job, {
      variant: opts.variant ?? "default",
      editedContent,
      sendToGmail: opts.sendToGmail ?? false,
      fetchImpl: opts.fetchImpl,
      generatedContent: draft,
    });
    draft = editedContent ?? result.draftContent;
    if (result.gmailDraftId) {
      console.log(`Gmail draft created for ${job.company_name} — ${job.title ?? "General role"}`);
    }
  } else if (editedContent) {
    draft = editedContent;
  }

  if (opts.copy) {
    try {
      execSync("pbcopy", { input: draft });
    } catch {
      // Best effort only; keep command functional across environments.
    }
  }
  if (opts.openUrl) {
    try {
      execSync(`open "${job.source_url}"`, { stdio: "ignore" });
    } catch {
      // Best effort only; opening the browser is not required for draft generation.
    }
  }
  return draft;
}

export function registerDraftCommand(): Command {
  return new Command("draft")
    .description("Generate outreach draft for a company from SQLite")
    .argument("<company>", "company name to search")
    .option("--copy", "copy the draft to clipboard")
    .option("--open", "open the company YC page in the browser")
    .option("--save", "save the draft to SQLite")
    .option("--variant <name>", "draft variant label", "default")
    .option("--edited-file <path>", "optional file containing edited content to save alongside the generated draft")
    .option("--send-to-gmail", "create a Gmail draft and save the Gmail draft ID in SQLite")
    .action(async (query: string, opts: { copy?: boolean; open?: boolean; save?: boolean; variant?: string; editedFile?: string; sendToGmail?: boolean }) => {
      const draft = await runDraftCommand(query, {
        copy: opts.copy ?? false,
        openUrl: opts.open ?? false,
        save: opts.save ?? false,
        variant: opts.variant,
        editedFile: opts.editedFile,
        sendToGmail: opts.sendToGmail ?? false,
      });
      console.log(draft);
    });
}
