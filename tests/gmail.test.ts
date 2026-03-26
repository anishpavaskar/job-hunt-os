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
      OAuth2,
      setCredentials,
      gmail,
      draftsCreate,
    },
  };
});

import fs from "fs";
import os from "os";
import path from "path";
import { createGmailDraft } from "../src/integrations/gmail";
import { runDraftCommand } from "../src/commands/draft";
import { runListDraftsCommand, runShowDraftCommand } from "../src/commands/drafts";
import { closeDb, initDb, resetDb } from "../src/db";
import { createScan, upsertJob, upsertJobSource } from "../src/db/repositories";

const googleapisMock = jest.requireMock("googleapis") as {
  __mock: {
    OAuth2: jest.Mock;
    setCredentials: jest.Mock;
    gmail: jest.Mock;
    draftsCreate: jest.Mock;
  };
};

function decodeRaw(raw: string): string {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf-8");
}

describe("Gmail draft integration", () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-gmail-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = createScan(db, "manual", new Date().toISOString());
    const sourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "gmail-source",
      url: "https://example.com/jobs/platform",
    });
    upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "manual:gmail-source",
      roleExternalId: "gmail-source",
      roleSource: "imported_role",
      companyName: "Anthropic",
      title: "Software Engineer",
      summary: "Build reliable AI infrastructure and backend systems.",
      website: "https://anthropic.com",
      locations: "San Francisco, CA",
      remoteFlag: true,
      jobUrl: "https://example.com/jobs/platform",
      regions: ["San Francisco"],
      tags: ["AI", "Infrastructure"],
      industries: ["AI"],
      stage: "Growth",
      batch: "Imported",
      extractedSkills: ["Python", "Kubernetes", "AWS"],
      topCompany: true,
      isHiring: true,
      score: 92,
      scoreReasons: ["stack_fit:25", "role_fit:21"],
      scoreBreakdown: { roleFit: 21, stackFit: 25, seniorityFit: 14, freshness: 10, companySignal: 22, prospect_listed: true },
      explanationBullets: ["Strong overlap with backend and infrastructure work"],
      riskBullets: ["Compensation not disclosed"],
      status: "new",
    });
  });

  afterEach(() => {
    process.chdir(previousCwd);
    process.env = previousEnv;
    closeDb();
    resetDb();
  });

  test("createGmailDraft creates a Gmail draft and returns the Gmail draft ID", async () => {
    googleapisMock.__mock.draftsCreate.mockResolvedValue({ data: { id: "draft-123" } });

    const draftId = await createGmailDraft("", "Re: Software Engineer — Anthropic", "Hi Anthropic team");

    expect(draftId).toBe("draft-123");
    expect(googleapisMock.__mock.OAuth2).toHaveBeenCalledWith("client-id", "client-secret");
    expect(googleapisMock.__mock.setCredentials).toHaveBeenCalledWith({ refresh_token: "refresh-token" });

    const call = googleapisMock.__mock.draftsCreate.mock.calls[0][0];
    const decoded = decodeRaw(call.requestBody.message.raw);
    expect(decoded).toContain("To: ");
    expect(decoded).toContain("Subject: Re: Software Engineer — Anthropic");
    expect(decoded).toContain("Hi Anthropic team");
  });

  test("draft command uses Anthropic output and persists gmail draft metadata", async () => {
    googleapisMock.__mock.draftsCreate.mockResolvedValue({ data: { id: "gmail-draft-9" } });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Hi Anthropic team,\nI’d love to contribute to your backend infrastructure work.\n\nAnish" }],
      }),
    });

    const draft = await runDraftCommand("Software Engineer", {
      save: true,
      sendToGmail: true,
      variant: "ai-v1",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(draft).toContain("I’d love to contribute");

    const lines = runListDraftsCommand("ai-v1");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("gmail=gmail-draft-9");

    const id = parseInt(lines[0].split("|")[0].replace("#", "").trim(), 10);
    const detail = runShowDraftCommand(id);
    expect(detail).toContain("gmail=gmail-draft-9");
    expect(detail).toContain("Anthropic");
  });
});
