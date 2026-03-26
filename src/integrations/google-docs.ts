import fs from "fs";
import path from "path";
import { google } from "googleapis";
import type { docs_v1 } from "googleapis";

// ─── Types ─────────────────────────────────────────────────────

export interface BriefingNewRole {
  rank: number;
  score: number;
  company: string;
  role: string;
  location: string;
  whyItFits: string;
  topRisk: string | null;
  applyLink: string;
  isProspect: boolean;
}

export interface BriefingFollowup {
  company: string;
  role: string | null;
  dueDate: string;
  lastAction: string;
  notes: string | null;
}

export interface BriefingDraft {
  company: string;
  role: string | null;
  draftVariant: string;
  createdDate: string;
}

export interface BriefingFunnel {
  totalTracked: number;
  appliedThisWeek: number;
  responsesReceived: number;
  interviewsScheduled: number;
  applyToResponseRate: string;
  responseToInterviewRate: string;
}

export interface BriefingData {
  date: string;
  newRoles: BriefingNewRole[];
  followups: BriefingFollowup[];
  drafts: BriefingDraft[];
  funnel: BriefingFunnel | null; // only on Mondays
}

// ─── Doc ID tracking ───────────────────────────────────────────

const DOC_TRACKING_FILE = "data/briefing-docs.json";

interface DocTracking {
  [date: string]: string; // date → Google doc ID
}

function loadDocTracking(cwd = process.cwd()): DocTracking {
  const filePath = path.join(cwd, DOC_TRACKING_FILE);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function saveDocTracking(tracking: DocTracking, cwd = process.cwd()): void {
  const filePath = path.join(cwd, DOC_TRACKING_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(tracking, null, 2));
}

export function getLatestBriefingDoc(cwd = process.cwd()): { date: string; docId: string; url: string } | null {
  const tracking = loadDocTracking(cwd);
  const dates = Object.keys(tracking).sort((left, right) => right.localeCompare(left));
  if (dates.length === 0) return null;

  const date = dates[0];
  const docId = tracking[date];
  return {
    date,
    docId,
    url: `https://docs.google.com/document/d/${docId}/edit`,
  };
}

// ─── Auth ──────────────────────────────────────────────────────

export function getGoogleAuth() {
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

// ─── Doc content builder ───────────────────────────────────────

function buildDocRequests(data: BriefingData): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];
  let idx = 1; // document body starts at index 1

  function insertText(text: string, bold = false, fontSize?: number): void {
    requests.push({
      insertText: { location: { index: idx }, text },
    });
    const endIdx = idx + text.length;
    if (bold || fontSize) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: idx, endIndex: endIdx },
          textStyle: {
            ...(bold ? { bold: true } : {}),
            ...(fontSize ? { fontSize: { magnitude: fontSize, unit: "PT" } } : {}),
          },
          fields: [bold ? "bold" : "", fontSize ? "fontSize" : ""].filter(Boolean).join(","),
        },
      });
    }
    idx = endIdx;
  }

  function insertNewline(): void {
    insertText("\n");
  }

  // Title
  insertText(`Daily Job Hunt Briefing — ${data.date}`, true, 18);
  insertNewline();
  insertNewline();

  // ─── New Roles Today ───
  insertText("New Roles Today", true, 14);
  insertNewline();

  if (data.newRoles.length === 0) {
    insertText("No new high-scoring roles in the last 24 hours.");
    insertNewline();
  } else {
    // Table header
    const header = "Rank | Score | Company | Role | Location | Why It Fits | Top Risk | Apply Link | Auto-Draft?";
    insertText(header, true);
    insertNewline();

    for (const role of data.newRoles) {
      const prospect = role.isProspect ? " [Prospect]" : "";
      const risk = role.topRisk ?? "—";
      const line = `${role.rank} | ${role.score}${prospect} | ${role.company} | ${role.role} | ${role.location} | ${role.whyItFits} | ${risk} | ${role.applyLink} | [ ]`;
      insertText(line);
      insertNewline();
    }
  }
  insertNewline();

  // ─── Pending Follow-ups ───
  insertText("Pending Follow-ups", true, 14);
  insertNewline();

  if (data.followups.length === 0) {
    insertText("No pending follow-ups.");
    insertNewline();
  } else {
    insertText("Company | Role | Due Date | Last Action | Notes", true);
    insertNewline();
    for (const f of data.followups) {
      const line = `${f.company} | ${f.role ?? "—"} | ${f.dueDate} | ${f.lastAction} | ${f.notes ?? "—"}`;
      insertText(line);
      insertNewline();
    }
  }
  insertNewline();

  // ─── Drafted But Unsent ───
  insertText("Drafted But Unsent", true, 14);
  insertNewline();

  if (data.drafts.length === 0) {
    insertText("No unsent drafts.");
    insertNewline();
  } else {
    insertText("Company | Role | Draft Version | Created Date", true);
    insertNewline();
    for (const d of data.drafts) {
      const line = `${d.company} | ${d.role ?? "—"} | ${d.draftVariant} | ${d.createdDate}`;
      insertText(line);
      insertNewline();
    }
  }
  insertNewline();

  // ─── Weekly Funnel (Mondays only) ───
  if (data.funnel) {
    insertText("Weekly Funnel", true, 14);
    insertNewline();
    insertText(`Total roles tracked: ${data.funnel.totalTracked}`);
    insertNewline();
    insertText(`Applied this week: ${data.funnel.appliedThisWeek}`);
    insertNewline();
    insertText(`Responses received: ${data.funnel.responsesReceived}`);
    insertNewline();
    insertText(`Interviews scheduled: ${data.funnel.interviewsScheduled}`);
    insertNewline();
    insertText(`Apply → Response rate: ${data.funnel.applyToResponseRate}`);
    insertNewline();
    insertText(`Response → Interview rate: ${data.funnel.responseToInterviewRate}`);
    insertNewline();
  }

  return requests;
}

// ─── Main API ──────────────────────────────────────────────────

export async function createOrUpdateBriefingDoc(
  data: BriefingData,
  cwd = process.cwd(),
): Promise<string> {
  const auth = getGoogleAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const tracking = loadDocTracking(cwd);
  const existingDocId = tracking[data.date];
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (existingDocId) {
    // Clear existing content and rewrite
    const doc = await docs.documents.get({ documentId: existingDocId });
    const endIndex = doc.data.body?.content?.at(-1)?.endIndex ?? 1;
    if (endIndex > 2) {
      await docs.documents.batchUpdate({
        documentId: existingDocId,
        requestBody: {
          requests: [
            { deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } },
          ],
        },
      });
    }

    const contentRequests = buildDocRequests(data);
    if (contentRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: existingDocId,
        requestBody: { requests: contentRequests },
      });
    }

    return `https://docs.google.com/document/d/${existingDocId}/edit`;
  }

  // Create new doc
  const createRes = await docs.documents.create({
    requestBody: {
      title: `Job Hunt Briefing — ${data.date}`,
    },
  });

  const docId = createRes.data.documentId!;

  // Move to folder if configured
  if (folderId) {
    try {
      await drive.files.update({
        fileId: docId,
        addParents: folderId,
        fields: "id, parents",
      });
    } catch (err) {
      console.warn(`[briefing] Could not move doc to folder ${folderId}: ${err}`);
    }
  }

  // Write content
  const contentRequests = buildDocRequests(data);
  if (contentRequests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: contentRequests },
    });
  }

  // Track the doc ID
  tracking[data.date] = docId;
  saveDocTracking(tracking, cwd);

  return `https://docs.google.com/document/d/${docId}/edit`;
}
