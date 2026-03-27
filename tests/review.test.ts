import fs from "fs";
import os from "os";
import path from "path";
import { runReviewCommand } from "../src/commands/review";
import { closeDb, initDb, resetDb } from "../src/db";
import { createScan, upsertJob, upsertJobSource } from "../src/db/repositories";

describe("review command", () => {
  let tmpDir: string;
  let previousCwd: string;
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-review-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "yc", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "yc",
      externalId: "review-co",
      url: "https://yc.com/review-co",
    });
    await upsertJob(db, {
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
    process.env = originalEnv;
    global.fetch = originalFetch;
    process.chdir(previousCwd);
    closeDb();
  });

  test("returns formatted review lines", async () => {
    const lines = await runReviewCommand({ remote: true, limit: "5" });
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

  test("uses Anthropic reranking when enabled", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "yc", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "yc",
      externalId: "review-alt",
      url: "https://yc.com/review-alt",
    });

    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "role:review-alt:manager",
      roleExternalId: "manager",
      roleSource: "role",
      companyName: "ManagerCo",
      title: "Engagement Manager",
      summary: "Manage customer engagements",
      website: "https://managerco.com",
      locations: "San Francisco, CA",
      remoteFlag: false,
      jobUrl: "https://managerco.com/jobs/engagement",
      regions: ["United States"],
      tags: ["AI"],
      industries: ["Artificial Intelligence"],
      stage: "Growth",
      batch: "Winter 2025",
      score: 88,
      scoreReasons: ["role_fit:22"],
      extractedSkills: ["AI", "Analytics"],
      scoreBreakdown: { roleFit: 22, stackFit: 14, seniorityFit: 12, freshness: 8, companySignal: 18 },
      explanationBullets: ["High company signal"],
      riskBullets: ["Customer-facing"],
      topCompany: true,
      isHiring: true,
    });

    process.env = {
      ...originalEnv,
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_RERANK_ENABLED: "1",
      ANTHROPIC_RERANK_IN_TESTS: "1",
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [
                { id: 1, ai_score: 93, reason: "Strong IC platform fit" },
                { id: 2, ai_score: 25, reason: "Management-heavy mismatch" },
              ],
            }),
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const lines = await runReviewCommand({ limit: "2" });
    expect(lines[0]).toContain("ReviewCo");
    expect(lines[1]).toContain("ManagerCo");
  });

  test("caps surfaced review results at ten roles per company", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "yc", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "yc",
      externalId: "review-many",
      url: "https://yc.com/review-many",
    });

    for (let index = 1; index <= 11; index += 1) {
      await upsertJob(db, {
        sourceId,
        scanId,
        externalKey: `role:repeat-review:${index}`,
        roleExternalId: `repeat-review:${index}`,
        roleSource: "role",
        companyName: "RepeatReviewCo",
        title: `Platform Engineer ${index}`,
        summary: "Remote infra role",
        website: "https://repeatreviewco.com",
        locations: "Remote",
        remoteFlag: true,
        jobUrl: `https://repeatreviewco.com/jobs/${index}`,
        regions: ["Remote"],
        tags: ["Infrastructure"],
        industries: ["Artificial Intelligence"],
        stage: "Growth",
        batch: "Winter 2025",
        seniorityHint: "Senior",
        score: 90 - index,
        scoreReasons: ["role_fit:18", "stack_fit:22"],
        extractedSkills: ["AI", "Infrastructure", "Kubernetes"],
        scoreBreakdown: { roleFit: 18, stackFit: 22, seniorityFit: 12, freshness: 9, companySignal: 14 },
        explanationBullets: ["Strong role fit for Platform Engineer"],
        riskBullets: ["Compensation not disclosed"],
        topCompany: true,
        isHiring: true,
      });
    }

    const lines = await runReviewCommand({ limit: "20" });
    const repeatLines = lines.filter((line) => line.includes("RepeatReviewCo"));

    expect(repeatLines).toHaveLength(10);
  });
});
