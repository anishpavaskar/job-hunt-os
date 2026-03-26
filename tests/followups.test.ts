import fs from "fs";
import os from "os";
import path from "path";
import { runFollowupAction, runFollowupsCommand } from "../src/commands/followups";
import { closeDb, initDb, resetDb } from "../src/db";
import {
  createFollowup,
  createScan,
  getApplicationByJobId,
  getApplicationEvents,
  getFollowupById,
  upsertApplication,
  upsertJob,
  upsertJobSource,
} from "../src/db/repositories";

describe("followups command", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-followups-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = createScan(db, "yc", new Date().toISOString());
    const sourceId = upsertJobSource(db, {
      provider: "yc",
      externalId: "follow-co",
      url: "https://yc.com/follow-co",
    });
    const jobId = upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "role:follow-co:devops",
      roleExternalId: "devops",
      roleSource: "role",
      companyName: "FollowCo",
      title: "DevOps Engineer",
      summary: "DevOps tooling",
      website: "https://followco.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://followco.com/jobs/devops",
      regions: ["Remote"],
      tags: ["DevOps"],
      industries: ["Infrastructure"],
      stage: "Early",
      batch: "Winter 2025",
      score: 68,
      scoreReasons: ["remote(15)"],
      extractedSkills: ["DevOps", "Infrastructure"],
      scoreBreakdown: { roleFit: 14, stackFit: 18, seniorityFit: 10, freshness: 10, companySignal: 16 },
      explanationBullets: ["Remote-friendly role"],
      riskBullets: ["Compensation not disclosed"],
      topCompany: false,
      isHiring: true,
    });
    const applicationId = upsertApplication(db, jobId, {
      status: "applied",
      appliedAt: "2026-03-20T00:00:00.000Z",
    });
    createFollowup(db, jobId, applicationId, "2026-03-27T00:00:00.000Z", "Check in");
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("lists pending followups in readable lines", () => {
    const lines = runFollowupsCommand();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("#");
    expect(lines[0]).toContain("FollowCo");
  });

  test("can mark followups done, skipped, or rescheduled", () => {
    const list = runFollowupsCommand();
    const id = parseInt(list[0].split("|")[0].replace("#", "").trim(), 10);

    expect(runFollowupAction(id, "reschedule", 4, "Push by a few days")).toContain("Rescheduled");
    let db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    let updated = getFollowupById(db, id);
    expect(updated?.status).toBe("pending");
    expect(updated?.note).toBe("Push by a few days");

    expect(runFollowupAction(id, "done", undefined, "Sent follow-up")).toContain("Marked");
    db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    updated = getFollowupById(db, id);
    expect(updated?.status).toBe("done");

    const job = getApplicationByJobId(db, updated!.job_id);
    const events = getApplicationEvents(db, job!.id);
    expect(events.some((event) => event.event_type === "followup_rescheduled")).toBe(true);
    expect(events.some((event) => event.event_type === "followup_done")).toBe(true);
  });
});
