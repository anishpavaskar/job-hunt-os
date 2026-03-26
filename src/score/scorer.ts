import {
  BAY_AREA_CITIES,
  HEALTH_KEYWORDS,
  RECENT_BATCHES,
  RESUME_KEYWORDS,
  ROLE_KEYWORDS,
  SCORING_WEIGHTS,
  SENIORITY_KEYWORDS,
  TIER1_TAGS,
  TIER2_TAGS,
} from "../../config/scoring";
import { Profile } from "../config/types";
import { JobUpsertInput, ScoreBreakdown } from "../db/types";
import { NormalizedOpportunity } from "../ingest/normalize";
import { isProspectCompany } from "../ingest/prospect";
import { YcCompany } from "../ingest/yc";

function containsCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function arrayHasCI(arr: readonly string[], target: string): boolean {
  const lower = target.toLowerCase();
  return arr.some((item) => item.toLowerCase() === lower);
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

function normalizeText(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function collapseWhitespace(...parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchCount(text: string, values: readonly string[]): number {
  return values.filter((value) => containsCI(text, value)).length;
}

function collectMatches(text: string, values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => containsCI(text, value)))];
}

function buildOpportunityText(company: YcCompany, opportunity: NormalizedOpportunity): string {
  return collapseWhitespace(
    opportunity.title,
    opportunity.summary,
    company.one_liner,
    company.long_description,
    company.tags.join(" "),
    company.industries.join(" "),
  );
}

function scoreLocation(company: YcCompany): number {
  const locationParts = company.all_locations.split(",").map((p) => p.trim());
  const isBayArea = locationParts.some((part) =>
    BAY_AREA_CITIES.some((city) => containsCI(part, city)),
  );
  if (isBayArea) return 8;

  const isUS = company.regions.some(
    (r) => r.toLowerCase() === "united states of america" || r.toLowerCase() === "america",
  );
  return isUS ? 4 : 0;
}

function scoreProfileLocation(company: YcCompany, profile?: Profile): number {
  if (!profile?.location) return 0;
  const candidateLocation = profile.location.toLowerCase();
  const companyLocation = `${company.all_locations} ${company.regions.join(" ")}`.toLowerCase();

  if (companyLocation.includes(candidateLocation)) return 4;
  if (profile.preferences?.relocation) return 3;
  if (profile.preferences?.hybrid && scoreLocation(company) > 0) return 2;
  return 0;
}

function scoreFreshness(company: YcCompany): number {
  let score = 0;
  if (RECENT_BATCHES.includes(company.batch)) score += 7;
  if (company.isHiring) score += 3;
  return clamp(score, SCORING_WEIGHTS.freshness);
}

function scoreCompanySignal(company: YcCompany, opportunity: NormalizedOpportunity): number {
  let score = 0;
  if (company.top_company) score += 8;
  if (company.stage === "Growth") score += 5;
  else if (company.stage === "Early" && (company.team_size ?? 0) <= 50) score += 3;
  if (opportunity.remoteFlag) score += 4;
  if ((opportunity.compensationMin ?? opportunity.compensationMax) != null) score += 3;
  score += scoreLocation(company);
  const healthcareMatch = [...company.tags, ...company.industries].some((item) =>
    HEALTH_KEYWORDS.some((kw) => item.toLowerCase() === kw.toLowerCase()),
  );
  if (healthcareMatch) score += 2;
  return clamp(score, SCORING_WEIGHTS.companySignal);
}

function scoreStackFit(company: YcCompany, opportunity: NormalizedOpportunity, profile?: Profile): number {
  const text = buildOpportunityText(company, opportunity).toLowerCase();
  const tier1 = profile?.skills_tier1 ?? TIER1_TAGS;
  const tier2 = profile?.skills_tier2 ?? TIER2_TAGS;
  const domains = profile?.domains ?? [];
  const practices = profile?.practices ?? [];

  const tier1Score = matchCount(text, tier1) * 4;
  const tier2Score = matchCount(text, tier2) * 2;
  const domainScore = matchCount(text, domains) * 3;
  const practiceScore = matchCount(text, practices) * 3;
  const resumeScore = matchCount(text, RESUME_KEYWORDS) * 2;

  return clamp(tier1Score + tier2Score + domainScore + practiceScore + resumeScore, SCORING_WEIGHTS.stackFit);
}

function scoreRoleFit(opportunity: NormalizedOpportunity, profile?: Profile): number {
  const text = normalizeText(opportunity.title, opportunity.summary);
  let score = 0;
  const profileCorpus = normalizeText(
    ...(profile?.skills_tier1 ?? []),
    ...(profile?.skills_tier2 ?? []),
    ...(profile?.domains ?? []),
  );

  for (const keywords of Object.values(ROLE_KEYWORDS)) {
    const hits = matchCount(text, keywords);
    if (hits > 0 && keywords.some((keyword) => containsCI(profileCorpus, keyword))) {
      score += hits * 4;
    }
  }

  if (profile?.target_roles?.length) {
    const targetRoleHits = profile.target_roles.filter((role) => containsCI(text, role)).length;
    score += targetRoleHits * 8;
  }

  if (profile?.preferences?.healthcare && containsCI(text, "health")) score += 3;
  if (profile?.preferences?.remote && opportunity.remoteFlag) score += 2;
  return clamp(score, SCORING_WEIGHTS.roleFit);
}

function inferProfileSeniority(profile?: Profile): "junior" | "mid" | "senior" {
  const years = profile?.years_of_experience;
  if (typeof years !== "number") {
    return "mid";
  }
  if (years >= 5) return "senior";
  if (years >= 2) return "mid";
  return "junior";
}

function scoreSeniorityFit(opportunity: NormalizedOpportunity, profile?: Profile): number {
  if (!opportunity.seniorityHint) return Math.floor(SCORING_WEIGHTS.seniorityFit / 2);
  const seniorityText = opportunity.seniorityHint.toLowerCase();
  const target = inferProfileSeniority(profile);

  const isStaffPlusRole = ["staff", "principal", "director", "manager"].some((keyword) =>
    seniorityText.includes(keyword),
  );
  const isSeniorRole = seniorityText.includes("senior") || seniorityText.includes("lead");

  if (SENIORITY_KEYWORDS[target].some((keyword) => seniorityText.includes(keyword))) {
    return SCORING_WEIGHTS.seniorityFit;
  }
  if (target === "mid" && SENIORITY_KEYWORDS.junior.some((keyword) => seniorityText.includes(keyword))) {
    return 6;
  }
  if (target === "mid" && SENIORITY_KEYWORDS.senior.some((keyword) => seniorityText.includes(keyword))) {
    if (isStaffPlusRole) return 1;
    if (isSeniorRole) return 4;
    return 3;
  }
  return 4;
}

function buildExplanationBullets(
  breakdown: ScoreBreakdown,
  opportunity: NormalizedOpportunity,
  company: YcCompany,
  profile?: Profile,
): string[] {
  const bullets: string[] = [];
  if (breakdown.roleFit >= 12 && opportunity.title) bullets.push(`Strong role fit for ${opportunity.title}`);
  if (breakdown.stackFit >= 18) bullets.push("Stack aligns well with your core skills");
  if (breakdown.companySignal >= 12 && company.top_company) bullets.push("Strong company signal from YC and hiring posture");
  if (breakdown.prospect_listed) bullets.push("Prospect-curated top startup");
  if (breakdown.freshness >= 7) bullets.push(`Fresh enough to prioritize from ${company.batch}`);
  if (opportunity.remoteFlag) bullets.push("Remote-friendly role");
  if (profile?.target_roles?.some((role) => containsCI(opportunity.title ?? "", role))) {
    bullets.push("Matches one of your target role families");
  }
  return bullets.slice(0, 3);
}

function buildRiskBullets(
  breakdown: ScoreBreakdown,
  opportunity: NormalizedOpportunity,
  company: YcCompany,
): string[] {
  const risks: string[] = [];
  const seniorityText = opportunity.seniorityHint?.toLowerCase() ?? "";
  if (["staff", "principal", "director"].some((keyword) => seniorityText.includes(keyword)) && breakdown.seniorityFit <= 4) {
    risks.push("Likely too senior for your current target level");
  }
  if (breakdown.seniorityFit <= 6) risks.push("Seniority fit is uncertain");
  if (!opportunity.remoteFlag) risks.push("Not clearly remote");
  if ((opportunity.compensationMin ?? opportunity.compensationMax) == null) risks.push("Compensation not disclosed");
  if (!RECENT_BATCHES.includes(company.batch)) risks.push(`Older batch (${company.batch}) may be lower-priority`);
  return risks.slice(0, 2);
}

function buildBreakdown(
  company: YcCompany,
  opportunity: NormalizedOpportunity,
  profile?: Profile,
): ScoreBreakdown {
  const prospectListed = isProspectCompany(company.name);
  return {
    roleFit: scoreRoleFit(opportunity, profile),
    stackFit: scoreStackFit(company, opportunity, profile),
    seniorityFit: scoreSeniorityFit(opportunity, profile),
    freshness: scoreFreshness(company),
    companySignal: clamp(
      scoreCompanySignal(company, opportunity)
        + scoreProfileLocation(company, profile)
        + (prospectListed ? SCORING_WEIGHTS.prospectBoost : 0),
      SCORING_WEIGHTS.companySignal,
    ),
    prospect_listed: prospectListed,
  };
}

function collectPreferenceSignals(company: YcCompany, opportunity: NormalizedOpportunity, profile?: Profile): string[] {
  if (!profile?.preferences) return [];

  const signals: string[] = [];
  const companyLocation = `${company.all_locations} ${company.regions.join(" ")}`.toLowerCase();
  const text = normalizeText(
    opportunity.title,
    opportunity.summary,
    company.one_liner,
    company.long_description,
    company.tags.join(" "),
    company.industries.join(" "),
  );

  if (profile.preferences.remote && opportunity.remoteFlag) {
    signals.push("remote");
  }
  if (profile.preferences.healthcare && text.includes("health")) {
    signals.push("healthcare");
  }
  if (profile.preferences.hybrid && scoreLocation(company) > 0) {
    signals.push("hybrid");
  }
  if (profile.location && companyLocation.includes(profile.location.toLowerCase())) {
    signals.push(`location:${profile.location}`);
  } else if (profile.preferences.relocation && scoreProfileLocation(company, profile) > 0) {
    signals.push("relocation");
  }

  return signals;
}

export interface OpportunityScore {
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
  explanationBullets: string[];
  riskBullets: string[];
}

export interface OpportunityScoreDebug {
  extractedText: string;
  extractedSkills: string[];
  matchedProfileSignals: Record<string, string[]>;
  breakdown: ScoreBreakdown;
  score: number;
}

export function getOpportunityScoreDebug(
  company: YcCompany,
  opportunity: NormalizedOpportunity,
  profile?: Profile,
): OpportunityScoreDebug {
  const extractedText = buildOpportunityText(company, opportunity);
  const roleText = collapseWhitespace(opportunity.title, opportunity.summary);
  const matchedProfileSignals: Record<string, string[]> = {};

  const tier1Skills = collectMatches(extractedText, profile?.skills_tier1 ?? []);
  const tier2Skills = collectMatches(extractedText, profile?.skills_tier2 ?? []);
  const domains = collectMatches(extractedText, profile?.domains ?? []);
  const practices = collectMatches(extractedText, profile?.practices ?? []);
  const targetRoles = collectMatches(roleText, profile?.target_roles ?? []);
  const preferences = collectPreferenceSignals(company, opportunity, profile);

  if (tier1Skills.length > 0) matchedProfileSignals.tier1Skills = tier1Skills;
  if (tier2Skills.length > 0) matchedProfileSignals.tier2Skills = tier2Skills;
  if (domains.length > 0) matchedProfileSignals.domains = domains;
  if (practices.length > 0) matchedProfileSignals.practices = practices;
  if (targetRoles.length > 0) matchedProfileSignals.targetRoles = targetRoles;
  if (preferences.length > 0) matchedProfileSignals.preferences = preferences;

  const breakdown = buildBreakdown(company, opportunity, profile);
  return {
    extractedText,
    extractedSkills: opportunity.extractedSkills,
    matchedProfileSignals,
    breakdown,
    score: clamp(
      breakdown.roleFit
      + breakdown.stackFit
      + breakdown.seniorityFit
      + breakdown.freshness
      + breakdown.companySignal,
      100,
    ),
  };
}

export function scoreOpportunity(
  company: YcCompany,
  opportunity: NormalizedOpportunity,
  profile?: Profile,
): OpportunityScore {
  const breakdown = buildBreakdown(company, opportunity, profile);
  const prospectListed = Boolean(breakdown.prospect_listed);

  const reasons = [
    `role_fit:${breakdown.roleFit}`,
    `stack_fit:${breakdown.stackFit}`,
    `seniority_fit:${breakdown.seniorityFit}`,
    `freshness:${breakdown.freshness}`,
    `company_signal:${breakdown.companySignal}`,
    ...(prospectListed ? ["Prospect-curated top startup"] : []),
  ];

  const score =
    breakdown.roleFit +
    breakdown.stackFit +
    breakdown.seniorityFit +
    breakdown.freshness +
    breakdown.companySignal;
  return {
    score: clamp(score, 100),
    reasons,
    breakdown,
    explanationBullets: buildExplanationBullets(breakdown, opportunity, company, profile),
    riskBullets: buildRiskBullets(breakdown, opportunity, company),
  };
}

export function sortCompanies<T extends { score: number; name: string }>(companies: T[]): T[] {
  return [...companies].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}
