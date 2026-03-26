import { google } from "googleapis";
import { getGoogleAuth } from "./google-docs";
import type { BriefingData } from "./google-docs";

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
    `Subject: ${subject}`,
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

export function getNotifyEmailRecipient(): string | null {
  return process.env.NOTIFY_EMAIL_TO ?? null;
}

export function buildBriefingNotificationSubject(data: Pick<BriefingData, "date">): string {
  return `Daily Job Hunt Briefing — ${data.date}`;
}

export function buildBriefingNotificationBody(
  data: BriefingData,
  docUrl: string,
): string {
  const topRoles = data.newRoles
    .slice(0, 3)
    .map((role, index) => `${index + 1}. ${role.company} — ${role.role} [${role.score}]`)
    .join("\n");

  const lines = [
    `Daily job hunt briefing for ${data.date}`,
    "",
    `New roles: ${data.newRoles.length}`,
    `Top score: ${data.newRoles[0]?.score ?? 0}`,
    `Pending follow-ups: ${data.followups.length}`,
    `Unsent drafts: ${data.drafts.length}`,
    `Doc: ${docUrl}`,
  ];

  if (topRoles) {
    lines.push("", "Top roles:", topRoles);
  }

  return lines.join("\n");
}

export async function createBriefingNotificationDraft(
  data: BriefingData,
  docUrl: string,
  to = getNotifyEmailRecipient(),
): Promise<string> {
  if (!to) {
    throw new Error("NOTIFY_EMAIL_TO not set");
  }

  return createGmailDraft(
    to,
    buildBriefingNotificationSubject(data),
    buildBriefingNotificationBody(data, docUrl),
  );
}
