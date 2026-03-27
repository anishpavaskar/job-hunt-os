import { JobUpsertInput } from "../db/types";
import { YcCompany, YcRole } from "./yc";
import { RESUME_KEYWORDS, TIER1_TAGS, TIER2_TAGS } from "../../config/scoring";

export interface NormalizedOpportunity {
  externalKey: string;
  roleExternalId?: string | null;
  roleSource: string;
  title?: string | null;
  summary: string;
  locations: string;
  remoteFlag: boolean;
  jobUrl: string;
  postedAt?: string | null;
  seniorityHint?: string | null;
  compensationMin?: number | null;
  compensationMax?: number | null;
  compensationCurrency?: string | null;
  compensationPeriod?: string | null;
  extractedSkills: string[];
}

export function normalizeCompanyFallback(
  company: YcCompany,
): NormalizedOpportunity {
  return {
    externalKey: `company:${company.slug}`,
    roleExternalId: null,
    roleSource: "company_fallback",
    title: null,
    summary: company.one_liner || company.long_description || "",
    locations: company.all_locations,
    remoteFlag: company.regions.some((region) => /remote/i.test(region)),
    jobUrl: company.url,
    postedAt: null,
    extractedSkills: extractSkills(
      company.one_liner,
      company.long_description,
      company.tags.join(" "),
      company.industries.join(" "),
    ),
  };
}

function normalizeLocation(value: YcRole["locations"] | string | undefined, fallback: string): string {
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function firstDefinedNumber(...values: Array<number | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number") return value;
  }
  return null;
}

function firstDefinedString(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function normalizeDateValue(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value >= 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{10,13}$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const ms = trimmed.length === 13 ? numeric : numeric * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const isoDayMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDayMatch) {
    const [, year, month, day] = isoDayMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, rawYear] = slashMatch;
    const year = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear);
    return new Date(Date.UTC(year, Number(month) - 1, Number(day))).toISOString();
  }

  const monthDayYearMatch = trimmed.match(/^([A-Z][a-z]{2,8})\s+(\d{1,2}),\s+(\d{4})$/);
  if (monthDayYearMatch) {
    const [, monthName, day, year] = monthDayYearMatch;
    const monthIndex = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ].indexOf(monthName.toLowerCase());
    if (monthIndex >= 0) {
      return new Date(Date.UTC(Number(year), monthIndex, Number(day))).toISOString();
    }
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractPostedAtFromText(...parts: Array<string | null | undefined>): string | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text) return null;

  const patterns = [
    /(?:date posted|posted(?: on)?|published(?: on)?|job posted)\s*[:\-]?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i,
    /(?:date posted|posted(?: on)?|published(?: on)?|job posted)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i,
    /(?:date posted|posted(?: on)?|published(?: on)?|job posted)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = normalizeDateValue(match[1]);
    if (parsed) return parsed;
  }

  return null;
}

export function extractPostedAt(
  record: Record<string, unknown> | null | undefined,
  ...textParts: Array<string | null | undefined>
): string | null {
  const candidateKeys = [
    "posted_at",
    "postedAt",
    "published_at",
    "publishedAt",
    "first_published_at",
    "firstPublishedAt",
    "date_posted",
    "datePosted",
    "created_at",
    "createdAt",
  ];

  for (const key of candidateKeys) {
    const parsed = normalizeDateValue(record?.[key]);
    if (parsed) return parsed;
  }

  return extractPostedAtFromText(...textParts);
}

function extractSkills(...parts: Array<string | null | undefined>): string[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  const candidates = [...TIER1_TAGS, ...TIER2_TAGS, ...RESUME_KEYWORDS];
  return [...new Set(candidates.filter((candidate) => text.includes(candidate.toLowerCase())))].slice(0, 12);
}

export function normalizeRoleOpportunity(
  company: YcCompany,
  role: YcRole,
  index: number,
): NormalizedOpportunity {
  const rawRole = role as unknown as Record<string, unknown>;
  const roleId = role.id != null ? String(role.id) : null;
  const title = firstDefinedString(role.title) ?? `Role ${index + 1}`;
  const jobUrl = firstDefinedString(role.apply_url, role.job_url, role.url, company.url) ?? company.url;
  const remoteFlag = Boolean(role.remote ?? role.remote_ok ?? role.remote_allowed)
    || /remote/i.test(normalizeLocation(role.locations, role.location ?? company.all_locations));

  return {
    externalKey: `role:${company.slug}:${roleId ?? `${title}:${jobUrl}`}`,
    roleExternalId: roleId,
    roleSource: "role",
    title,
    summary: firstDefinedString(role.description, company.one_liner, company.long_description) ?? "",
    locations: normalizeLocation(role.locations, role.location ?? company.all_locations),
    remoteFlag,
    jobUrl,
    postedAt: extractPostedAt(rawRole, role.description, company.one_liner, company.long_description),
    seniorityHint: firstDefinedString(role.seniority_hint, role.seniority, role.level, role.experience),
    compensationMin: firstDefinedNumber(role.compensation_min, role.salary_min, role.min_salary),
    compensationMax: firstDefinedNumber(role.compensation_max, role.salary_max, role.max_salary),
    compensationCurrency: firstDefinedString(role.compensation_currency),
    compensationPeriod: firstDefinedString(role.compensation_period),
    extractedSkills: extractSkills(
      title,
      role.description,
      company.one_liner,
      company.long_description,
      company.tags.join(" "),
      company.industries.join(" "),
    ),
  };
}

export function toJobUpsertInput(
  company: YcCompany,
  opportunity: NormalizedOpportunity,
  sourceId: number,
  scanId: number,
  scoring: {
    score: number;
    reasons: string[];
    breakdown: JobUpsertInput["scoreBreakdown"];
    explanationBullets: string[];
    riskBullets: string[];
  },
): JobUpsertInput {
  return {
    sourceId,
    scanId,
    externalKey: opportunity.externalKey,
    roleExternalId: opportunity.roleExternalId ?? null,
    roleSource: opportunity.roleSource,
    companyName: company.name,
    title: opportunity.title ?? null,
    summary: opportunity.summary,
    website: company.website,
    locations: opportunity.locations,
    remoteFlag: opportunity.remoteFlag,
    jobUrl: opportunity.jobUrl,
    postedAt: opportunity.postedAt ?? null,
    regions: company.regions,
    tags: company.tags,
    industries: company.industries,
    stage: company.stage,
    batch: company.batch,
    teamSize: company.team_size,
    seniorityHint: opportunity.seniorityHint ?? null,
    compensationMin: opportunity.compensationMin ?? null,
    compensationMax: opportunity.compensationMax ?? null,
    compensationCurrency: opportunity.compensationCurrency ?? null,
    compensationPeriod: opportunity.compensationPeriod ?? null,
    extractedSkills: opportunity.extractedSkills,
    topCompany: company.top_company,
    isHiring: company.isHiring,
    score: scoring.score,
    scoreReasons: scoring.reasons,
    scoreBreakdown: scoring.breakdown,
    explanationBullets: scoring.explanationBullets,
    riskBullets: scoring.riskBullets,
    status: "new",
  };
}
