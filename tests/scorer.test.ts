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

describe("scorer freshness calibration", () => {
  const companyBase: YcCompany = {
    name: "ExampleCo",
    slug: "exampleco",
    small_logo_thumb_url: "",
    website: "https://example.com",
    all_locations: "San Francisco, CA",
    long_description: "Build developer infrastructure for startups.",
    one_liner: "Developer infrastructure company",
    team_size: 40,
    industry: "Infrastructure",
    subindustry: "Developer Tools",
    tags: ["Infrastructure"],
    top_company: false,
    isHiring: true,
    batch: "Winter 2024",
    status: "Active",
    industries: ["Developer Tools"],
    regions: ["United States of America"],
    stage: "Early",
    url: "https://www.ycombinator.com/companies/exampleco",
  };

  const makeOpportunity = (overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity => ({
    externalKey: "example:role",
    roleExternalId: "role-1",
    roleSource: "greenhouse",
    title: "Software Engineer",
    summary: "Build backend services.",
    locations: "San Francisco, CA",
    remoteFlag: true,
    jobUrl: "https://example.com/jobs/1",
    postedAt: null,
    seniorityHint: "Software Engineer",
    extractedSkills: ["Go"],
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-26T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("a job posted 2 days ago gets freshness 10 with isHiring", () => {
    const score = scoreOpportunity(
      companyBase,
      makeOpportunity({ postedAt: "2026-03-24T12:00:00.000Z" }),
    );

    expect(score.breakdown.freshness).toBe(10);
    expect(score.explanationBullets).toContain("Posted 2 days ago - still fresh");
  });

  test("a job posted 10 days ago gets freshness 6 with isHiring", () => {
    const score = scoreOpportunity(
      companyBase,
      makeOpportunity({ postedAt: "2026-03-16T12:00:00.000Z" }),
    );

    expect(score.breakdown.freshness).toBe(6);
    expect(score.explanationBullets).toContain("Posted 10 days ago - still fresh");
  });

  test("a job posted 60 days ago gets freshness 3 with isHiring", () => {
    const score = scoreOpportunity(
      companyBase,
      makeOpportunity({ postedAt: "2026-01-25T12:00:00.000Z" }),
    );

    expect(score.breakdown.freshness).toBe(3);
    expect(score.riskBullets).toContain("Posted 60 days ago - may no longer be active");
  });

  test("a job with no postedAt and no recent batch only gets the hiring freshness", () => {
    const score = scoreOpportunity(companyBase, makeOpportunity());

    expect(score.breakdown.freshness).toBe(3);
  });

  test("yc batch freshness still works without a postedAt timestamp", () => {
    const score = scoreOpportunity(
      { ...companyBase, batch: "Winter 2025" },
      makeOpportunity(),
    );

    expect(score.breakdown.freshness).toBe(10);
    expect(score.explanationBullets).toContain("Fresh enough to prioritize from Winter 2025");
  });

  test("postedAt freshness and batch freshness do not stack beyond the freshness cap", () => {
    const score = scoreOpportunity(
      { ...companyBase, batch: "Winter 2025" },
      makeOpportunity({ postedAt: "2026-03-24T12:00:00.000Z" }),
    );

    expect(score.breakdown.freshness).toBe(10);
  });
});

describe("scorer role calibration", () => {
  const profile: Profile = {
    name: "Anish Pavaskar",
    target_roles: ["Software Engineer", "Backend Engineer", "Platform Engineer", "Infrastructure Engineer", "DevOps Engineer"],
    skills_tier1: ["Python", "TypeScript", "Go", "Kubernetes", "AWS"],
    skills_tier2: ["Terraform", "PostgreSQL", "Docker"],
    domains: ["Backend Engineering", "Cloud Infrastructure", "DevOps"],
    practices: ["CI/CD", "Distributed Systems", "Observability"],
    years_of_experience: 3,
    location: "Milpitas, CA",
    preferences: {
      remote: true,
      healthcare: false,
      early_stage: true,
      hybrid: true,
      relocation: true,
    },
  };

  const company: YcCompany = {
    name: "Scale AI",
    slug: "scale-ai",
    small_logo_thumb_url: "",
    website: "https://scale.com",
    all_locations: "San Francisco, CA",
    long_description: "AI infrastructure company",
    one_liner: "AI infrastructure platform",
    team_size: 900,
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
    url: "https://www.ycombinator.com/companies/scale-ai",
  };

  test("penalizes customer-facing and business-adjacent titles versus IC infrastructure roles", () => {
    const infraRole: NormalizedOpportunity = {
      externalKey: "scale:infra",
      roleExternalId: "infra",
      roleSource: "greenhouse",
      title: "Infrastructure Software Engineer, Enterprise GenAI",
      summary: "Build Python, Go, Kubernetes, AWS, CI/CD, and distributed systems infrastructure.",
      locations: "San Francisco, CA",
      remoteFlag: false,
      jobUrl: "https://example.com/infra",
      seniorityHint: "Software Engineer",
      extractedSkills: ["Python", "Go", "Kubernetes", "AWS"],
      postedAt: "2026-03-18T12:00:00.000Z",
    };

    const engagementRole: NormalizedOpportunity = {
      ...infraRole,
      externalKey: "scale:engagement",
      roleExternalId: "engagement",
      title: "Engagement Manager",
      summary: "Partner with customers on AI deployments and implementation planning.",
      jobUrl: "https://example.com/engagement",
      extractedSkills: ["AI", "Analytics"],
    };

    const solutionsRole: NormalizedOpportunity = {
      ...infraRole,
      externalKey: "scale:solutions",
      roleExternalId: "solutions",
      title: "Solutions Architect (Pre-sales)",
      summary: "Support pre-sales motion for enterprise data and AI customers.",
      jobUrl: "https://example.com/solutions",
      extractedSkills: ["Data Engineering", "Machine Learning"],
    };

    const infraScore = scoreOpportunity(company, infraRole, profile);
    const engagementScore = scoreOpportunity(company, engagementRole, profile);
    const solutionsScore = scoreOpportunity(company, solutionsRole, profile);
    const engineeringManagerScore = scoreOpportunity(company, {
      ...infraRole,
      externalKey: "scale:engineering-manager",
      roleExternalId: "engineering-manager",
      title: "Engineering Manager - Machine Learning Infrastructure",
      summary: "Lead a team building ML infrastructure and deployment systems.",
      jobUrl: "https://example.com/manager",
      extractedSkills: ["Infrastructure", "Machine Learning", "CI/CD"],
    }, profile);

    expect(infraScore.score).toBeGreaterThan(engagementScore.score);
    expect(infraScore.score).toBeGreaterThan(solutionsScore.score);
    expect(infraScore.score).toBeGreaterThan(engineeringManagerScore.score);
    expect(engagementScore.breakdown.roleFit).toBeLessThan(infraScore.breakdown.roleFit);
    expect(solutionsScore.breakdown.roleFit).toBeLessThan(infraScore.breakdown.roleFit);
    expect(engagementScore.breakdown.stackFit).toBeLessThanOrEqual(8);
    expect(solutionsScore.breakdown.stackFit).toBeLessThanOrEqual(8);
    expect(engagementScore.reasons).toContain("title_penalty:-20");
    expect(solutionsScore.reasons).toContain("title_penalty:-20");
    expect(engagementScore.riskBullets).toContain("Role appears less aligned with an IC backend/platform target");
    expect(solutionsScore.riskBullets).toContain("Role appears less aligned with an IC backend/platform target");
  });
});
