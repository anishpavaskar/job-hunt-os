# PROMPT E: INTEGRATION WIRING CHECK

## Gmail

### 1. Code paths

- `src/integrations/gmail.ts`
- `src/commands/briefing.ts`
- `src/commands/notify.ts`
- `src/commands/draft.ts`

### 2. Required env vars

Reference: `src/integrations/gmail.ts:6-19`, `src/integrations/gmail.ts:100-114`

```ts
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
```

```ts
const configuredRecipient = process.env.MY_EMAIL ?? process.env.NOTIFY_EMAIL_TO;
```

Runtime env requirements:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- one of:
  - `MY_EMAIL`
  - `NOTIFY_EMAIL_TO`
  - or a Gmail profile lookup fallback

### 3. Imported and called?

Yes.

References:

- briefing: `src/commands/briefing.ts:21`, `src/commands/briefing.ts:477`
- notify: `src/commands/notify.ts:4`, `src/commands/notify.ts:15`
- draft Gmail draft creation: `src/commands/draft.ts:11`, `src/commands/draft.ts:189`

### 4. Missing-env behavior

Low-level auth path:

Reference: `src/integrations/gmail.ts:11-15`

```ts
if (!clientId || !clientSecret || !refreshToken) {
  throw new Error(
    "Missing Google credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env",
  );
}
```

Recipient resolution path:

Reference: `src/integrations/gmail.ts:100-114`

```ts
const configuredRecipient = process.env.MY_EMAIL ?? process.env.NOTIFY_EMAIL_TO;
if (configuredRecipient) {
  return configuredRecipient;
}

...

if (!emailAddress) {
  throw new Error("MY_EMAIL (or NOTIFY_EMAIL_TO) not set — and Gmail profile lookup returned no email");
}
```

Briefing command catch path:

Reference: `src/commands/briefing.ts:476-493`

```ts
try {
  const messageId = await sendBriefingHtmlEmail(data);
  console.log(`\n[briefing] Email sent (message ID: ${messageId})`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Missing Google credentials")) {
    console.error(`[briefing] ${msg}`);
    console.error(
      "[briefing] Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in .env",
    );
  } else if (msg.includes("MY_EMAIL")) {
    console.error(`[briefing] ${msg}`);
    console.error(
      "[briefing] Set MY_EMAIL (or NOTIFY_EMAIL_TO) in .env to specify the recipient.",
    );
  } else {
    throw err;
  }
}
```

Notify command catch path:

Reference: `src/commands/notify.ts:14-23`

```ts
try {
  const messageId = await sendBriefingHtmlEmail(briefingData);
  return `Gmail briefing sent for ${briefingData.date} (${messageId}).`;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("MY_EMAIL") || message.includes("NOTIFY_EMAIL_TO")) {
    return "Gmail notification skipped: MY_EMAIL (or NOTIFY_EMAIL_TO) not configured";
  }
  return `Gmail briefing failed: ${message}`;
}
```

Draft command path:

- `createGmailDraft()` errors are not caught in `saveDraftForJob()` / `runDraftCommand()`
- if Gmail draft creation fails during `draft --send-to-gmail`, the command fails

Reference: `src/commands/draft.ts:187-199`

### 5. Exact API call

The repo does not build literal REST URLs for Gmail; it uses the `googleapis` client methods directly.

Create Gmail draft:

Reference: `src/integrations/gmail.ts:37-60`

```ts
const response = await gmail.users.drafts.create({
  userId: "me",
  requestBody: {
    message: {
      raw: encodeBase64Url(message),
    },
  },
});
```

Send HTML email:

Reference: `src/integrations/gmail.ts:69-91`

```ts
const response = await gmail.users.messages.send({
  userId: "me",
  requestBody: {
    raw: encodeBase64Url(message),
  },
});
```

Lookup Gmail profile:

Reference: `src/integrations/gmail.ts:106-109`

```ts
const response = await gmail.users.getProfile({ userId: "me" });
```

Raw MIME shape assembled by the repo:

Reference: `src/integrations/gmail.ts:45-51`, `src/integrations/gmail.ts:77-84`

```ts
const message = [
  `To: ${to}`,
  `Subject: ${encodeMimeHeader(subject)}`,
  "Content-Type: text/plain; charset=utf-8",
  "",
  body,
].join("\r\n");
```

```ts
const message = [
  `To: ${to}`,
  `Subject: ${encodeMimeHeader(subject)}`,
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=utf-8",
  "",
  htmlBody,
].join("\r\n");
```

### 6. API failure behavior

- auth/env failures throw from `getGoogleAuth()`
- recipient resolution failures throw from `resolveBriefingEmailRecipient()`
- `briefing` handles missing creds / missing recipient specially
- `notify` converts failure into a return string
- `draft --send-to-gmail` does not swallow the error

### 7. Tests

Reference: `tests/gmail.test.ts:1-288`

Tests use mocks, not the real API:

- `googleapis` is mocked at `tests/gmail.test.ts:1-33`
- draft creation covered at `tests/gmail.test.ts:132-146`
- HTML briefing send covered at `tests/gmail.test.ts:177-244`
- Gmail profile fallback covered at `tests/gmail.test.ts:246-269`
- `notify` path covered at `tests/gmail.test.ts:271-287`

### 8. Has it actually been run successfully?

Persisted artifacts in the DB:

```sql
SELECT COUNT(*) AS gmail_drafts_persisted FROM drafts WHERE gmail_draft_id IS NOT NULL;
```

Output:

```text
gmail_drafts_persisted
----------------------
0
```

Current repo-state conclusion:

- the code is wired
- tests cover it with mocks
- the current local DB does not persist any successful Gmail draft IDs
- briefing email sends are not stored in SQLite at all

---

## Google Docs

### 1. Code paths

Current runtime integration files under `src/integrations`:

```text
src/integrations/gmail.ts
```

There is no `src/integrations/google-docs.ts` file in the current repo state.

### 2. Required env vars

No current runtime Google Docs module consumes env vars.

### 3. Imported and called?

No runtime command imports a Google Docs integration module.

### 4. Missing-env behavior

Not applicable in current runtime code because no Docs module is imported.

### 5. Exact API call

No current runtime Docs API call exists in `src/`.

### 6. API failure behavior

Not applicable in current runtime code.

### 7. Tests

No current `tests/*` file targets a Google Docs runtime module.

### 8. Has it actually been run successfully?

Not from the current code path. The current briefing command sends Gmail HTML email directly and does not create Docs.

---

## Google Drive

### 1. Code paths

Google Drive is present only in the OAuth helper scopes:

Reference: `scripts/google-auth.ts:18-22`

```ts
const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.compose",
];
```

### 2. Required env vars

`GOOGLE_DRIVE_FOLDER_ID` appears in docs/example config, but no current runtime `src/` code references it.

`rg` matches:

```text
README.md:149-151
.env.example:7-9
```

No `src/` runtime reference to `GOOGLE_DRIVE_FOLDER_ID` was found in the repo search.

### 3. Imported and called?

No current runtime command in `src/` imports a Drive integration module.

### 4. Missing-env behavior

Not applicable in current runtime code.

### 5. Exact API call

No current Drive API call exists in `src/`.

### 6. API failure behavior

Not applicable in current runtime code.

### 7. Tests

No current `tests/*` file targets a Drive runtime integration.

### 8. Has it actually been run successfully?

No runtime artifact in the repo proves current Drive usage, because there is no current runtime Drive write path.

---

## Notifications

### 1. Core delivery path

Current runtime briefing delivery is Gmail only.

### 2. Current scope

The core workflow does not include SMS or provider-specific notification delivery.

---

## Anthropic API

### 1. Code paths

- `src/commands/draft.ts`
- `src/commands/profile.ts`

### 2. Required env vars

Reference: `src/commands/draft.ts:102-105`, `src/commands/profile.ts:210-213`

```ts
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error("ANTHROPIC_API_KEY not set");
}
```

### 3. Imported and called?

Yes.

- draft generation path:
  - `src/commands/draft.ts:136-153`
  - `src/commands/draft.ts:172`
- profile extraction path:
  - `src/commands/profile.ts:240-260`

### 4. Missing-env behavior

Direct low-level functions throw:

- `src/commands/draft.ts:102-105`
- `src/commands/profile.ts:211-212`

Callers then fall back:

Reference: `src/commands/draft.ts:144-152`

```ts
const profile = opts.profile ?? loadProfile(opts.cwd);
if (process.env.ANTHROPIC_API_KEY) {
  try {
    return await generateAnthropicDraft(job, profile, opts.fetchImpl);
  } catch {
    return generateDraft(job);
  }
}
return generateDraft(job);
```

Reference: `src/commands/profile.ts:254-260`

```ts
let profile: Profile;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    profile = await aiExtract(resumeText);
  } catch {
    profile = extractProfileFromText(resumeText);
  }
```

### 5. Exact API call

Draft path:

Reference: `src/commands/draft.ts:107-120`

```ts
const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: buildAnthropicSystemPrompt(profile),
    messages: [{ role: "user", content: buildAnthropicUserPrompt(job) }],
  }),
});
```

Profile extraction path:

Reference: `src/commands/profile.ts:214-226`

```ts
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: buildExtractionPrompt(resumeText) }],
  }),
});
```

### 6. API failure behavior

Draft path:

Reference: `src/commands/draft.ts:122-133`

```ts
if (!response.ok) {
  throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
}

const data = (await response.json()) as {
  content: Array<{ type: string; text: string }>;
};
const text = data.content.filter((item) => item.type === "text").map((item) => item.text).join("").trim();
if (!text) {
  throw new Error("Anthropic API returned empty response");
}
```

Profile path:

Reference: `src/commands/profile.ts:228-237`

```ts
if (!response.ok) {
  throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
}

const data = (await response.json()) as {
  content: Array<{ type: string; text: string }>;
};
const text = data.content.filter((item) => item.type === "text").map((item) => item.text).join("");
if (!text) throw new Error("Anthropic API returned empty response");
```

Caller behavior:

- `draft` falls back to template draft
- `profile` falls back to heuristic text extraction

### 7. Tests

Mocked coverage exists:

- `tests/gmail.test.ts:148-175` mocks Anthropic draft output via `fetchImpl`
- `tests/auto-draft.test.ts:76-213` mocks Anthropic batch draft output via `fetchImpl`
- `tests/profile.test.ts` covers only the fallback/local extraction path, not a live Anthropic response

### 8. Has it actually been run successfully?

No DB artifact explicitly records “Anthropic used successfully”. The repo stores resulting drafts/profile output, not provider provenance.
