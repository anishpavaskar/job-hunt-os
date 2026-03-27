import fs from "fs";
import os from "os";
import path from "path";
import { runImportCommand } from "../src/commands/import";
import { runReviewCommand } from "../src/commands/review";
import { closeDb, initDb, resetDb } from "../src/db";
import { listJobs } from "../src/db/repositories";

describe("manual import", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-import-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    initDb(path.join(tmpDir, "data", "job_hunt.db"));
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("imports JSON role jobs and normalizes them into SQLite", async () => {
    const filePath = path.join(tmpDir, "roles.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify([
        {
          company_name: "ImportCo",
          title: "Backend Engineer",
          description: "Build APIs with Go and Kubernetes",
          job_url: "https://importco.com/jobs/backend",
          location: "Remote",
          remote_flag: true,
          seniority_hint: "Senior",
          compensation_min: 180000,
          compensation_max: 220000,
          compensation_currency: "USD",
          compensation_period: "year",
          extracted_skills: ["Go", "Kubernetes"],
          tags: ["API", "DevOps"],
          industries: ["Infrastructure"],
          website: "https://importco.com",
          external_id: "importco-backend",
          is_hiring: true,
        },
      ]),
    );

    const result = await runImportCommand(filePath, "json");
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const jobs = await listJobs(db, { limit: 10 });
    expect(result.imported).toBe(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Backend Engineer");
    expect(jobs[0].job_url).toContain("/jobs/backend");
    expect(jobs[0].extracted_skills_json).toContain("Go");
  });

  test("validates CSV imports and ignores invalid rows", async () => {
    const filePath = path.join(tmpDir, "roles.csv");
    fs.writeFileSync(
      filePath,
      [
        "company_name,title,description,job_url,location,remote_flag,seniority_hint,website,external_id,is_hiring",
        'CsvCo,Platform Engineer,"Run platform systems",https://csvco.com/jobs/platform,Remote,true,Senior,https://csvco.com,csvco-platform,true',
        ',Missing Company,"Bad row",https://bad.example,Remote,true,Senior,https://bad.example,bad-row,true',
      ].join("\n"),
    );

    const result = await runImportCommand(filePath, "csv");
    expect(result.rawCount).toBe(2);
    expect(result.validCount).toBe(1);

    const lines = await runReviewCommand({ today: true, limit: "10" });
    expect(lines[0]).toContain("CsvCo");
    expect(lines[0]).toContain("Platform Engineer");
    expect(lines[0]).toContain("next action:");
  });
});
