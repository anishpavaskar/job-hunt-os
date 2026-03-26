jest.mock("twilio", () => {
  const create = jest.fn();
  const factory = jest.fn(() => ({
    messages: {
      create,
    },
  }));
  return {
    __esModule: true,
    default: factory,
    _factory: factory,
    _create: create,
  };
});

import fs from "fs";
import os from "os";
import path from "path";
import {
  createScan,
  upsertJob,
  upsertJobSource,
} from "../src/db/repositories";
import { closeDb, initDb, resetDb } from "../src/db";
import { runNotifyCommand } from "../src/commands/notify";
import { sendDailyBriefingSMS, sendSMS } from "../src/integrations/twilio";

const twilioMock = jest.requireMock("twilio") as {
  _factory: jest.Mock;
  _create: jest.Mock;
};

describe("Twilio notifications", () => {
  const previousEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...previousEnv,
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "secret",
      TWILIO_FROM_NUMBER: "+15550001111",
      MY_PHONE_NUMBER: "+15550002222",
    };
  });

  afterEach(() => {
    process.env = previousEnv;
    closeDb();
    resetDb();
  });

  test("sendSMS sends a message via Twilio", async () => {
    await sendSMS("hello world");

    expect(twilioMock._factory).toHaveBeenCalledWith("AC123", "secret");
    expect(twilioMock._create).toHaveBeenCalledWith({
      body: "hello world",
      from: "+15550001111",
      to: "+15550002222",
    });
  });

  test("sendDailyBriefingSMS formats the summary message", async () => {
    await sendDailyBriefingSMS("https://docs.google.com/document/d/123/edit", 14, 92);

    expect(twilioMock._create).toHaveBeenCalledWith({
      body: "☀️ 14 new roles today. Top score: 92. Doc: https://docs.google.com/document/d/123/edit",
      from: "+15550001111",
      to: "+15550002222",
    });
  });

  test("notify sends an SMS for the most recent briefing", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-notify-"));
    const previousCwd = process.cwd();
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data", "briefing-docs.json"),
      JSON.stringify({ "2026-03-26": "doc123" }, null, 2),
    );

    resetDb();
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const sourceId = upsertJobSource(db, {
      provider: "manual",
      externalId: "anthropic",
      url: "https://example.com",
    });
    const scanId = createScan(db, "manual", new Date().toISOString());
    upsertJob(db, {
      sourceId,
      scanId,
      externalKey: "manual:anthropic:1",
      roleExternalId: "1",
      roleSource: "imported_role",
      companyName: "Anthropic",
      title: "SWE II",
      summary: "Build AI systems",
      website: "https://anthropic.com",
      locations: "San Francisco, CA",
      remoteFlag: true,
      jobUrl: "https://example.com/jobs/1",
      regions: ["Remote"],
      tags: ["AI"],
      industries: ["AI"],
      stage: "Growth",
      batch: "Imported",
      extractedSkills: ["Python"],
      topCompany: false,
      isHiring: true,
      score: 92,
      scoreReasons: ["stack_fit:24"],
      scoreBreakdown: { roleFit: 20, stackFit: 24, seniorityFit: 14, freshness: 10, companySignal: 16 },
      explanationBullets: ["Great fit"],
      riskBullets: [],
    });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    const result = await runNotifyCommand();

    expect(result).toContain("SMS sent");
    expect(twilioMock._create).toHaveBeenCalledWith({
      body: "☀️ 1 new roles today. Top score: 92. Doc: https://docs.google.com/document/d/doc123/edit",
      from: "+15550001111",
      to: "+15550002222",
    });

    process.chdir(previousCwd);
  });
});
