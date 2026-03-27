import fs from "fs";
import os from "os";
import path from "path";
import { runDraftCommand } from "../src/commands/draft";
import { runListDraftsCommand, runShowDraftCommand } from "../src/commands/drafts";
import { closeDb, initDb, resetDb } from "../src/db";
import { createScan, getApplicationByJobId, getApplicationEvents, getJobByQuery, upsertApplication, upsertJob, upsertJobSource } from "../src/db/repositories";

describe("draft persistence", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-drafts-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "manual", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "manual",
      externalId: "draft-source",
      url: "https://example.com/jobs/platform",
    });
    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "manual:draft-source",
      roleExternalId: "draft-source",
      roleSource: "imported_role",
      companyName: "DraftStore",
      title: "Platform Engineer",
      summary: "Build platform systems",
      website: "https://draftstore.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://example.com/jobs/platform",
      regions: ["Remote"],
      tags: ["DevOps"],
      industries: ["Infrastructure"],
      stage: "Imported",
      batch: "Imported",
      extractedSkills: ["DevOps", "Kubernetes"],
      topCompany: false,
      isHiring: true,
      score: 77,
      scoreReasons: ["stack_fit:22"],
      scoreBreakdown: { roleFit: 18, stackFit: 22, seniorityFit: 12, freshness: 10, companySignal: 15 },
      explanationBullets: ["Strong role fit"],
      riskBullets: ["Compensation not disclosed"],
    });
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("draft command can save a generated variant to SQLite", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const job = await getJobByQuery(db, "Platform Engineer");
    await upsertApplication(db, job!.id, {
      status: "drafted",
      note: "Need to polish draft",
    });

    await runDraftCommand("Platform Engineer", { save: true, variant: "v1" });
    const lines = await runListDraftsCommand();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("variant=v1");
    expect(lines[0]).toContain("application=drafted");
    const id = parseInt(lines[0].split("|")[0].replace("#", "").trim(), 10);
    const detail = await runShowDraftCommand(id);
    expect(detail).toContain("DraftStore");
    expect(detail).toContain("Platform Engineer");
    expect(detail).toContain("application=drafted");

    const application = await getApplicationByJobId(db, job!.id);
    const events = await getApplicationEvents(db, application!.id);
    expect(events.some((event) => event.event_type === "draft_saved")).toBe(true);
  });

  test("edited content is persisted when provided", async () => {
    const editedPath = path.join(tmpDir, "edited.txt");
    fs.writeFileSync(editedPath, "Edited draft content");
    await runDraftCommand("Platform Engineer", { save: true, variant: "v2", editedFile: editedPath });
    const lines = await runListDraftsCommand("v2");
    const id = parseInt(lines[0].split("|")[0].replace("#", "").trim(), 10);
    expect(await runShowDraftCommand(id)).toContain("Edited draft content");
  });
});
