import fs from "fs";
import os from "os";
import path from "path";
import { closeDb, initDb, resetDb } from "../src/db";
import { createScan, upsertJob, upsertJobSource } from "../src/db/repositories";
import { runBaselineBootstrapCommand } from "../src/commands/baseline-bootstrap";

describe("baseline bootstrap", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-bootstrap-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    initDb(path.join(tmpDir, "data", "job_hunt.db"));
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("creates a one-time baseline snapshot from current open real roles", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "test", new Date().toISOString());
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "source-1", url: "https://example.com" });

    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "role:1",
      roleExternalId: "1",
      roleSource: "greenhouse",
      companyName: "Scale AI",
      title: "Infrastructure Software Engineer",
      summary: "Infra role",
      website: "https://scale.com",
      locations: "San Francisco, CA",
      remoteFlag: false,
      jobUrl: "https://example.com/jobs/1",
      postedAt: "2026-03-01T00:00:00.000Z",
      regions: [],
      tags: [],
      industries: [],
      stage: "Growth",
      batch: "External",
      extractedSkills: ["Kubernetes"],
      topCompany: true,
      isHiring: true,
      score: 53,
      scoreReasons: ["role_fit:24"],
      scoreBreakdown: { roleFit: 24, stackFit: 0, seniorityFit: 7, freshness: 3, companySignal: 19 },
      explanationBullets: ["Strong role fit"],
      riskBullets: ["Not clearly remote"],
      status: "new",
    });

    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "fallback:1",
      roleExternalId: null,
      roleSource: "company_fallback",
      companyName: "FallbackCo",
      title: null,
      summary: "Fallback role",
      website: "https://fallback.example",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://fallback.example/jobs",
      postedAt: null,
      regions: [],
      tags: [],
      industries: [],
      stage: "Seed",
      batch: "W25",
      extractedSkills: [],
      topCompany: false,
      isHiring: true,
      score: 51,
      scoreReasons: ["company_signal:10"],
      scoreBreakdown: { roleFit: 5, stackFit: 0, seniorityFit: 7, freshness: 3, companySignal: 36 },
      explanationBullets: ["Fallback"],
      riskBullets: ["General"],
      status: "new",
    });

    const output = await runBaselineBootstrapCommand({ days: "30", minScore: "45" });
    expect(output).toContain("Baseline snapshot created.");
    expect(output).toContain("label: baseline_30d");
    expect(output).toContain("jobs captured: 1");

    const snapshot = db
      .prepare(`SELECT label, effective_date FROM baseline_snapshots`)
      .get() as { label: string; effective_date: string };
    const jobs = db
      .prepare(`SELECT score_snapshot, role_source_snapshot, posted_at_snapshot FROM baseline_jobs`)
      .all() as Array<{ score_snapshot: number; role_source_snapshot: string; posted_at_snapshot: string | null }>;

    expect(snapshot.label).toBe("baseline_30d");
    expect(snapshot.effective_date).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].score_snapshot).toBe(53);
    expect(jobs[0].role_source_snapshot).toBe("greenhouse");
    expect(jobs[0].posted_at_snapshot).toBe("2026-03-01T00:00:00.000Z");
  });

  test("requires --replace before rebuilding the same baseline label", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "test", new Date().toISOString());
    const sourceId = await upsertJobSource(db, { provider: "test", externalId: "source-2", url: "https://example.com" });

    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "role:2",
      roleExternalId: "2",
      roleSource: "greenhouse",
      companyName: "Vercel",
      title: "Deployment Infrastructure Engineer",
      summary: "Infra role",
      website: "https://vercel.com",
      locations: "New York, NY",
      remoteFlag: false,
      jobUrl: "https://example.com/jobs/2",
      postedAt: null,
      regions: [],
      tags: [],
      industries: [],
      stage: "Growth",
      batch: "External",
      extractedSkills: ["AWS"],
      topCompany: true,
      isHiring: true,
      score: 49,
      scoreReasons: ["role_fit:20"],
      scoreBreakdown: { roleFit: 20, stackFit: 0, seniorityFit: 7, freshness: 3, companySignal: 19 },
      explanationBullets: ["Strong role fit"],
      riskBullets: ["Not clearly remote"],
      status: "new",
    });

    await runBaselineBootstrapCommand({ label: "manual_baseline" });
    await expect(runBaselineBootstrapCommand({ label: "manual_baseline" })).rejects.toThrow(
      'Baseline "manual_baseline" already exists. Re-run with --replace to rebuild it.',
    );

    const output = await runBaselineBootstrapCommand({ label: "manual_baseline", replace: true });
    expect(output).toContain("label: manual_baseline");
  });
});
