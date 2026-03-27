import fs from "fs";
import os from "os";
import path from "path";
import { closeDb, initDb, resetDb } from "../src/db";
import {
  completeScan,
  createFollowup,
  createScan,
  getApplicationEvents,
  getJobByQuery,
  listPendingFollowups,
  listJobs,
  upsertApplication,
  upsertJob,
  upsertJobSource,
} from "../src/db/repositories";

describe("SQLite persistence", () => {
  let dbPath: string;

  beforeEach(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-db-"));
    dbPath = path.join(tempDir, "job_hunt.db");
    resetDb();
  });

  afterEach(() => {
    closeDb();
  });

  test("initializes schema idempotently", () => {
    const db = initDb(dbPath);
    expect(() => initDb(dbPath)).not.toThrow();
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobs'`).get();
    expect(row).toBeTruthy();
  });

  test("upserts repeated jobs without duplication", async () => {
    const db = initDb(dbPath);
    const scanId = await createScan(db, "yc", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "yc",
      externalId: "acme",
      url: "https://yc.com/acme",
    });

    const input = {
      sourceId,
      scanId,
      externalKey: "company:acme",
      roleSource: "company_fallback",
      companyName: "Acme",
      summary: "Infra tooling",
      website: "https://acme.com",
      locations: "San Francisco, CA",
      remoteFlag: true,
      jobUrl: "https://yc.com/acme",
      regions: ["Remote"],
      tags: ["DevOps"],
      industries: ["Infrastructure"],
      stage: "Growth",
      batch: "Winter 2025",
      teamSize: 25,
      topCompany: true,
      isHiring: true,
      score: 80,
      scoreReasons: ["remote(15)"],
      extractedSkills: ["DevOps", "Infrastructure"],
      scoreBreakdown: {
        roleFit: 10,
        stackFit: 20,
        seniorityFit: 10,
        freshness: 10,
        companySignal: 15,
      },
      explanationBullets: ["Strong stack fit"],
      riskBullets: ["Compensation not disclosed"],
      status: "new" as const,
    };

    await upsertJob(db, input);
    await upsertJob(db, { ...input, score: 82 });
    await completeScan(db, scanId, 1, 1, new Date().toISOString());

    const rows = await listJobs(db, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(82);
  });

  test("creates applications and pending followups", async () => {
    const db = initDb(dbPath);
    const scanId = await createScan(db, "yc", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "yc",
      externalId: "apply-co",
      url: "https://yc.com/apply-co",
    });
    const jobId = await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "company:apply-co",
      roleSource: "company_fallback",
      companyName: "ApplyCo",
      summary: "AI ops",
      website: "https://applyco.com",
      locations: "",
      remoteFlag: false,
      jobUrl: "https://yc.com/apply-co",
      regions: ["United States of America"],
      tags: ["AI"],
      industries: ["Artificial Intelligence"],
      stage: "Early",
      batch: "Winter 2025",
      score: 70,
      scoreReasons: ["skill:AI(6)"],
      extractedSkills: ["AI"],
      scoreBreakdown: {
        roleFit: 8,
        stackFit: 20,
        seniorityFit: 8,
        freshness: 10,
        companySignal: 12,
      },
      explanationBullets: ["Strong stack fit"],
      riskBullets: ["Compensation not disclosed"],
      topCompany: false,
      isHiring: true,
    });

    const applicationId = await upsertApplication(db, jobId, {
      status: "applied",
      appliedAt: new Date().toISOString(),
      note: "Reached out to hiring manager",
      appliedUrl: "https://applyco.com/jobs/apply",
      resumeVersion: "resume-v2",
      outreachDraftVersion: "draft-v1",
    });
    await createFollowup(db, jobId, applicationId, "2026-04-01T00:00:00.000Z", "Send follow-up");

    const followups = await listPendingFollowups(db);
    expect(followups).toHaveLength(1);
    expect(followups[0].company_name).toBe("ApplyCo");
    const events = await getApplicationEvents(db, applicationId);
    expect(events).toHaveLength(2);
    expect(events[0].next_status).toBe("applied");
    expect(events[1].event_type).toBe("followup_created");
  });

  test("stores multiple roles for one company source", async () => {
    const db = initDb(dbPath);
    const scanId = await createScan(db, "yc", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "yc",
      externalId: "multi-role",
      url: "https://yc.com/multi-role",
    });

    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "role:multi-role:backend",
      roleExternalId: "backend",
      roleSource: "role",
      companyName: "MultiRole",
      title: "Backend Engineer",
      summary: "Build APIs",
      website: "https://multirole.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://multirole.com/jobs/backend",
      regions: ["Remote"],
      tags: ["API"],
      industries: ["B2B"],
      stage: "Early",
      batch: "Winter 2025",
      score: 70,
      scoreReasons: ["remote(15)"],
      extractedSkills: ["API"],
      scoreBreakdown: { roleFit: 12, stackFit: 18, seniorityFit: 10, freshness: 10, companySignal: 10 },
      explanationBullets: ["Strong role fit"],
      riskBullets: ["Compensation not disclosed"],
      topCompany: false,
      isHiring: true,
    });
    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "role:multi-role:infra",
      roleExternalId: "infra",
      roleSource: "role",
      companyName: "MultiRole",
      title: "Infra Engineer",
      summary: "Run infra",
      website: "https://multirole.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://multirole.com/jobs/infra",
      regions: ["Remote"],
      tags: ["DevOps"],
      industries: ["Infrastructure"],
      stage: "Early",
      batch: "Winter 2025",
      score: 80,
      scoreReasons: ["remote(15)"],
      extractedSkills: ["DevOps", "Infrastructure"],
      scoreBreakdown: { roleFit: 14, stackFit: 24, seniorityFit: 10, freshness: 10, companySignal: 12 },
      explanationBullets: ["Strong role fit", "Remote-friendly role"],
      riskBullets: ["Compensation not disclosed"],
      topCompany: false,
      isHiring: true,
    });

    const rows = await listJobs(db, { limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe("Infra Engineer");
  });

  test("prioritizes real role rows over fallback rows and picks the highest-scoring role match", async () => {
    const db = initDb(dbPath);
    const scanId = await createScan(db, "yc", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "yc",
      externalId: "ambiguity-co",
      url: "https://yc.com/ambiguity-co",
    });

    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "company:ambiguity-co",
      roleSource: "company_fallback",
      companyName: "AmbiguityCo",
      summary: "General hiring company",
      website: "https://ambiguity.co",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://ambiguity.co",
      regions: ["Remote"],
      tags: ["Software"],
      industries: ["Software"],
      stage: "Growth",
      batch: "Winter 2025",
      score: 95,
      scoreReasons: ["company_signal:20"],
      extractedSkills: ["Software"],
      scoreBreakdown: { roleFit: 5, stackFit: 10, seniorityFit: 10, freshness: 10, companySignal: 20 },
      explanationBullets: ["Fallback company row"],
      riskBullets: [],
      topCompany: true,
      isHiring: true,
    });
    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "greenhouse:ambiguity-co:1",
      roleExternalId: "1",
      roleSource: "greenhouse",
      companyName: "AmbiguityCo",
      title: "Software Engineer",
      summary: "Role one",
      website: "https://ambiguity.co",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://ambiguity.co/jobs/1",
      regions: ["Remote"],
      tags: ["Software"],
      industries: ["Software"],
      stage: "External",
      batch: "External",
      score: 78,
      scoreReasons: ["role_fit:18"],
      extractedSkills: ["TypeScript"],
      scoreBreakdown: { roleFit: 18, stackFit: 18, seniorityFit: 12, freshness: 10, companySignal: 20 },
      explanationBullets: ["Good role"],
      riskBullets: [],
      topCompany: false,
      isHiring: true,
    });
    await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "lever:ambiguity-co:2",
      roleExternalId: "2",
      roleSource: "lever",
      companyName: "AmbiguityCo",
      title: "Software Engineer",
      summary: "Role two",
      website: "https://ambiguity.co",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://ambiguity.co/jobs/2",
      regions: ["Remote"],
      tags: ["Software"],
      industries: ["Software"],
      stage: "External",
      batch: "External",
      score: 88,
      scoreReasons: ["role_fit:22"],
      extractedSkills: ["Go"],
      scoreBreakdown: { roleFit: 22, stackFit: 22, seniorityFit: 14, freshness: 10, companySignal: 20 },
      explanationBullets: ["Best matching role"],
      riskBullets: [],
      topCompany: false,
      isHiring: true,
    });

    const rows = await listJobs(db, { limit: 10 });
    expect(rows[0].external_key).toBe("lever:ambiguity-co:2");
    expect(rows[1].external_key).toBe("greenhouse:ambiguity-co:1");
    expect(rows[2].external_key).toBe("company:ambiguity-co");

    const resolved = await getJobByQuery(db, "AmbiguityCo");
    expect(resolved?.external_key).toBe("lever:ambiguity-co:2");
  });
});
