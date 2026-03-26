import fs from "fs";
import os from "os";
import path from "path";
import { runReviewCommand } from "../src/commands/review";
import { closeDb, initDb, resetDb } from "../src/db";
import { createScan, upsertJob, upsertJobSource } from "../src/db/repositories";

describe("review command", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-review-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = createScan(db, "yc", new Date().toISOString());
    const sourceId = upsertJobSource(db, {
      provider: "yc",
      externalId: "review-co",
      url: "https://yc.com/review-co",
    });
    upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "role:review-co:platform",
      roleExternalId: "platform",
      roleSource: "role",
      companyName: "ReviewCo",
      title: "Platform Engineer",
      summary: "Remote AI infra",
      website: "https://reviewco.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://reviewco.com/jobs/platform",
      regions: ["Remote"],
      tags: ["AI"],
      industries: ["Artificial Intelligence"],
      stage: "Growth",
      batch: "Winter 2025",
      seniorityHint: "Senior",
      score: 75,
      scoreReasons: ["role_fit:18", "stack_fit:22"],
      extractedSkills: ["AI", "Infrastructure", "Kubernetes"],
      scoreBreakdown: { roleFit: 18, stackFit: 22, seniorityFit: 12, freshness: 9, companySignal: 14 },
      explanationBullets: ["Strong role fit for Platform Engineer", "Remote-friendly role"],
      riskBullets: ["Compensation not disclosed"],
      topCompany: true,
      isHiring: true,
    });
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("returns formatted review lines", () => {
    const lines = runReviewCommand({ remote: true, limit: "5" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("ReviewCo");
    expect(lines[0]).toContain("Platform Engineer");
    expect(lines[0]).toContain("[75]");
    expect(lines[0]).toContain("top reasons:");
    expect(lines[0]).toContain("top risk:");
    expect(lines[0]).toContain("role 18");
    expect(lines[0]).toContain("skills:");
    expect(lines[0]).toContain("next action:");
  });
});
