import fs from "fs";
import os from "os";
import path from "path";
import { runStatsCommand } from "../src/commands/stats";
import { closeDb, initDb, resetDb } from "../src/db";
import { createScan, getApplicationEvents, upsertApplication, upsertJob, upsertJobSource } from "../src/db/repositories";

describe("stats and outcome tracking", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-stats-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "yc", new Date().toISOString());

    const ycSource = await upsertJobSource(db, {
      provider: "yc",
      externalId: "yc-role-1",
      url: "https://yc.example/role-1",
    });
    const manualSource = await upsertJobSource(db, {
      provider: "manual",
      externalId: "manual-role-1",
      url: "https://manual.example/role-1",
    });

    const job1 = await upsertJob(db, {
      sourceId: ycSource,
      scanId,
      externalKey: "role:yc:1",
      roleExternalId: "1",
      roleSource: "role",
      companyName: "Alpha",
      title: "Platform Engineer",
      summary: "Platform work",
      website: "https://alpha.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://alpha.com/jobs/platform",
      regions: ["Remote"],
      tags: ["DevOps"],
      industries: ["Infrastructure"],
      stage: "Growth",
      batch: "Winter 2025",
      extractedSkills: ["DevOps"],
      topCompany: true,
      isHiring: true,
      score: 90,
      scoreReasons: ["role_fit:20"],
      scoreBreakdown: { roleFit: 20, stackFit: 25, seniorityFit: 15, freshness: 10, companySignal: 20 },
      explanationBullets: ["Strong role fit"],
      riskBullets: ["Compensation not disclosed"],
      status: "saved",
    });

    const job2 = await upsertJob(db, {
      sourceId: ycSource,
      scanId,
      externalKey: "role:yc:2",
      roleExternalId: "2",
      roleSource: "role",
      companyName: "Beta",
      title: "Backend Engineer",
      summary: "Backend APIs",
      website: "https://beta.com",
      locations: "SF",
      remoteFlag: false,
      jobUrl: "https://beta.com/jobs/backend",
      regions: [],
      tags: ["API"],
      industries: ["B2B"],
      stage: "Early",
      batch: "Winter 2025",
      extractedSkills: ["API"],
      topCompany: false,
      isHiring: true,
      score: 72,
      scoreReasons: ["stack_fit:18"],
      scoreBreakdown: { roleFit: 16, stackFit: 18, seniorityFit: 12, freshness: 10, companySignal: 16 },
      explanationBullets: ["Good stack fit"],
      riskBullets: ["Not clearly remote"],
      status: "applied",
    });

    const job3 = await upsertJob(db, {
      sourceId: manualSource,
      scanId,
      externalKey: "role:manual:1",
      roleExternalId: "3",
      roleSource: "imported_role",
      companyName: "Gamma",
      title: "ML Engineer",
      summary: "ML platform",
      website: "https://gamma.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://gamma.com/jobs/ml",
      regions: ["Remote"],
      tags: ["AI"],
      industries: ["Artificial Intelligence"],
      stage: "Imported",
      batch: "Imported",
      extractedSkills: ["AI"],
      topCompany: false,
      isHiring: true,
      score: 58,
      scoreReasons: ["stack_fit:15"],
      scoreBreakdown: { roleFit: 14, stackFit: 15, seniorityFit: 10, freshness: 7, companySignal: 12 },
      explanationBullets: ["AI fit"],
      riskBullets: ["Older batch"],
      status: "replied",
    });

    await upsertApplication(db, job1, {
      status: "saved",
    });
    await upsertApplication(db, job2, {
      status: "applied",
      appliedAt: "2026-01-01T00:00:00.000Z",
      lastContactedAt: "2026-01-01T00:00:00.000Z",
    });
    const applicationId = await upsertApplication(db, job3, {
      status: "interview",
      appliedAt: "2026-01-05T00:00:00.000Z",
      responseReceived: true,
      responseType: "email",
      interviewStage: "technical",
      lastContactedAt: "2026-01-08T00:00:00.000Z",
    });

    expect(await getApplicationEvents(db, applicationId)).toHaveLength(1);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("stats command shows funnel and breakdowns", async () => {
    const output = await runStatsCommand();
    expect(output).toContain("Conversion Funnel");
    expect(output).toContain("saved: 3");
    expect(output).toContain("applied: 2");
    expect(output).toContain("replied: 1");
    expect(output).toContain("interview: 1");
    expect(output).toContain("85-100");
    expect(output).toContain("70-84");
    expect(output).toContain("manual");
    expect(output).toContain("yc");
  });

  test("application outcome fields are recorded in events metadata", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const application = db
      .prepare(`SELECT * FROM applications WHERE status = 'interview'`)
      .get() as { id: number; response_received: boolean; response_type: string; interview_stage: string };
    expect(application.response_received).toBe(true);
    expect(application.response_type).toBe("email");
    expect(application.interview_stage).toBe("technical");

    const events = await getApplicationEvents(db, application.id);
    const metadata = events[0].metadata_json as Record<string, unknown>;
    expect(metadata.responseReceived).toBe(true);
    expect(metadata.responseType).toBe("email");
    expect(metadata.interviewStage).toBe("technical");
  });
});
