import { google } from "googleapis";
import { getGoogleAuth } from "./google-docs";

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
