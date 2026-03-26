import { google } from "googleapis";
import { countVisibleNewRoles } from "../briefing/types";
import type { BriefingData } from "../briefing/types";
import { renderBriefingEmail } from "../templates/briefing-email";

function getGoogleAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env",
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeMimeHeader(value: string): string {
  if (!/[^\x00-\x7F]/.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export async function createGmailDraft(
  to: string,
  subject: string,
  body: string,
): Promise<string> {
  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const message = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: encodeBase64Url(message),
      },
    },
  });

  const draftId = response.data.id;
  if (!draftId) {
    throw new Error("Gmail draft creation returned no draft ID");
  }
  return draftId;
}

export async function sendGmailMessage(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<string> {
  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const message = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ].join("\r\n");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeBase64Url(message),
    },
  });

  const messageId = response.data.id;
  if (!messageId) {
    throw new Error("Gmail send returned no message ID");
  }
  return messageId;
}

async function resolveBriefingEmailRecipient(): Promise<string> {
  const configuredRecipient = process.env.MY_EMAIL ?? process.env.NOTIFY_EMAIL_TO;
  if (configuredRecipient) {
    return configuredRecipient;
  }

  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: "v1", auth });
  const response = await gmail.users.getProfile({ userId: "me" });
  const emailAddress = response.data.emailAddress;
  if (!emailAddress) {
    throw new Error("MY_EMAIL (or NOTIFY_EMAIL_TO) not set — and Gmail profile lookup returned no email");
  }
  return emailAddress;
}

export function buildBriefingEmailSubject(data: Pick<BriefingData, "date" | "newRoles">): string {
  const dateObj = new Date(data.date + "T12:00:00");
  const formatted = dateObj.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const visibleRoles = data.newRoles.filter((role) => role.kind !== "overflow");
  return `Job Hunt OS — ${formatted} — ${visibleRoles.length} tracked roles`;
}

export async function sendBriefingHtmlEmail(data: BriefingData): Promise<string> {
  const to = await resolveBriefingEmailRecipient();
  const subject = buildBriefingEmailSubject(data);
  const html = renderBriefingEmail(data);
  return sendGmailMessage(to, subject, html);
}
