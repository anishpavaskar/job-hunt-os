import fs from "fs";
import os from "os";
import path from "path";
import { scoreOpportunity } from "../src/score/scorer";
import {
  getProspectMatch,
  isProspectCompany,
  parseProspectCompaniesFromHtml,
} from "../src/ingest/prospect";
import { NormalizedOpportunity } from "../src/ingest/normalize";
import { YcCompany } from "../src/ingest/yc";

describe("Prospect enrichment", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-prospect-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, "data", "prospect-companies.json"),
      JSON.stringify(
        [
          {
            name: "Abnormal Security",
            industry: "Cybersecurity",
            prospect_url: "https://www.joinprospect.com/explore",
          },
          {
            name: "Andalusia Labs",
            industry: "Fintech",
            prospect_url: "https://www.joinprospect.com/explore",
          },
        ],
        null,
        2,
      ),
    );
  });

  afterEach(() => {
    process.chdir(previousCwd);
  });

  test("matches Prospect companies with fuzzy normalization", () => {
    expect(isProspectCompany("Abnormal")).toBe(true);
    expect(isProspectCompany("Abnormal Security, Inc.")).toBe(true);
    expect(getProspectMatch("Andalusia Labs Co.")).toMatchObject({
      name: "Andalusia Labs",
    });
    expect(isProspectCompany("Totally Unknown Startup")).toBe(false);
  });

  test("parses Prospect explore HTML into company records", () => {
    const html = `
      <a href="/companies/abnormal-security">
        Abnormal Security Abnormal Security's AI-native platform protects inboxes. Industry Cybersecurity Learn more
      </a>
      <a href="/companies/anthropic">
        Anthropic Anthropic's AI models power enterprise workflows. Industry AI Learn more
      </a>
    `;

    const parsed = parseProspectCompaniesFromHtml(html);
    expect(parsed).toEqual([
      {
        name: "Abnormal Security",
        industry: "Cybersecurity",
        prospect_url: "https://www.joinprospect.com/companies/abnormal-security",
      },
      {
        name: "Anthropic",
        industry: "AI",
        prospect_url: "https://www.joinprospect.com/companies/anthropic",
      },
    ]);
  });

  test("adds a Prospect boost to company signal and score reasons", () => {
    const baseCompany: YcCompany = {
      name: "Abnormal",
      slug: "abnormal",
      small_logo_thumb_url: "",
      website: "https://abnormal.ai",
      all_locations: "",
      long_description: "Email security platform",
      one_liner: "AI-native security company",
      team_size: 200,
      industry: "Security",
      subindustry: "Cybersecurity",
      tags: ["Security"],
      top_company: false,
      isHiring: false,
      batch: "Winter 2024",
      status: "Active",
      industries: ["Cybersecurity"],
      regions: [],
      stage: "Other",
      url: "https://yc.com/abnormal",
    };
    const opportunity: NormalizedOpportunity = {
      externalKey: "company:abnormal",
      roleExternalId: null,
      roleSource: "company_fallback",
      title: null,
      summary: "AI-native security company",
      locations: "",
      remoteFlag: false,
      jobUrl: "https://abnormal.ai",
      extractedSkills: ["AI"],
    };

    const prospectScore = scoreOpportunity(baseCompany, opportunity);
    const nonProspectScore = scoreOpportunity({ ...baseCompany, name: "Ordinary Startup" }, opportunity);
    const explicitSum =
      prospectScore.breakdown.roleFit +
      prospectScore.breakdown.stackFit +
      prospectScore.breakdown.seniorityFit +
      prospectScore.breakdown.freshness +
      prospectScore.breakdown.companySignal;

    expect(prospectScore.breakdown.prospect_listed).toBe(true);
    expect(prospectScore.breakdown.companySignal - nonProspectScore.breakdown.companySignal).toBe(8);
    expect(prospectScore.reasons).toContain("Prospect-curated top startup");
    expect(prospectScore.score).toBe(explicitSum);
  });
});
