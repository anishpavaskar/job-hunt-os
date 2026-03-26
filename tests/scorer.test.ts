import { scoreOpportunity } from "../src/score/scorer";
import type { Profile } from "../src/config/types";
import type { NormalizedOpportunity } from "../src/ingest/normalize";
import type { YcCompany } from "../src/ingest/yc";

describe("scorer seniority calibration", () => {
  const profile: Profile = {
    name: "Anish Pavaskar",
    target_roles: ["Software Engineer", "Backend Engineer", "Platform Engineer"],
    skills_tier1: ["Go", "Kubernetes", "AWS", "TypeScript"],
    skills_tier2: ["Terraform", "Postgres"],
    domains: ["Backend Engineering", "Cloud Infrastructure"],
    practices: ["CI/CD", "Observability"],
    years_of_experience: 3,
    location: "Milpitas, CA",
    preferences: {
      remote: true,
      healthcare: true,
      early_stage: true,
      hybrid: true,
      relocation: true,
    },
  };

  const company: YcCompany = {
    name: "Anthropic",
    slug: "anthropic",
    small_logo_thumb_url: "",
    website: "https://anthropic.com",
    all_locations: "San Francisco, CA",
    long_description: "AI infrastructure company",
    one_liner: "Build AI products with strong backend and infrastructure needs",
    team_size: 500,
    industry: "AI",
    subindustry: "Infrastructure",
    tags: ["AI", "Infrastructure"],
    top_company: true,
    isHiring: true,
    batch: "Winter 2025",
    status: "Active",
    industries: ["AI"],
    regions: ["United States of America"],
    stage: "Growth",
    url: "https://www.ycombinator.com/companies/anthropic",
  };

  test("mid-level profile is penalized harder for staff-plus roles than senior roles", () => {
    const staffRole: NormalizedOpportunity = {
      externalKey: "anthropic:staff",
      roleExternalId: "staff",
      roleSource: "greenhouse",
      title: "Staff Software Engineer, Backend Infrastructure",
      summary: "Build Go, Kubernetes, AWS, and distributed backend systems.",
      locations: "San Francisco, CA",
      remoteFlag: false,
      jobUrl: "https://example.com/staff",
      seniorityHint: "Staff",
      extractedSkills: ["Go", "Kubernetes", "AWS"],
    };

    const seniorRole: NormalizedOpportunity = {
      ...staffRole,
      externalKey: "anthropic:senior",
      roleExternalId: "senior",
      title: "Senior Software Engineer, Backend Infrastructure",
      seniorityHint: "Senior",
      jobUrl: "https://example.com/senior",
    };

    const staffScore = scoreOpportunity(company, staffRole, profile);
    const seniorScore = scoreOpportunity(company, seniorRole, profile);

    expect(staffScore.breakdown.seniorityFit).toBeLessThan(seniorScore.breakdown.seniorityFit);
    expect(staffScore.breakdown.seniorityFit).toBeLessThanOrEqual(1);
    expect(staffScore.riskBullets).toContain("Likely too senior for your current target level");
    expect(seniorScore.score).toBeGreaterThan(staffScore.score);
  });
});
