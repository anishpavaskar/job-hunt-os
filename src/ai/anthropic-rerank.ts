import { loadProfile } from "../config/profile";
import type { Profile } from "../config/types";
import type { ScoreBreakdown } from "../db/types";

export type AnthropicRerankPurpose = "review" | "browse" | "apply";

export interface AnthropicRerankCandidate {
  id: number;
  company: string;
  title: string | null;
  summary: string;
  locations: string;
  remoteFlag: boolean;
  postedAt?: string | null;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
  extractedSkills?: string[];
  explanationBullets?: string[];
  riskBullets?: string[];
  status?: string;
  roleSource?: string;
}

type AnthropicRerankResult = {
  id: number;
  ai_score: number;
  reason?: string;
  risk?: string | null;
  bucket?: string;
};

const DEFAULT_ANTHROPIC_RERANK_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_ANTHROPIC_RERANK_LIMIT = 25;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&mdash;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string, maxLength: number): string {
  const cleaned = stripHtml(value);
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRerankModel(): string {
  return process.env.ANTHROPIC_RERANK_MODEL?.trim() || DEFAULT_ANTHROPIC_RERANK_MODEL;
}

function getCandidateLimit(explicitLimit?: number): number {
  const fallback = parsePositiveInt(process.env.ANTHROPIC_RERANK_CANDIDATE_LIMIT, DEFAULT_ANTHROPIC_RERANK_LIMIT);
  return explicitLimit && explicitLimit > 0 ? explicitLimit : fallback;
}

export function isAnthropicRerankEnabled(): boolean {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  if (!parseBooleanEnv(process.env.ANTHROPIC_RERANK_ENABLED, true)) return false;
  if (process.env.NODE_ENV === "test" && !parseBooleanEnv(process.env.ANTHROPIC_RERANK_IN_TESTS, false)) {
    return false;
  }
  return true;
}

function extractResponseText(content: Array<{ type?: string; text?: string }> | undefined): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
}

function parseJsonBlock(text: string): unknown {
  const trimmed = text.trim();

  const fencedStarts = ["```json", "```JSON", "```"];
  for (const prefix of fencedStarts) {
    if (trimmed.startsWith(prefix)) {
      const withoutPrefix = trimmed.slice(prefix.length).trimStart();
      const withoutSuffix = withoutPrefix.endsWith("```")
        ? withoutPrefix.slice(0, -3).trimEnd()
        : withoutPrefix;
      return JSON.parse(withoutSuffix);
    }
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  return JSON.parse(trimmed);
}

function normalizeResults(payload: unknown): AnthropicRerankResult[] {
  if (!payload || typeof payload !== "object") return [];
  const results = Array.isArray((payload as { results?: unknown[] }).results)
    ? (payload as { results: unknown[] }).results
    : [];

  return results.flatMap((result): AnthropicRerankResult[] => {
    if (!result || typeof result !== "object") return [];
    const candidate = result as Record<string, unknown>;
    const id = Number(candidate.id);
    const aiScore = Number(candidate.ai_score);
    if (!Number.isFinite(id) || !Number.isFinite(aiScore)) return [];
    return [{
      id,
      ai_score: Math.max(0, Math.min(100, Math.round(aiScore))),
      reason: typeof candidate.reason === "string" ? candidate.reason : undefined,
      risk: typeof candidate.risk === "string" ? candidate.risk : null,
      bucket: typeof candidate.bucket === "string" ? candidate.bucket : undefined,
    }];
  });
}

function salvageResultsFromText(text: string): AnthropicRerankResult[] {
  const results: AnthropicRerankResult[] = [];
  const seenIds = new Set<number>();
  const patterns = [
    /(?:\"id\"|id)\s*:\s*(\d+)[\s\S]{0,160}?(?:\"ai_score\"|ai_score)\s*:\s*(-?\d+(?:\.\d+)?)/gi,
    /(?:\"ai_score\"|ai_score)\s*:\s*(-?\d+(?:\.\d+)?)[\s\S]{0,160}?(?:\"id\"|id)\s*:\s*(\d+)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const maybeId = Number(pattern === patterns[0] ? match[1] : match[2]);
      const maybeScore = Number(pattern === patterns[0] ? match[2] : match[1]);
      if (!Number.isFinite(maybeId) || !Number.isFinite(maybeScore) || seenIds.has(maybeId)) continue;
      seenIds.add(maybeId);
      results.push({
        id: maybeId,
        ai_score: Math.max(0, Math.min(100, Math.round(maybeScore))),
      });
    }
  }

  return results;
}

function buildProfileBlock(profile?: Profile): string {
  if (!profile) {
    return [
      "Target preference:",
      "- Strongly prefer individual-contributor backend, platform, infrastructure, devops, SRE, distributed systems, and ML infrastructure roles.",
      "- Penalize management, customer-facing, pre-sales, TAM, corporate development, implementation, analyst, and finance/program titles unless they are clearly hands-on engineering roles.",
    ].join("\n");
  }

  const targetRoles = profile.target_roles?.join(", ") || "not specified";
  const tier1 = profile.skills_tier1?.join(", ") || "none";
  const tier2 = profile.skills_tier2?.join(", ") || "none";
  const practices = profile.practices?.join(", ") || "none";
  const preferences = Object.entries(profile.preferences ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .join(", ") || "none";

  return [
    "Candidate profile:",
    `- Target roles: ${targetRoles}`,
    `- Tier 1 skills: ${tier1}`,
    `- Tier 2 skills: ${tier2}`,
    `- Practices: ${practices}`,
    `- Preferences: ${preferences}`,
  ].join("\n");
}

function buildPurposeGuidance(purpose: AnthropicRerankPurpose): string {
  switch (purpose) {
    case "apply":
      return "Optimize for the best jobs to actively apply to today. Prefer strong IC fit, clear technical depth, and actionability.";
    case "browse":
      return "Optimize for useful exploration, but still push obvious title mismatches down hard.";
    case "review":
    default:
      return "Optimize for the best shortlist candidates to review first.";
  }
}

function buildPrompt(
  candidates: AnthropicRerankCandidate[],
  purpose: AnthropicRerankPurpose,
  profile?: Profile,
): string {
  const serialized = candidates.map((candidate) => ({
    id: candidate.id,
    company: candidate.company,
    title: candidate.title ?? "",
    rule_score: candidate.score,
    posted_at: candidate.postedAt ?? null,
    location: candidate.locations,
    remote: candidate.remoteFlag,
    role_source: candidate.roleSource ?? null,
    status: candidate.status ?? null,
    extracted_skills: (candidate.extractedSkills ?? []).slice(0, 6),
    score_breakdown: candidate.scoreBreakdown ?? null,
    summary: compactText(candidate.summary, 320),
  }));

  return [
    "You are reranking software jobs for an experienced IC engineer.",
    buildPurposeGuidance(purpose),
    buildProfileBlock(profile),
    "Ranking rubric:",
    "- Heavily reward backend, platform, infrastructure, devops, SRE, distributed systems, ML infrastructure, data platform, and hands-on systems engineering roles.",
    "- Use title as a strong signal. A bad title should outweigh a vague technical summary.",
    "- Strongly penalize engagement manager, program manager, technical account manager, solutions architect / pre-sales, analyst, implementation, recruiter, finance, strategy, corporate development, customer success, and sales-oriented work.",
    "- Penalize people management roles unless they are unusually hands-on and still clearly aligned with the target profile.",
    "- Penalize jobs with unclear technical depth, stale postings, or obvious location mismatch.",
    "- Remote or Bay Area hybrid is a positive, but should not overpower role mismatch.",
    "Return JSON only. No markdown. No code fences. No commentary.",
    "Return exactly this shape:",
    '{"results":[{"id":123,"ai_score":87}]}',
    "Score every candidate from 0-100.",
    `Candidates:\n${JSON.stringify(serialized, null, 2)}`,
  ].join("\n\n");
}

async function requestAnthropicRerank(
  candidates: AnthropicRerankCandidate[],
  purpose: AnthropicRerankPurpose,
): Promise<Map<number, AnthropicRerankResult> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getRerankModel(),
        max_tokens: 1200,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: buildPrompt(candidates, purpose, loadProfile()),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[anthropic] rerank skipped: API error ${response.status}`);
      return null;
    }

    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = extractResponseText(payload.content);
    if (!text) {
      console.warn("[anthropic] rerank skipped: empty response");
      return null;
    }

    let parsed: AnthropicRerankResult[] = [];
    try {
      parsed = normalizeResults(parseJsonBlock(text));
    } catch {
      parsed = salvageResultsFromText(text);
    }

    if (parsed.length === 0) {
      console.warn("[anthropic] rerank skipped: no usable scores returned");
      return null;
    }

    return new Map(parsed.map((result) => [result.id, result]));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[anthropic] rerank skipped: ${message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function rerankItemsWithAnthropic<T>(
  items: T[],
  toCandidate: (item: T) => AnthropicRerankCandidate,
  opts: {
    purpose: AnthropicRerankPurpose;
    candidateLimit?: number;
  },
): Promise<T[]> {
  if (!isAnthropicRerankEnabled()) return items;
  if (items.length < 2) return items;

  const candidateLimit = Math.min(items.length, getCandidateLimit(opts.candidateLimit));
  const leadingItems = items.slice(0, candidateLimit);
  const trailingItems = items.slice(candidateLimit);
  const candidates = leadingItems.map(toCandidate);
  const rerankMap = await requestAnthropicRerank(candidates, opts.purpose);
  if (!rerankMap) return items;

  const rerankedLeading = [...leadingItems]
    .map((item, index) => {
      const candidate = toCandidate(item);
      return {
        item,
        index,
        aiScore: rerankMap.get(candidate.id)?.ai_score ?? Number.NEGATIVE_INFINITY,
      };
    })
    .sort((left, right) => {
      const leftMissing = Number.isFinite(left.aiScore) ? 0 : 1;
      const rightMissing = Number.isFinite(right.aiScore) ? 0 : 1;
      if (leftMissing !== rightMissing) return leftMissing - rightMissing;
      if (right.aiScore !== left.aiScore) return right.aiScore - left.aiScore;
      return left.index - right.index;
    })
    .map((entry) => entry.item);

  return [...rerankedLeading, ...trailingItems];
}
