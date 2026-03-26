import fs from "fs";
import os from "os";
import path from "path";
import { runApplyCommand } from "../src/commands/apply";
import { generateDraft } from "../src/commands/draft";
import { closeDb, initDb, resetDb } from "../src/db";
import {
  createScan,
  getApplicationByJobId,
  getApplicationEvents,
  getJobByQuery,
  listPendingFollowups,
  upsertJob,
  upsertJobSource,
} from "../src/db/repositories";

describe("apply and draft commands", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-apply-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = createScan(db, "yc", new Date().toISOString());
    const sourceId = upsertJobSource(db, {
      provider: "yc",
      externalId: "draft-co",
      url: "https://yc.com/draft-co",
    });
    upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "role:draft-co:ml-platform",
      roleExternalId: "ml-platform",
      roleSource: "role",
      companyName: "DraftCo",
      title: "ML Platform Engineer",
      summary: "AI platform for healthcare",
      website: "https://draftco.com",
      locations: "San Francisco, CA",
      remoteFlag: true,
      jobUrl: "https://draftco.com/jobs/ml-platform",
      regions: ["Remote"],
      tags: ["AI", "Healthcare"],
      industries: ["Healthcare"],
      stage: "Growth",
      batch: "Winter 2025",
      teamSize: 30,
      score: 78,
      scoreReasons: ["healthcare(12)"],
      extractedSkills: ["AI", "Machine Learning", "Kubernetes"],
      scoreBreakdown: { roleFit: 18, stackFit: 20, seniorityFit: 12, freshness: 10, companySignal: 18 },
      explanationBullets: ["Strong role fit for ML Platform Engineer"],
      riskBullets: ["Compensation not disclosed"],
      topCompany: false,
      isHiring: true,
    });
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("generateDraft builds outreach from DB job", () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const job = getJobByQuery(db, "ML Platform Engineer");
    expect(job).toBeDefined();
    const draft = generateDraft(job!);
    expect(draft).toContain("Hi DraftCo team");
    expect(draft).toContain("AI platform for healthcare");
    expect(draft).toContain("ML Platform Engineer");
  });

  test("apply schedules a follow-up", async () => {
    const result = await runApplyCommand("ML Platform Engineer", 5, {
      notes: "Applied via email",
      status: "applied",
      appliedUrl: "https://draftco.com/jobs/ml-platform/apply",
      resumeVersion: "resume-v3",
      outreachDraftVersion: "draft-v2",
    });
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const followups = listPendingFollowups(db);
    expect(result.companyName).toContain("DraftCo");
    expect(followups).toHaveLength(1);
    const job = getJobByQuery(db, "ML Platform Engineer");
    const application = getApplicationByJobId(db, job!.id);
    expect(application?.status).toBe("applied");
    expect(application?.applied_url).toContain("/apply");
    expect(application?.resume_version).toBe("resume-v3");
    expect(application?.outreach_draft_version).toBe("draft-v2");
    expect(getApplicationEvents(db, application!.id)).toHaveLength(2);
  });

  test("non-apply statuses do not create a follow-up date", async () => {
    const result = await runApplyCommand("ML Platform Engineer", 5, {
      notes: "Saved for later",
      status: "saved",
    });

    expect(result.dueAt).toBeNull();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    expect(listPendingFollowups(db)).toHaveLength(0);
  });
});
