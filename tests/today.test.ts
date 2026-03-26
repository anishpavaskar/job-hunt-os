import fs from "fs";
import os from "os";
import path from "path";
import { runDraftCommand } from "../src/commands/draft";
import { runTodayCommand } from "../src/commands/today";
import { closeDb, initDb, resetDb } from "../src/db";
import {
  createFollowup,
  createScan,
  upsertApplication,
  upsertJob,
  upsertJobSource,
} from "../src/db/repositories";

describe("today command", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-today-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, "data", "profile.json"),
      JSON.stringify({
        name: "Anish Pavaskar",
        target_roles: ["Software Engineer", "Backend Engineer", "Platform Engineer"],
        skills_tier1: ["Go", "Kubernetes", "AWS", "TypeScript"],
        skills_tier2: ["Terraform", "Postgres"],
        domains: ["Backend Engineering", "Cloud Infrastructure"],
        practices: ["CI/CD", "Observability"],
        location: "Milpitas, CA",
        preferences: {
          remote: true,
          healthcare: true,
          early_stage: true,
          hybrid: true,
          relocation: true,
        },
      }, null, 2),
    );
    resetDb();

    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = createScan(db, "manual", new Date().toISOString());

    const followupSourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "followup-source",
      url: "https://example.com/followup",
    });
    const followupJobId = upsertJob(db, {
      sourceId: followupSourceId,
      scanId,
      externalKey: "manual:followup-source",
      roleExternalId: "followup-source",
      roleSource: "imported_role",
      companyName: "FollowFirst",
      title: "Platform Engineer",
      summary: "Operate core infra",
      website: "https://followfirst.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://example.com/followup",
      regions: ["Remote"],
      tags: ["Infrastructure"],
      industries: ["Developer Tools"],
      stage: "Growth",
      batch: "Imported",
      extractedSkills: ["Kubernetes"],
      topCompany: false,
      isHiring: true,
      score: 74,
      scoreReasons: ["role_fit:18"],
      scoreBreakdown: { roleFit: 18, stackFit: 18, seniorityFit: 12, freshness: 10, companySignal: 16 },
      explanationBullets: ["Strong infra fit"],
      riskBullets: ["Compensation not disclosed"],
    });
    const followupApplicationId = upsertApplication(db, followupJobId, {
      status: "applied",
      appliedAt: "2026-03-20T00:00:00.000Z",
    });
    createFollowup(db, followupJobId, followupApplicationId, "2026-03-24T00:00:00.000Z", "Check in now");

    const draftSourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "draft-source",
      url: "https://example.com/draft",
    });
    const draftJobId = upsertJob(db, {
      sourceId: draftSourceId,
      scanId,
      externalKey: "manual:draft-source",
      roleExternalId: "draft-source",
      roleSource: "imported_role",
      companyName: "DraftReady",
      title: "Senior Backend Engineer",
      summary: "Build APIs for healthcare",
      website: "https://draftready.com",
      locations: "San Francisco, CA",
      remoteFlag: true,
      jobUrl: "https://example.com/draft",
      regions: ["Remote"],
      tags: ["Backend"],
      industries: ["Healthcare"],
      stage: "Early",
      batch: "Imported",
      extractedSkills: ["TypeScript", "Postgres"],
      topCompany: false,
      isHiring: true,
      score: 83,
      scoreReasons: ["role_fit:22"],
      scoreBreakdown: { roleFit: 22, stackFit: 19, seniorityFit: 14, freshness: 10, companySignal: 18 },
      explanationBullets: ["Role fit is unusually strong"],
      riskBullets: ["Onsite expectations are unclear"],
    });
    upsertApplication(db, draftJobId, {
      status: "drafted",
      note: "Nearly ready to submit",
    });
    await runDraftCommand("Senior Backend Engineer", { save: true, variant: "v1" });

    const applySourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "apply-source",
      url: "https://example.com/apply",
    });
    upsertJob(db, {
      sourceId: applySourceId,
      scanId,
      externalKey: "manual:apply-source",
      roleExternalId: "apply-source",
      roleSource: "imported_role",
      companyName: "ApplyToday",
      title: "Site Reliability Engineer",
      summary: "Own reliability tooling",
      website: "https://applytoday.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://example.com/apply",
      regions: ["Remote"],
      tags: ["Infrastructure"],
      industries: ["Cloud"],
      stage: "Growth",
      batch: "Imported",
      extractedSkills: ["Terraform", "AWS"],
      topCompany: false,
      isHiring: true,
      score: 91,
      scoreReasons: ["stack_fit:24"],
      scoreBreakdown: { roleFit: 21, stackFit: 24, seniorityFit: 16, freshness: 12, companySignal: 18 },
      explanationBullets: ["Excellent reliability match"],
      riskBullets: ["Company signal is still limited"],
      status: "shortlisted",
    });
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("prioritizes urgent follow-ups, then ready drafts, then strong unapplied jobs", () => {
    const lines = runTodayCommand({ limit: "3" });

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("FollowFirst");
    expect(lines[0]).toContain("follow up");
    expect(lines[0]).toContain("score details:");
    expect(lines[0]).toContain("why it's a match:");
    expect(lines[0]).toContain("Matches target roles:");
    expect(lines[0]).toContain("next step: send the follow-up now");

    expect(lines[1]).toContain("DraftReady");
    expect(lines[1]).toContain("send draft");
    expect(lines[1]).toContain("score details:");
    expect(lines[1]).toContain("reason:");
    expect(lines[1]).toContain("why it's a match:");
    expect(lines[1]).toContain("Aligned preferences:");

    expect(lines[2]).toContain("ApplyToday");
    expect(lines[2]).toContain("apply");
    expect(lines[2]).toContain("score details:");
    expect(lines[2]).toContain("why it's a match:");
    expect(lines[2]).toContain("Matched skills:");
    expect(lines[2]).toContain("apply today");
  });

  test("filters weak technical matches and keeps stronger technical apply targets ahead of soft-signal matches", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = createScan(db, "manual", new Date().toISOString());

    const filteredSourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "filtered-source",
      url: "https://example.com/filtered",
    });
    upsertJob(db, {
      sourceId: filteredSourceId,
      scanId,
      externalKey: "manual:filtered-source",
      roleExternalId: "filtered-source",
      roleSource: "imported_role",
      companyName: "PreferenceOnlyCo",
      title: "Generalist Engineer",
      summary: "Remote healthcare startup with strong company pedigree",
      website: "https://preferenceonly.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://example.com/filtered",
      regions: ["Remote"],
      tags: ["Healthcare"],
      industries: ["Healthcare"],
      stage: "Growth",
      batch: "Winter 2026",
      extractedSkills: [],
      topCompany: true,
      isHiring: true,
      score: 86,
      scoreReasons: ["company_signal:20"],
      scoreBreakdown: { roleFit: 6, stackFit: 8, seniorityFit: 12, freshness: 10, companySignal: 20 },
      explanationBullets: [
        "Remote-friendly role",
        "Fresh enough to prioritize from Winter 2026",
        "Strong company signal from YC and hiring posture",
      ],
      riskBullets: ["Technical fit is still unclear"],
    });

    const softSignalSourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "soft-signal-source",
      url: "https://example.com/soft-signal",
    });
    upsertJob(db, {
      sourceId: softSignalSourceId,
      scanId,
      externalKey: "manual:soft-signal-source",
      roleExternalId: "soft-signal-source",
      roleSource: "imported_role",
      companyName: "SoftSignalCo",
      title: "Software Engineer",
      summary: "Remote healthcare software team in the Bay Area",
      website: "https://softsignal.com",
      locations: "San Francisco, CA",
      remoteFlag: true,
      jobUrl: "https://example.com/soft-signal",
      regions: ["Remote"],
      tags: ["Healthcare"],
      industries: ["Healthcare"],
      stage: "Growth",
      batch: "Winter 2026",
      extractedSkills: ["SQL"],
      topCompany: true,
      isHiring: true,
      score: 88,
      scoreReasons: ["company_signal:20"],
      scoreBreakdown: { roleFit: 10, stackFit: 12, seniorityFit: 12, freshness: 10, companySignal: 20 },
      explanationBullets: [
        "Remote-friendly role",
        "Fresh enough to prioritize from Winter 2026",
        "Strong company signal from YC and hiring posture",
      ],
      riskBullets: ["Technical fit is still unclear"],
    });

    const deepFitSourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "deep-fit-source",
      url: "https://example.com/deep-fit",
    });
    upsertJob(db, {
      sourceId: deepFitSourceId,
      scanId,
      externalKey: "manual:deep-fit-source",
      roleExternalId: "deep-fit-source",
      roleSource: "imported_role",
      companyName: "DeepFitCo",
      title: "Platform Engineer",
      summary: "Build Go, Kubernetes, AWS, CI/CD, and observability systems",
      website: "https://deepfit.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://example.com/deep-fit",
      regions: ["Remote"],
      tags: ["Infrastructure"],
      industries: ["Software"],
      stage: "Early",
      batch: "Winter 2026",
      extractedSkills: ["Go", "Kubernetes", "AWS"],
      topCompany: false,
      isHiring: true,
      score: 78,
      scoreReasons: ["role_fit:18", "stack_fit:20"],
      scoreBreakdown: { roleFit: 18, stackFit: 20, seniorityFit: 12, freshness: 8, companySignal: 9 },
      explanationBullets: [
        "Strong role fit for Platform Engineer",
        "Stack aligns well with your core skills",
      ],
      riskBullets: ["Compensation not disclosed"],
    });

    const lines = runTodayCommand({ limit: "10" });
    const combined = lines.join("\n");
    const softSignalIndex = lines.findIndex((line) => line.includes("SoftSignalCo"));
    const deepFitIndex = lines.findIndex((line) => line.includes("DeepFitCo"));

    expect(combined).not.toContain("PreferenceOnlyCo");
    expect(deepFitIndex).toBeGreaterThanOrEqual(0);
    expect(softSignalIndex).toBeGreaterThanOrEqual(0);
    expect(deepFitIndex).toBeLessThan(softSignalIndex);
    expect(lines[deepFitIndex]).toContain("Matched skills:");
    expect(lines[softSignalIndex]).toContain("Aligned preferences:");
  });

  test("excludes company fallback roles by default and can include them explicitly", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = createScan(db, "manual", new Date().toISOString());
    const fallbackSourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "fallback-source",
      url: "https://example.com/fallback",
    });

    upsertJob(db, {
      sourceId: fallbackSourceId,
      scanId,
      externalKey: "company:fallback-co",
      roleExternalId: null,
      roleSource: "company_fallback",
      companyName: "FallbackCo",
      title: null,
      summary: "General company page for a strong startup",
      website: "https://fallbackco.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://example.com/fallback",
      regions: ["Remote"],
      tags: ["Infrastructure"],
      industries: ["Software"],
      stage: "Growth",
      batch: "Imported",
      extractedSkills: ["AWS"],
      topCompany: true,
      isHiring: true,
      score: 95,
      scoreReasons: ["company_signal:20"],
      scoreBreakdown: { roleFit: 16, stackFit: 18, seniorityFit: 12, freshness: 10, companySignal: 20 },
      explanationBullets: ["Stack aligns well with your core skills"],
      riskBullets: ["Role details are missing"],
      status: "shortlisted",
    });

    const defaultLines = runTodayCommand({ limit: "10" });
    const includeFallbackLines = runTodayCommand({ limit: "10", includeFallback: true });

    expect(defaultLines.join("\n")).not.toContain("FallbackCo");
    expect(includeFallbackLines.join("\n")).toContain("FallbackCo");
  });
});
