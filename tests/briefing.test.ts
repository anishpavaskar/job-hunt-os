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
  runBriefingCommand,
} from "../src/commands/briefing";
import * as gmailIntegration from "../src/integrations/gmail";

// ─── Test helpers ──────────────────────────────────────────────

async function seedJob(
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
    jest.restoreAllMocks();
    process.chdir(previousCwd);
    closeDb();
  });

  test("assembleNewRoles uses the 50-point default threshold and sorts by score", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());
    await completeScan(db, scanId, 1, 1, new Date().toISOString());

    await seedJob(db, sourceId, scanId, { externalKey: "t:1", companyName: "HighCo", title: "Staff SRE", score: 92 });
    await seedJob(db, sourceId, scanId, { externalKey: "t:2", companyName: "MidCo", title: "Backend Eng", score: 55 });
    await seedJob(db, sourceId, scanId, { externalKey: "t:3", companyName: "LowCo", title: "Junior Dev", score: 49 });

    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const roles = await assembleNewRoles(db, new Set(), "2026-03-26");

    expect(roles).toHaveLength(2);
    expect(roles[0].company).toBe("HighCo");
    expect(roles[0].score).toBe(92);
    expect(roles[0].rank).toBe(1);
    expect(roles[1].company).toBe("MidCo");
    expect(roles[1].score).toBe(55);
    expect(roles[1].rank).toBe(2);
  });

  test("assembleNewRoles flags prospect companies", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    await seedJob(db, sourceId, scanId, { externalKey: "t:p1", companyName: "Anthropic", title: "SWE", score: 88 });
    await seedJob(db, sourceId, scanId, { externalKey: "t:p2", companyName: "RandomCo", title: "SWE", score: 80 });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const prospectNames = new Set(["anthropic"]);
    const roles = await assembleNewRoles(db, prospectNames, "2026-03-26");

    expect(roles[0].isProspect).toBe(true);
    expect(roles[1].isProspect).toBe(false);
  });

  test("assembleNewRoles includes explanation and risk bullets", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    await seedJob(db, sourceId, scanId, {
      externalKey: "t:e1",
      companyName: "ExplainCo",
      score: 85,
      explanationBullets: ["Great stack overlap with Kubernetes"],
      riskBullets: ["No comp info"],
    });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const roles = await assembleNewRoles(db, new Set(), "2026-03-26");

    expect(roles[0].whyItFits).toBe("Great stack overlap with Kubernetes");
    expect(roles[0].topRisk).toBe("No comp info");
  });

  test("assembleFollowups returns pending followups with last action", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    const jobId = await seedJob(db, sourceId, scanId, { externalKey: "t:f1", companyName: "FollowCo", title: "Platform Eng" });
    const appId = await upsertApplication(db, jobId, { status: "applied", note: "Applied via website" });
    await createFollowup(db, jobId, appId, "2026-04-01", "Check back on application");

    const followups = await assembleFollowups(db);

    expect(followups).toHaveLength(1);
    expect(followups[0].company).toBe("FollowCo");
    expect(followups[0].role).toBe("Platform Eng");
    expect(followups[0].dueDate).toBe("2026-04-01");
    expect(followups[0].notes).toBe("Check back on application");
    expect(followups[0].lastAction).toContain("followup created");
  });

  test("assembleDrafts returns unsent drafts", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    const jobId = await seedJob(db, sourceId, scanId, { externalKey: "t:d1", companyName: "DraftCo", title: "DevOps Eng" });
    await upsertApplication(db, jobId, { status: "drafted" });
    await upsertDraft(db, { jobId, variant: "v1", generatedContent: "Hello DraftCo..." });

    const drafts = await assembleDrafts(db);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].company).toBe("DraftCo");
    expect(drafts[0].draftVariant).toBe("v1");
  });

  test("assembleDrafts excludes drafts with applied status", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    const jobId = await seedJob(db, sourceId, scanId, { externalKey: "t:d2", companyName: "SentCo", title: "SRE" });
    const appId = await upsertApplication(db, jobId, { status: "applied" });
    await upsertDraft(db, { jobId, applicationId: appId, variant: "v1", generatedContent: "Already sent" });

    const drafts = await assembleDrafts(db);
    expect(drafts).toHaveLength(0);
  });

  test("assembleWeeklyFunnel returns conversion stats", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    const j1 = await seedJob(db, sourceId, scanId, { externalKey: "t:w1", companyName: "A", score: 80 });
    const j2 = await seedJob(db, sourceId, scanId, { externalKey: "t:w2", companyName: "B", score: 75 });
    await seedJob(db, sourceId, scanId, { externalKey: "t:w3", companyName: "C", score: 60 });

    await upsertApplication(db, j1, { status: "applied", appliedAt: new Date().toISOString() });
    await upsertApplication(db, j2, { status: "interview", appliedAt: new Date().toISOString() });

    const funnel = await assembleWeeklyFunnel(db);

    expect(funnel.totalTracked).toBe(3);
    expect(funnel.appliedThisWeek).toBe(2);
    expect(funnel.interviewsScheduled).toBe(1);
  });

  test("assembleBriefingData includes funnel only on Mondays", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));

    // 2026-03-30 is a Monday
    const monday = await assembleBriefingData(db, "2026-03-30");
    expect(monday.funnel).not.toBeNull();

    // 2026-03-31 is a Tuesday
    const tuesday = await assembleBriefingData(db, "2026-03-31");
    expect(tuesday.funnel).toBeNull();
  });

  test("assembleBriefingData ties all sections together", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    await seedJob(db, sourceId, scanId, { externalKey: "t:all1", companyName: "Co1", score: 80 });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const data = await assembleBriefingData(db, "2026-03-26");

    expect(data.date).toBe("2026-03-26");
    expect(Array.isArray(data.applyNow)).toBe(true);
    expect(data.newRoles.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.followups)).toBe(true);
    expect(Array.isArray(data.drafts)).toBe(true);
    // 2026-03-26 is Thursday → no funnel
    expect(data.funnel).toBeNull();
  });

  test("assembleBriefingData excludes company fallback roles by default and can include them explicitly", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    await seedJob(db, sourceId, scanId, { externalKey: "t:real", companyName: "RealRoleCo", title: "Platform Engineer", score: 78 });
    await seedJob(db, sourceId, scanId, {
      externalKey: "company:fallbackco",
      companyName: "FallbackCo",
      title: null,
      roleSource: "company_fallback",
      score: 91,
      jobUrl: "https://fallback.example.com",
    });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const defaultData = await assembleBriefingData(db, "2026-03-26");
    const includeFallbackData = await assembleBriefingData(db, "2026-03-26", { includeFallback: true });

    expect(defaultData.newRoles.map((role) => role.company)).toEqual(["RealRoleCo"]);
    expect(includeFallbackData.newRoles.map((role) => role.company)).toEqual(["FallbackCo", "RealRoleCo"]);
  });

  test("assembleNewRoles caps repeated companies and inserts a summary row for overflow", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "repeats", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    await seedJob(db, sourceId, scanId, { externalKey: "t:r1", companyName: "RepeatCo", title: "Role 1", score: 91 });
    await seedJob(db, sourceId, scanId, { externalKey: "t:r2", companyName: "RepeatCo", title: "Role 2", score: 88 });
    await seedJob(db, sourceId, scanId, { externalKey: "t:r3", companyName: "RepeatCo", title: "Role 3", score: 84 });
    await seedJob(db, sourceId, scanId, { externalKey: "t:r4", companyName: "OtherCo", title: "Role 4", score: 80 });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26 10:00:00", "2026-03-26 10:00:00");

    const roles = await assembleNewRoles(db, new Set(), "2026-03-26");

    expect(roles.map((role) => role.company)).toEqual(["RepeatCo", "RepeatCo", "RepeatCo", "OtherCo"]);
    expect(roles[2].kind).toBe("overflow");
    expect(roles[2].role).toContain("+1 more roles at RepeatCo");
    expect(roles[2].rank).toBeNull();
  });

  test("assembleBriefingData builds a deduped apply-now section", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "apply-now", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    await seedJob(db, sourceId, scanId, { externalKey: "t:a1", companyName: "ApplyCo", title: "Platform Engineer", score: 90, locations: "Remote" });
    await seedJob(db, sourceId, scanId, { externalKey: "t:a2", companyName: "ApplyCo", title: "Backend Engineer", score: 88, locations: "Remote" });
    await seedJob(db, sourceId, scanId, { externalKey: "t:a3", companyName: "OtherApplyCo", title: "SRE", score: 84, locations: "San Francisco, CA | Seattle, WA" });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26 10:00:00", "2026-03-26 10:00:00");

    const data = await assembleBriefingData(db, "2026-03-26");

    expect(data.applyNow.length).toBeGreaterThanOrEqual(2);
    expect(data.applyNow[0].company).toBe("ApplyCo");
    expect(data.applyNow.some((role) => role.company === "OtherApplyCo")).toBe(true);
    expect(data.applyNow.filter((role) => role.company === "ApplyCo")).toHaveLength(1);
    expect(data.applyNow.find((role) => role.company === "OtherApplyCo")?.location).toBe("San Francisco, CA • Seattle, WA");
  });

  test("assembleBriefingData keeps strong apply-now roles even when they were discovered before the briefing date", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "apply-queue", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    const oldStrongJobId = await seedJob(db, sourceId, scanId, {
      externalKey: "t:queued-old",
      companyName: "QueuedCo",
      title: "Platform Engineer",
      score: 72,
      locations: "Remote",
      explanationBullets: ["Strong role fit for Platform Engineer", "Stack aligns well with your core skills"],
    });
    db.prepare(
      `UPDATE jobs
       SET created_at = ?, updated_at = ?, score_breakdown_json = ?
       WHERE id = ?`,
    ).run(
      "2026-03-20 10:00:00",
      "2026-03-20 10:00:00",
      JSON.stringify({ roleFit: 18, stackFit: 20, seniorityFit: 10, freshness: 4, companySignal: 10 }),
      oldStrongJobId,
    );

    const data = await assembleBriefingData(db, "2026-03-26");

    expect(data.newRoles).toHaveLength(0);
    expect(data.applyNow.some((role) => role.company === "QueuedCo")).toBe(true);
  });

  test("assembleBriefingData falls back to technically decent roles when strict apply-now queue is empty", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "apply-fallback", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    const fallbackJobId = await seedJob(db, sourceId, scanId, {
      externalKey: "t:apply-fallback",
      companyName: "FallbackApplyCo",
      title: "Software Engineer",
      score: 56,
      locations: "Remote",
      explanationBullets: ["Good overlap with backend engineering work"],
    });
    db.prepare(
      `UPDATE jobs
       SET created_at = ?, updated_at = ?, score_breakdown_json = ?
       WHERE id = ?`,
    ).run(
      "2026-03-26 10:00:00",
      "2026-03-26 10:00:00",
      JSON.stringify({ roleFit: 7, stackFit: 11, seniorityFit: 9, freshness: 5, companySignal: 10 }),
      fallbackJobId,
    );

    const data = await assembleBriefingData(db, "2026-03-26");

    expect(data.applyNow.some((role) => role.company === "FallbackApplyCo")).toBe(true);
  });

  test("assembleBriefingData uses the requested date window for new roles", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "s1", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    const olderJobId = await seedJob(db, sourceId, scanId, { externalKey: "t:dated-old", companyName: "OldCo", score: 85 });
    const currentJobId = await seedJob(db, sourceId, scanId, { externalKey: "t:dated-new", companyName: "NewCo", score: 82 });

    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ? WHERE id = ?`).run("2026-03-25T10:00:00.000Z", "2026-03-25T10:00:00.000Z", olderJobId);
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ? WHERE id = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z", currentJobId);

    const olderDay = await assembleBriefingData(db, "2026-03-25");
    const currentDay = await assembleBriefingData(db, "2026-03-26");

    expect(olderDay.newRoles).toHaveLength(1);
    expect(olderDay.newRoles[0].company).toBe("OldCo");
    expect(currentDay.newRoles).toHaveLength(1);
    expect(currentDay.newRoles[0].company).toBe("NewCo");
  });

  test("assembleBriefingData uses tracked open roles by default, not only recent rows", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "baseline", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    const oldOpenJobId = await seedJob(db, sourceId, scanId, {
      externalKey: "t:baseline-old",
      companyName: "BaselineCo",
      title: "Backend Engineer",
      score: 77,
    });
    const recentOpenJobId = await seedJob(db, sourceId, scanId, {
      externalKey: "t:baseline-recent",
      companyName: "RecentCo",
      title: "Platform Engineer",
      score: 72,
    });
    const appliedJobId = await seedJob(db, sourceId, scanId, {
      externalKey: "t:baseline-applied",
      companyName: "AppliedCo",
      title: "Infra Engineer",
      score: 80,
    });

    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ? WHERE id = ?`).run("2026-02-20T10:00:00.000Z", "2026-02-20T10:00:00.000Z", oldOpenJobId);
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ? WHERE id = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z", recentOpenJobId);
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ? WHERE id = ?`).run("2026-02-18T10:00:00.000Z", "2026-02-18T10:00:00.000Z", appliedJobId);

    await upsertApplication(db, appliedJobId, { status: "applied" });

    const data = await assembleBriefingData(db);

    expect(data.newRoles.some((role) => role.company === "BaselineCo")).toBe(true);
    expect(data.newRoles.some((role) => role.company === "RecentCo")).toBe(true);
    expect(data.newRoles.some((role) => role.company === "AppliedCo")).toBe(false);
  });

  test("assembleNewRoles matches rows stored with SQLite datetime format", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "sqlite-dt", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    await seedJob(db, sourceId, scanId, { externalKey: "t:sqlite-dt", companyName: "SqliteTimeCo", score: 77 });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26 08:56:32", "2026-03-26 08:56:32");

    const roles = await assembleNewRoles(db, new Set(), "2026-03-26");

    expect(roles).toHaveLength(1);
    expect(roles[0].company).toBe("SqliteTimeCo");
  });

  test("runBriefingCommand sends the HTML email and does not warn on success", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "email-only", url: "https://test.com" });
    const scanId = await createScan(db, "test", new Date().toISOString());

    await seedJob(db, sourceId, scanId, { externalKey: "t:email-only", companyName: "MailCo", score: 92 });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const emailSpy = jest.spyOn(gmailIntegration, "sendBriefingHtmlEmail").mockResolvedValue("msg-123");

    await expect(runBriefingCommand({ scan: false, date: "2026-03-26" })).resolves.toBeUndefined();

    expect(emailSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("\n[briefing] Email sent (message ID: msg-123)");
  });
});
