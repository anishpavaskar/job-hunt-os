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
