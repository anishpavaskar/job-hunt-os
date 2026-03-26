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
import { sendDailyBriefingSMS, sendSMS } from "../src/integrations/twilio";
import { closeDb, resetDb } from "../src/db";

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

});
