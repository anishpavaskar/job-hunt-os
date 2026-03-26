import fs from "fs";
import os from "os";
import path from "path";
import { closeDb, initDb, resetDb } from "../src/db";
import {
  upsertJob,
  upsertJobSource,
  createScan,
  completeScan,
  upsertApplication,
  createFollowup,
  upsertDraft,
} from "../src/db/repositories";
import {
  assembleNewRoles,
  assembleFollowups,
  assembleDrafts,
  assembleWeeklyFunnel,
  assembleBriefingData,
  getBriefingSmsSummary,
} from "../src/commands/briefing";

// ─── Test helpers ──────────────────────────────────────────────

function seedJob(
  db: ReturnType<typeof initDb>,
  sourceId: number,
  scanId: number,
  overrides: Partial<{
    externalKey: string;
    companyName: string;
    title: string | null;
    roleSource: string;
    score: number;
    jobUrl: string;
    locations: string;
    remoteFlag: boolean;
    explanationBullets: string[];
    riskBullets: string[];
    createdAt: string;
  }> = {},
) {
  const key = overrides.externalKey ?? `test:${Date.now()}:${Math.random()}`;
  return upsertJob(db, {
    sourceId,
    scanId,
    externalKey: key,
    roleExternalId: null,
    roleSource: overrides.roleSource ?? "role",
    companyName: overrides.companyName ?? "TestCo",
    title: overrides.title === undefined ? "Engineer" : overrides.title,
    summary: "A test role",
    website: "https://test.com",
    locations: overrides.locations ?? "San Francisco, CA",
    remoteFlag: overrides.remoteFlag ?? false,
    jobUrl: overrides.jobUrl ?? "https://test.com/jobs/1",
    regions: [],
    tags: [],
    industries: [],
    stage: "Growth",
    batch: "W25",
    topCompany: false,
    isHiring: true,
    score: overrides.score ?? 75,
    scoreReasons: ["Good fit"],
    scoreBreakdown: { roleFit: 20, stackFit: 25, seniorityFit: 10, freshness: 8, companySignal: 12 },
    explanationBullets: overrides.explanationBullets ?? ["Strong role fit"],
    riskBullets: overrides.riskBullets ?? ["Compensation unknown"],
    status: "new",
  });
}

// ─── Tests ─────────────────────────────────────────────────────

describe("briefing data assembly", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "briefing-test-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    initDb(path.join(tmpDir, "data", "job_hunt.db"));
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("assembleNewRoles uses the 50-point default threshold and sorts by score", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());
    completeScan(db, scanId, 1, 1, new Date().toISOString());

    seedJob(db, sourceId, scanId, { externalKey: "t:1", companyName: "HighCo", title: "Staff SRE", score: 92 });
    seedJob(db, sourceId, scanId, { externalKey: "t:2", companyName: "MidCo", title: "Backend Eng", score: 55 });
    seedJob(db, sourceId, scanId, { externalKey: "t:3", companyName: "LowCo", title: "Junior Dev", score: 49 });

    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const roles = assembleNewRoles(db, new Set(), "2026-03-26");

    expect(roles).toHaveLength(2);
    expect(roles[0].company).toBe("HighCo");
    expect(roles[0].score).toBe(92);
    expect(roles[0].rank).toBe(1);
    expect(roles[1].company).toBe("MidCo");
    expect(roles[1].score).toBe(55);
    expect(roles[1].rank).toBe(2);
  });

  test("assembleNewRoles flags prospect companies", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    seedJob(db, sourceId, scanId, { externalKey: "t:p1", companyName: "Anthropic", title: "SWE", score: 88 });
    seedJob(db, sourceId, scanId, { externalKey: "t:p2", companyName: "RandomCo", title: "SWE", score: 80 });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const prospectNames = new Set(["anthropic"]);
    const roles = assembleNewRoles(db, prospectNames, "2026-03-26");

    expect(roles[0].isProspect).toBe(true);
    expect(roles[1].isProspect).toBe(false);
  });

  test("assembleNewRoles includes explanation and risk bullets", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    seedJob(db, sourceId, scanId, {
      externalKey: "t:e1",
      companyName: "ExplainCo",
      score: 85,
      explanationBullets: ["Great stack overlap with Kubernetes"],
      riskBullets: ["No comp info"],
    });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const roles = assembleNewRoles(db, new Set(), "2026-03-26");

    expect(roles[0].whyItFits).toBe("Great stack overlap with Kubernetes");
    expect(roles[0].topRisk).toBe("No comp info");
  });

  test("assembleFollowups returns pending followups with last action", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    const jobId = seedJob(db, sourceId, scanId, { externalKey: "t:f1", companyName: "FollowCo", title: "Platform Eng" });
    const appId = upsertApplication(db, jobId, { status: "applied", note: "Applied via website" });
    createFollowup(db, jobId, appId, "2026-04-01", "Check back on application");

    const followups = assembleFollowups(db);

    expect(followups).toHaveLength(1);
    expect(followups[0].company).toBe("FollowCo");
    expect(followups[0].role).toBe("Platform Eng");
    expect(followups[0].dueDate).toBe("2026-04-01");
    expect(followups[0].notes).toBe("Check back on application");
    expect(followups[0].lastAction).toContain("followup created");
  });

  test("assembleDrafts returns unsent drafts", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    const jobId = seedJob(db, sourceId, scanId, { externalKey: "t:d1", companyName: "DraftCo", title: "DevOps Eng" });
    upsertApplication(db, jobId, { status: "drafted" });
    upsertDraft(db, { jobId, variant: "v1", generatedContent: "Hello DraftCo..." });

    const drafts = assembleDrafts(db);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].company).toBe("DraftCo");
    expect(drafts[0].draftVariant).toBe("v1");
  });

  test("assembleDrafts excludes drafts with applied status", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    const jobId = seedJob(db, sourceId, scanId, { externalKey: "t:d2", companyName: "SentCo", title: "SRE" });
    const appId = upsertApplication(db, jobId, { status: "applied" });
    upsertDraft(db, { jobId, applicationId: appId, variant: "v1", generatedContent: "Already sent" });

    const drafts = assembleDrafts(db);
    expect(drafts).toHaveLength(0);
  });

  test("assembleWeeklyFunnel returns conversion stats", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    const j1 = seedJob(db, sourceId, scanId, { externalKey: "t:w1", companyName: "A", score: 80 });
    const j2 = seedJob(db, sourceId, scanId, { externalKey: "t:w2", companyName: "B", score: 75 });
    seedJob(db, sourceId, scanId, { externalKey: "t:w3", companyName: "C", score: 60 });

    upsertApplication(db, j1, { status: "applied", appliedAt: new Date().toISOString() });
    upsertApplication(db, j2, { status: "interview", appliedAt: new Date().toISOString() });

    const funnel = assembleWeeklyFunnel(db);

    expect(funnel.totalTracked).toBe(3);
    expect(funnel.appliedThisWeek).toBe(2);
    expect(funnel.interviewsScheduled).toBe(1);
  });

  test("assembleBriefingData includes funnel only on Mondays", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));

    // 2026-03-30 is a Monday
    const monday = assembleBriefingData(db, "2026-03-30");
    expect(monday.funnel).not.toBeNull();

    // 2026-03-31 is a Tuesday
    const tuesday = assembleBriefingData(db, "2026-03-31");
    expect(tuesday.funnel).toBeNull();
  });

  test("assembleBriefingData ties all sections together", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    seedJob(db, sourceId, scanId, { externalKey: "t:all1", companyName: "Co1", score: 80 });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const data = assembleBriefingData(db, "2026-03-26");

    expect(data.date).toBe("2026-03-26");
    expect(data.newRoles.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.followups)).toBe(true);
    expect(Array.isArray(data.drafts)).toBe(true);
    // 2026-03-26 is Thursday → no funnel
    expect(data.funnel).toBeNull();
  });

  test("assembleBriefingData excludes company fallback roles by default and can include them explicitly", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    seedJob(db, sourceId, scanId, { externalKey: "t:real", companyName: "RealRoleCo", title: "Platform Engineer", score: 78 });
    seedJob(db, sourceId, scanId, {
      externalKey: "company:fallbackco",
      companyName: "FallbackCo",
      title: null,
      roleSource: "company_fallback",
      score: 91,
      jobUrl: "https://fallback.example.com",
    });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const defaultData = assembleBriefingData(db, "2026-03-26");
    const includeFallbackData = assembleBriefingData(db, "2026-03-26", { includeFallback: true });

    expect(defaultData.newRoles.map((role) => role.company)).toEqual(["RealRoleCo"]);
    expect(includeFallbackData.newRoles.map((role) => role.company)).toEqual(["FallbackCo", "RealRoleCo"]);
  });

  test("assembleBriefingData uses the requested date window for new roles", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = createScan(db, "test", new Date().toISOString());

    const olderJobId = seedJob(db, sourceId, scanId, { externalKey: "t:dated-old", companyName: "OldCo", score: 85 });
    const currentJobId = seedJob(db, sourceId, scanId, { externalKey: "t:dated-new", companyName: "NewCo", score: 82 });

    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ? WHERE id = ?`).run("2026-03-25T10:00:00.000Z", "2026-03-25T10:00:00.000Z", olderJobId);
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ? WHERE id = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z", currentJobId);

    const olderDay = assembleBriefingData(db, "2026-03-25");
    const currentDay = assembleBriefingData(db, "2026-03-26");

    expect(olderDay.newRoles).toHaveLength(1);
    expect(olderDay.newRoles[0].company).toBe("OldCo");
    expect(currentDay.newRoles).toHaveLength(1);
    expect(currentDay.newRoles[0].company).toBe("NewCo");
  });

  test("getBriefingSmsSummary returns new role count and top score", () => {
    const summary = getBriefingSmsSummary({
      date: "2026-03-26",
      newRoles: [
        {
          rank: 1,
          score: 92,
          company: "Anthropic",
          role: "SWE II",
          location: "San Francisco, CA",
          whyItFits: "Strong fit",
          topRisk: null,
          applyLink: "https://example.com",
          isProspect: true,
        },
      ],
      followups: [],
      drafts: [],
      funnel: null,
    });

    expect(summary).toEqual({ newRoleCount: 1, topScore: 92 });
  });
});
