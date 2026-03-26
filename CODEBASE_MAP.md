# job-hunt-os → Deployed Proactive System: Build Prompts

Sequential prompts for Claude Code / Codex. Run in order. Each prompt assumes the previous was completed.

---

## Prompt 0: Orientation & Codebase Audit

```
Read the full codebase at ~/Anish_Personal_projects/my-service/. Understand:

1. The CLI entrypoint at src/cli.ts and every command in src/commands/
2. The SQLite schema in src/db/schema.ts, repository patterns in src/db/repositories.ts
3. The existing YC ingester at src/ingest/yc.ts and normalizer at src/ingest/normalize.ts
4. The scoring engine at src/score/scorer.ts and config at config/scoring.ts
5. The candidate profile at src/config/profile.ts and data/profile.json
6. The test suite in tests/

Do NOT modify any files. Write a summary of:
- The normalized job schema (all fields on the `jobs` table)
- The scoring dimensions and how they consume profile data
- The ingester interface pattern (how yc.ts fetches, validates, normalizes, and upserts)
- The profile.json schema and how scorer.ts reads skills_tier1, skills_tier2, domains, preferences

Save this as CODEBASE_MAP.md in the project root.
```

---

## Prompt 1: Greenhouse Ingester

```
Build a new ingester at src/ingest/greenhouse.ts that follows the exact same pattern as src/ingest/yc.ts.

Context:
- Greenhouse exposes a public JSON API: GET https://boards-api.greenhouse.io/v1/boards/{company_slug}/jobs
- Response shape: { jobs: [{ id, title, location: { name }, absolute_url, content, departments: [{ name }], ... }] }
- Individual job detail: GET https://boards-api.greenhouse.io/v1/boards/{company_slug}/jobs/{job_id}

Requirements:
1. Create a target company list at config/greenhouse-companies.ts exporting an array of { slug: string, name: string } objects. Seed it with these companies that use Greenhouse: ["anthropic", "anduril", "brex", "figma", "notion", "ramp", "scale", "stripe", "vercel"]. I will add more later.

2. The ingester function signature should be:
   export async function fetchGreenhouseJobs(companies: GreenhouseCompany[]): Promise<NormalizedJob[]>

3. For each company, fetch the jobs list endpoint. For each job returned:
   - Map to the same NormalizedJob type used by the YC normalizer
   - company_name = company.name from the config (not the slug)
   - title = job.title
   - job_url = job.absolute_url
   - summary = strip HTML from job.content (use a simple regex strip, no dependency)
   - locations = job.location.name
   - remote_flag = infer from location string (contains "Remote" → true)
   - role_source = "greenhouse"
   - role_external_id = String(job.id)
   - external_key = `greenhouse:${company.slug}:${job.id}`
   - departments → map to tags_json
   - Extract skills from title + content using the same extractSkills() function in normalize.ts
   - Set seniority_hint by scanning title for Senior/Staff/Lead/Principal/Junior/Intern patterns

4. Validate each job with Zod before including it. Skip invalid jobs, log a warning, don't crash.

5. Add rate limiting: 500ms delay between company fetches so we don't hammer the API.

6. Write tests at tests/greenhouse.test.ts that mock the HTTP response and verify normalization of 2-3 sample jobs. Use the same test patterns as tests/scan.test.ts.

Do NOT touch any existing files except to add the new import in src/ingest/ and the new config file. Do NOT register CLI commands yet.
```

---

## Prompt 2: Lever Ingester

```
Build a new ingester at src/ingest/lever.ts following the same pattern as the Greenhouse ingester you just built.

Context:
- Lever exposes a public JSON API: GET https://api.lever.co/v0/postings/{company_slug}
- Response shape: array of { id, text (title), categories: { team, department, location, commitment, allLocations }, descriptionPlain, lists: [{ text, content }], applyUrl, hostedUrl, ... }

Requirements:
1. Create config/lever-companies.ts with the same shape as greenhouse-companies.ts. Seed with: ["cloudflare", "netflix", "coinbase", "databricks", "datadog"]. I will add more later.

2. Function signature:
   export async function fetchLeverJobs(companies: LeverCompany[]): Promise<NormalizedJob[]>

3. Mapping:
   - company_name = company.name
   - title = posting.text
   - job_url = posting.hostedUrl
   - summary = posting.descriptionPlain (already plain text)
   - locations = posting.categories.location (may also check allLocations array)
   - remote_flag = infer from location or commitment field
   - role_source = "lever"
   - role_external_id = posting.id
   - external_key = `lever:${company.slug}:${posting.id}`
   - categories.team and categories.department → tags_json
   - categories.commitment → use to infer seniority or full-time/part-time
   - Extract skills from title + descriptionPlain using extractSkills() from normalize.ts

4. Same validation, rate limiting, error handling patterns as the Greenhouse ingester.

5. Write tests at tests/lever.test.ts.

Do NOT touch existing files except to add the new module.
```

---

## Prompt 3: Prospect Company Signal Enrichment

```
Build a Prospect enrichment module at src/ingest/prospect.ts.

Context:
- joinprospect.com/explore lists VC-curated top startups across industries
- They don't have a public API. We'll maintain a static curated list derived from their data and refresh it periodically.
- The value of Prospect is as a COMPANY QUALITY SIGNAL for scoring, not as a job source.

Requirements:
1. Create data/prospect-companies.json as a JSON array of objects:
   { "name": string, "industry": string, "prospect_url": string }

   Seed it with the top companies from Prospect that overlap with our target domains (AI, Software, Cybersecurity, Defense Tech, Fintech, Infrastructure). Include at least 40 companies. Use the companies visible at joinprospect.com/explore filtered to: AI, Software, Cybersecurity, Defense Tech, Fintech, Computing, Data. Examples: Anthropic, Anduril, Abnormal Security, Abridge, Addepar, Airwallex, Figma, Scale AI, etc.

2. Create src/ingest/prospect.ts exporting:
   export function loadProspectCompanies(): ProspectCompany[]
   export function isProspectCompany(companyName: string): boolean
   export function getProspectMatch(companyName: string): ProspectCompany | null

   The matching function should do fuzzy matching: lowercase, strip "Inc", "Inc.", "Co", "Labs", etc., and check if either name contains the other. This handles cases like "Abnormal Security" vs "Abnormal".

3. Modify src/score/scorer.ts to add a Prospect boost:
   - In the companySignal scoring dimension, if isProspectCompany(job.company_name) returns true, add +8 points to companySignal and add a score reason: "Prospect-curated top startup"
   - Add "prospect_listed" to the score_breakdown_json

4. Add a CLI command: npm run prospect-refresh that:
   - Fetches https://www.joinprospect.com/explore
   - Parses company names and industries from the page HTML
   - Updates data/prospect-companies.json
   - This is a best-effort scraper — if the page structure changes, log a warning and keep the existing file

5. Write tests for the fuzzy matching logic and the score boost.

Modify config/scoring.ts to include a `prospectBoost` weight (default: 8) so it's tunable.
```

---

## Prompt 4: Unified Scan Command

```
Update src/commands/scan.ts to orchestrate all three sources (YC + Greenhouse + Lever) in a single scan run.

Requirements:
1. npm run scan should now:
   a. Fetch YC jobs (existing behavior)
   b. Fetch Greenhouse jobs from config/greenhouse-companies.ts
   c. Fetch Lever jobs from config/lever-companies.ts
   d. Normalize all results into the same NormalizedJob[] array
   e. Dedupe by external_key before upserting
   f. Score all jobs using the existing scorer (which now includes Prospect boost)
   g. Upsert into SQLite
   h. Record scan metadata with provider = "yc" | "greenhouse" | "lever"
   i. Print summary: "Scanned 3 sources. 247 total roles. 89 new. 12 scored 80+."

2. Add flags:
   --source yc|greenhouse|lever (run only one source)
   --source all (default, run all)

3. Error isolation: if one source fails (network error, API change), log the error and continue with the other sources. Never let one broken source kill the entire scan.

4. Update the existing scan tests to cover multi-source behavior. Add a test that verifies one source failing doesn't block others.

5. Update the scan metadata table to record per-source counts.
```

---

## Prompt 5: Google Doc Daily Briefing Generator

```
Build a new command at src/commands/briefing.ts that generates a Google Doc with today's job hunt briefing.

Requirements:
1. Install googleapis as a dependency: npm install googleapis

2. Create src/integrations/google-docs.ts with:
   - OAuth2 authentication using a service account or OAuth client credentials
   - Read credentials from environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
   - A function: createOrUpdateBriefingDoc(briefingData: BriefingData): Promise<string> that returns the doc URL
   - If a doc already exists for today (track doc IDs in SQLite or a local file), update it. Otherwise create a new one.

3. The briefing doc should have these sections:

   ## 📊 Daily Job Hunt Briefing — {today's date}

   ### New Roles Today
   A table with columns: Rank | Score (0-100) | Company | Role | Location | Why It Fits | Top Risk | Apply Link
   - Only include roles scored 60+ that were ingested in the last 24 hours
   - Sort by score descending
   - Score column should note if company is Prospect-listed

   ### Pending Follow-ups
   Table: Company | Role | Due Date | Last Action | Notes

   ### Drafted But Unsent
   Table: Company | Role | Draft Version | Created Date

   ### Weekly Funnel (shown on Mondays only)
   - Total roles tracked
   - Applied this week
   - Responses received
   - Interviews scheduled
   - Conversion rates

4. CLI: npm run briefing
   - Runs the scan (all sources)
   - Generates the briefing data from SQLite
   - Creates/updates the Google Doc
   - Prints the doc URL

5. The doc should be created in a specific Google Drive folder. Add GOOGLE_DRIVE_FOLDER_ID to env config.

6. Write a test that verifies briefing data assembly from mock DB state (don't test actual Google API calls).
```

---

## Prompt 6: SMS/Twilio Push Notification

```
Build a notification module at src/integrations/twilio.ts.

Requirements:
1. Install twilio: npm install twilio

2. Create the module with:
   - Read from env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, MY_PHONE_NUMBER
   - export async function sendSMS(message: string): Promise<void>
   - export async function sendDailyBriefingSMS(briefingUrl: string, newRoleCount: number, topScore: number): Promise<void>
     This sends a message like: "☀️ 14 new roles today. Top score: 92 (Anthropic — SWE II). Doc: {url}"

3. Add SMS notification to the briefing command:
   After creating the Google Doc, call sendDailyBriefingSMS with the doc URL and summary stats.
   Make this optional — only send if TWILIO_ACCOUNT_SID is configured. Log "SMS skipped: Twilio not configured" otherwise.

4. Add a standalone command: npm run notify
   - Just sends the SMS for the most recent briefing without re-running the scan
   - Useful for testing

5. Error handling: if Twilio fails, log the error but don't crash. The briefing doc is the primary output; SMS is a convenience notification.

6. Write a test with a mocked Twilio client.
```

---

## Prompt 7: Deployment — Railway/Fly.io + Cron

```
Set up the project for deployment on Railway (preferred) or Fly.io.

Requirements:
1. Create a Dockerfile at the project root:
   - Node 20 Alpine base
   - Copy package.json + lockfile, npm ci --production
   - Copy src/, config/, data/ directories
   - Build TypeScript
   - Default CMD: node dist/cli.js briefing (the daily pipeline)

2. Create a railway.toml or fly.toml with:
   - Service name: job-hunt-os
   - Region: us-west (closest to Milpitas)
   - No public HTTP port needed (this is a cron worker, not a web server)

3. Create scripts/daily-pipeline.sh:
   #!/bin/bash
   set -e
   echo "=== Job Hunt OS Daily Pipeline ==="
   echo "$(date): Starting scan..."
   npm run scan
   echo "$(date): Generating briefing..."
   npm run briefing
   echo "$(date): Pipeline complete."

4. For cron scheduling:
   - Railway: document how to set up a cron trigger at 7:00 AM PST
   - Include a CRON_SCHEDULE env var defaulting to "0 14 * * *" (7am PST = 2pm UTC)

5. SQLite persistence strategy:
   - Install litestream for SQLite replication to S3/R2
   - Add LITESTREAM_REPLICA_URL env var (Cloudflare R2 or AWS S3 bucket)
   - On container start: restore from replica → run pipeline → replicate back
   - Create scripts/start-with-litestream.sh that wraps this

6. Create a .env.example documenting all required env vars:
   ANTHROPIC_API_KEY=
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_REFRESH_TOKEN=
   GOOGLE_DRIVE_FOLDER_ID=
   TWILIO_ACCOUNT_SID=
   TWILIO_AUTH_TOKEN=
   TWILIO_FROM_NUMBER=
   MY_PHONE_NUMBER=
   LITESTREAM_REPLICA_URL=
   CRON_SCHEDULE=0 14 * * *

7. Update the README.md with:
   - Local development instructions
   - Deployment instructions for Railway
   - Environment variable documentation
   - Architecture diagram (ASCII)

Do NOT actually deploy — just set up all the config files and scripts.
```

---

## Prompt 8: Auto-Apply Draft Pipeline

```
Extend the apply workflow so that when a user marks a role for auto-apply, the system generates a tailored draft and creates a Gmail draft.

Requirements:
1. Create src/integrations/gmail.ts:
   - Use googleapis with the same OAuth credentials as Google Docs
   - export async function createGmailDraft(to: string, subject: string, body: string): Promise<string>
   - Returns the Gmail draft ID

2. Extend src/commands/draft.ts:
   - Add a --send-to-gmail flag
   - When set, after generating the draft content:
     a. Create a Gmail draft with:
        - Subject: "Re: {role title} — {company name}"
        - Body: the generated outreach draft
        - To: empty (user fills in the recipient)
     b. Store the Gmail draft ID in the drafts table (add a gmail_draft_id column)
     c. Log: "Gmail draft created for {company} — {role title}"

3. Add a batch mode to the briefing flow:
   - In the Google Doc, add a column "Auto-Draft?" with a checkbox placeholder (just the text "[ ]" since we can't do real checkboxes via API easily)
   - Add a command: npm run auto-draft --min-score 80
     This finds all new roles scored >= threshold that don't have drafts yet, generates drafts for all of them, saves to SQLite, and optionally creates Gmail drafts.
   - Print summary: "Generated 6 drafts. 6 Gmail drafts created."

4. The draft generation should use the Anthropic API (ANTHROPIC_API_KEY) to create personalized outreach:
   - System prompt: include the candidate profile from data/profile.json
   - User prompt: include the job title, company, summary, extracted skills, score reasons, and risks
   - Ask for a concise, direct outreach email (not generic — reference specific skill overlaps and company context)
   - Max 200 words
   - If ANTHROPIC_API_KEY is not set, fall back to the existing template-based draft

5. Update application state to "drafted" for each auto-drafted role.

6. Write tests with mocked Anthropic API and Gmail API responses.
```

---

## Prompt 9: Career Page Scraper (Bonus Source)

```
Build a lightweight career page scraper at src/ingest/careers.ts for companies that don't use Greenhouse or Lever.

Requirements:
1. Create config/career-pages.ts:
   export const careerPages: CareerPage[] = [
     { name: "Planet Labs", slug: "planet", careersUrl: "https://www.planet.com/company/careers/", selector: "auto" },
     { name: "xAI", slug: "xai", careersUrl: "https://x.ai/careers", selector: "auto" },
   ]

2. The scraper should:
   - Fetch the careers page HTML
   - Use a best-effort extraction strategy:
     a. Look for structured data (JSON-LD with JobPosting schema) — most reliable
     b. Look for common patterns: Greenhouse/Lever embedded iframes and extract the company slug
     c. Look for links containing /jobs/, /careers/, /positions/ with role-like text
   - For each extracted role, create a NormalizedJob with role_source = "careers"
   - This is intentionally imprecise — it's a lead generator, not a structured API

3. Make the scraper fault-tolerant:
   - If a page times out (5s timeout), skip it
   - If extraction finds 0 roles, log a warning but don't error
   - If a page returns non-200, skip it

4. Do NOT add this to the default scan command. Register it as:
   npm run scan:careers
   So it runs separately and the user can inspect results before trusting them.

5. Write tests with mocked HTML fixtures for both a JSON-LD page and a link-pattern page.
```

---

## Prompt 10: End-to-End Integration Test

```
Write an end-to-end integration test at tests/pipeline.integration.test.ts.

This test should:
1. Start with a fresh SQLite database (in-memory or temp file)
2. Load the real profile from data/profile.json
3. Mock HTTP responses for:
   - 1 Greenhouse company with 3 jobs
   - 1 Lever company with 2 jobs
   - YC with 5 companies
4. Run the full scan pipeline (all sources)
5. Verify:
   - All 10 jobs are in the database
   - Each has a score > 0
   - Each has score_reasons_json populated
   - Prospect-listed companies have the prospect boost in score_breakdown_json
   - Deduplication works (run scan again, count should still be 10)
6. Run the briefing data assembly (without actual Google Docs API)
7. Verify:
   - Briefing contains "New Roles Today" section with correct count
   - Roles are sorted by score descending
   - Follow-ups section is empty (no applications yet)
8. Simulate an apply flow:
   - Apply to the top-scored role
   - Create a follow-up
   - Run briefing assembly again
   - Verify the role appears in "Drafted But Unsent" or follow-ups as appropriate

Mark this test with a "integration" tag so it can be run separately: npm run test:integration

This test validates that the entire pipeline from ingestion to briefing works end-to-end.
```

---

## Usage Notes

**Order matters.** Prompts 0-4 build the source expansion. Prompt 5-6 build the output/notification layer. Prompt 7 handles deployment. Prompt 8 adds auto-apply. Prompt 9 is a bonus source. Prompt 10 validates everything.

**After each prompt**, review the output, run the tests, and fix anything before moving to the next prompt.

**Environment setup** you'll need before Prompt 5:
- Google Cloud project with Docs + Drive + Gmail APIs enabled
- OAuth2 credentials (or service account)
- Twilio account (free tier works for testing)

**After Prompt 7**, you can deploy and have a working daily pipeline even without Prompts 8-9.