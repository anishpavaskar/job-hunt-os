jest.mock("googleapis", () => {
  const setCredentials = jest.fn();
  const OAuth2 = jest.fn(() => ({ setCredentials }));
  const draftsCreate = jest.fn();
  const gmail = jest.fn(() => ({
    users: {
      drafts: {
        create: draftsCreate,
      },
    },
  }));

  return {
    google: {
      auth: { OAuth2 },
      gmail,
    },
    __mock: {
      draftsCreate,
    },
  };
});

import fs from "fs";
import os from "os";
import path from "path";
import { runAutoDraftCommand } from "../src/commands/auto-draft";
import { closeDb, initDb, resetDb } from "../src/db";
import {
  createScan,
  getApplicationByJobId,
  getApplicationEvents,
  getDraftById,
  listAutoDraftJobs,
  listDrafts,
  upsertDraft,
  upsertJob,
  upsertJobSource,
} from "../src/db/repositories";

const googleapisMock = jest.requireMock("googleapis") as {
  __mock: {
    draftsCreate: jest.Mock;
  };
};

describe("auto-draft batch flow", () => {
  const previousEnv = process.env;
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...previousEnv,
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
      ANTHROPIC_API_KEY: "anthropic-key",
    };

    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-auto-draft-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
  });

  afterEach(() => {
    process.chdir(previousCwd);
    process.env = previousEnv;
    closeDb();
    resetDb();
  });

  test("auto-draft generates drafts, creates Gmail drafts, and marks applications as drafted", async () => {
    googleapisMock.__mock.draftsCreate.mockResolvedValue({ data: { id: "gmail-1" } });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Hi team,\nI’m excited about this role.\n\nAnish" }],
      }),
    });

    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "manual", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "manual",
      externalId: "seed",
      url: "https://example.com/jobs",
    });

    const eligibleJobId = await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "manual:eligible",
      roleExternalId: "eligible",
      roleSource: "imported_role",
      companyName: "Scale AI",
      title: "Backend Engineer",
      summary: "Own backend infrastructure and APIs.",
      website: "https://scale.com",
      locations: "San Francisco, CA",
      remoteFlag: true,
      jobUrl: "https://example.com/jobs/eligible",
      regions: ["San Francisco"],
      tags: ["AI", "Infrastructure"],
      industries: ["AI"],
      stage: "Growth",
      batch: "Imported",
      extractedSkills: ["Go", "Kubernetes"],
      topCompany: true,
      isHiring: true,
      score: 88,
      scoreReasons: ["role_fit:22"],
      scoreBreakdown: { roleFit: 22, stackFit: 24, seniorityFit: 13, freshness: 10, companySignal: 19 },
      explanationBullets: ["Matches your backend target roles"],
      riskBullets: ["Compensation not disclosed"],
      status: "new",
    });

    const lowScoreJobId = await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "manual:lowscore",
      roleExternalId: "lowscore",
      roleSource: "imported_role",
      companyName: "LowScoreCo",
      title: "Engineer",
      summary: "General engineering role.",
      website: "https://low.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://example.com/jobs/low",
      regions: ["Remote"],
      tags: ["Software"],
      industries: ["Software"],
      stage: "Growth",
      batch: "Imported",
      extractedSkills: ["JavaScript"],
      topCompany: false,
      isHiring: true,
      score: 72,
      scoreReasons: ["role_fit:12"],
      scoreBreakdown: { roleFit: 12, stackFit: 18, seniorityFit: 12, freshness: 10, companySignal: 20 },
      explanationBullets: ["Okay fit"],
      riskBullets: [],
      status: "new",
    });

    const existingDraftJobId = await upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "manual:existing",
      roleExternalId: "existing",
      roleSource: "imported_role",
      companyName: "ExistingDraftCo",
      title: "Platform Engineer",
      summary: "Platform role.",
      website: "https://existing.com",
      locations: "Remote",
      remoteFlag: true,
      jobUrl: "https://example.com/jobs/existing",
      regions: ["Remote"],
      tags: ["Infrastructure"],
      industries: ["Infrastructure"],
      stage: "Growth",
      batch: "Imported",
      extractedSkills: ["Terraform"],
      topCompany: false,
      isHiring: true,
      score: 90,
      scoreReasons: ["role_fit:21"],
      scoreBreakdown: { roleFit: 21, stackFit: 21, seniorityFit: 14, freshness: 10, companySignal: 24 },
      explanationBullets: ["Already in progress"],
      riskBullets: [],
      status: "new",
    });
    await upsertDraft(db, {
      jobId: existingDraftJobId,
      variant: "default",
      generatedContent: "Existing draft",
    });

    expect((await listAutoDraftJobs(db, 80)).map((job) => job.id)).toEqual([eligibleJobId]);

    const result = await runAutoDraftCommand({
      minScore: 80,
      sendToGmail: true,
      variant: "auto-v1",
      fetchImpl,
    });

    expect(result).toEqual({ generated: 1, gmailCreated: 1, skipped: 0 });

    const application = await getApplicationByJobId(db, eligibleJobId);
    expect(application?.status).toBe("drafted");
    expect(application?.outreach_draft_version).toBe("auto-v1");

    const drafts = await listDrafts(db, "Scale AI");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].gmail_draft_id).toBe("gmail-1");

    const detail = await getDraftById(db, drafts[0].id);
    expect(detail?.generated_content).toContain("I’m excited");

    const events = await getApplicationEvents(db, application!.id);
    expect(events.some((event) => event.event_type === "status_changed" && event.next_status === "drafted")).toBe(true);
    expect(events.some((event) => event.event_type === "draft_saved")).toBe(true);

    expect(await getApplicationByJobId(db, lowScoreJobId)).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
