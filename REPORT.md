

### End-to-End Pipeline

Job intake starts from five source paths:
- YC: `src/ingest/yc.ts` fetches `https://yc-oss.github.io/api/companies/hiring.json`, validates company/role payloads with Zod, and writes the raw payload to `data/yc_hiring_raw.json`.
- Greenhouse: `src/ingest/greenhouse.ts` fetches `https://boards-api.greenhouse.io/v1/boards/<slug>/jobs` for every slug in `config/greenhouse-companies.ts`, validates each job, and can emit slug-audit lines showing configured slug, HTTP result, and jobs returned.
- Lever: `src/ingest/lever.ts` fetches `https://api.lever.co/v0/postings/<slug>` for every slug in `config/lever-companies.ts`, validates each posting, and can emit the same slug-audit detail.
- Career pages: `src/ingest/careers.ts` fetches the configured HTML career pages in `config/career-pages.ts`, then extracts roles using JSON-LD, embedded Greenhouse/Lever detection, or job-link patterns plus detail-page hydration.
- Manual import: `src/commands/import.ts` loads CSV or JSON files from disk and converts each row into a YC-like company plus a normalized role opportunity.

Normalization happens in two layers:
- Source-specific normalizers build `NormalizedOpportunity` objects with `externalKey`, `roleExternalId`, `roleSource`, `title`, `summary`, `locations`, `remoteFlag`, `jobUrl`, `postedAt`, `seniorityHint`, optional compensation fields, and `extractedSkills`.
- `src/ingest/normalize.ts` also supplies fallback company-level rows for YC companies without role-level postings, canonicalizes locations, parses posted dates from fields or text, extracts skills from keywords, and converts normalized opportunities into `JobUpsertInput` records for SQLite.

Scoring is handled by `src/score/scorer.ts` against the profile loaded from `data/profile.json`:
- `roleFit` max 25 from target-role keywords, role/title text, healthcare preference, and remote preference.
- `stackFit` max 30 from tier-1 skills, tier-2 skills, domains, practices, and resume keywords found in the normalized text.
- `seniorityFit` max 15 from inferred profile seniority vs inferred role seniority, with stronger penalties for staff-plus mismatches.
- `freshness` max 10 from recent YC batch membership and current hiring flag.
- `companySignal` max 20 from top-company flag, stage/team-size heuristics, remote status, compensation disclosure, geography, healthcare signals, profile-location alignment, and an internal Prospect boost that is clamped back into the 20-point company-signal bucket.
- `scan --score-debug <selector>` prints the extracted text, extracted skills, matched profile signals, and full score breakdown for matching jobs.

Persistence flow:
- `job_sources`: `upsertJobSource` writes one row per provider/external source pair.
- `scans`: `createScan` starts a scan row per provider and `completeScan` writes `completed_at`, `raw_count`, `valid_count`, and `source_counts_json`.
- `jobs`: `upsertJob` writes the normalized/scored job row, including score reasons, score breakdown, explanation bullets, risk bullets, extracted skills, `role_source`, and `posted_at`.
- `applications`: `upsertApplication` stores status, applied metadata, response metadata, interview stage, rejection reason, and last-contacted timestamp.
- `application_events`: `createApplicationEvent` appends status-change, draft, and follow-up events with metadata JSON.
- `followups`: `createFollowup` and `updateFollowup` create and mutate reminder rows.
- `drafts`: `upsertDraft` stores generated content, edited content, variant, optional Gmail draft ID, and optional application linkage.
- `baseline_snapshots` and `baseline_jobs`: `baseline-bootstrap` creates one-time baseline cohorts from the current inventory.

Surfacing/output flow:
- Terminal views: `scan`, `browse`, `review`, `today`/`next`, `stats`, `drafts`, `followups`, `apply`, `import`, `profile`, `prospect-refresh`, `scan:careers`, and `baseline-bootstrap`.
- Email: `src/templates/briefing-email.ts` renders an inline-style HTML briefing, `src/integrations/gmail.ts` sends it through Gmail, and `briefing`/`notify` trigger the send.
- Drafts: `draft` can save local drafts in SQLite and optionally create Gmail drafts.
- Docs: there is no active Google Docs integration in current `src/`; the live briefing surface is Gmail-only.

Application tracking semantics:
- Job statuses: `new`, `reviewed`, `saved`, `shortlisted`, `drafted`, `applied`, `followup_due`, `replied`, `interview`, `rejected`, `archived`.
- Application statuses: `saved`, `shortlisted`, `drafted`, `applied`, `followup_due`, `replied`, `interview`, `rejected`, `archived`.
- Interview stages: `recruiter_screen`, `hiring_manager`, `technical`, `onsite`, `final`, `offer`.
- Application events currently emitted by code: `status_changed`, `draft_saved`, `draft_updated`, `followup_created`, `followup_done`, `followup_skipped`, `followup_rescheduled`, `followup_updated`.
- The repository layer overwrites application/job status directly; there is no separate finite-state enforcement layer.

### ASCII Diagram

```text
resume(.pdf/.txt)
   |
   v
profile command -> src/commands/profile.ts -> data/profile.json
   |
   +------------------------------+
                                  |
YC API -------------------------->+
Greenhouse boards --------------->+
Lever boards -------------------->+--> source normalizers --> NormalizedOpportunity
Career pages -------------------->+
Manual CSV/JSON import ---------->+
                                  |
                                  v
                        src/score/scorer.ts
                                  |
                                  v
             job_sources + scans + jobs tables in SQLite
                                  |
             +--------------------+------------------------+
             |                    |                        |
             v                    v                        v
         browse/review         today/next            briefing/notify
             |                    |                        |
             |                    |                 renderBriefingEmail
             |                    |                        |
             v                    v                        v
         terminal output      terminal output        Gmail HTML email
                                  |
                                  v
              draft/apply/followups commands -> drafts/applications/followups
                                  |
                                  v
                         application_events table
```

## 4. What Is Fully Built And Working

### Ingestion

- YC ingestion is implemented, validated with Zod, cached to `data/yc_hiring_raw.json`, and wired into the main `scan` command.
- Greenhouse ingestion is implemented, rate-limited, validated, wired into `scan`, and supports slug-audit debug output.
- Lever ingestion is implemented, rate-limited, validated, wired into `scan`, and supports slug-audit debug output.
- Career-page scraping is implemented and is used both by `scan:careers` and by the main `scan` command.
- Manual JSON/CSV import is implemented and persists imported roles into the same SQLite pipeline as fetched jobs.
- Prospect enrichment is implemented and can refresh/cache company data from joinprospect.com.

### Scoring And Storage

- Shared opportunity normalization is implemented for all sources.
- Score calculation, explanation bullets, risk bullets, and scorer debug output are implemented.
- Scan rows, source rows, job rows, applications, drafts, follow-ups, events, and baseline snapshots all have live repository write paths.
- The scan command distinguishes `upserted`, `new`, and `updated` counts in its terminal summary and in per-source `source_counts_json`.

### CLI Surface

- `scan`, `browse`, `review`, `today`/`next`, `stats`, `apply`, `draft`, `drafts`, `followups`, `import`, `profile`, `prospect-refresh`, `briefing`, `notify`, `scan:careers`, and `baseline-bootstrap` are all registered in `src/cli.ts`.
- Briefing defaults to a 50-point threshold and excludes `company_fallback` rows unless `--include-fallback` is passed.
- Today/next also excludes `company_fallback` rows unless `--include-fallback` is passed.

### Integrations

- Gmail draft creation is implemented and tested.
- Gmail HTML briefing send is implemented and tested.

### Runtime Packaging

- `scripts/daily-pipeline.sh`, `scripts/start-with-litestream.sh`, `Dockerfile`, and `railway.toml` together define a runnable cron-style worker container.
- `npm test` currently passes all 24 test suites / 138 tests, and `npm run typecheck` currently passes.

## 5. What Is Partially Built

- Briefing delivery stays Gmail-only; extra notification channels are not part of the core CLI workflow.
- `scan:careers`: the command previews scraped roles in the terminal, but its own help text still frames persistence as a separate import step even though the main `scan` command already persists career-page roles directly.
- Deployment assets: `Dockerfile` and `railway.toml` match the current cron-worker shape, but `.github/workflows/ci-cd.yml` and `ops/k8s/*` still target an HTTP app called `myapp` on port 3000 with `/healthz` and `/readyz` checks.
- Build output: `dist/` exists and is used by the shell pipeline, but it also contains stale/orphaned artifacts for removed web-service, Google Docs, and `yc-job-hunter` code paths.
- Source tree leftovers: empty directories `src/middleware`, `src/routes`, `src/schemas`, and `src/yc-job-hunter` remain in the tree without current source files.

## 6. What Is Referenced But Does Not Exist

- `src/integrations/google-docs.ts` is referenced by older docs (`AUDIT.MD`, `CODEBASE_MAP.md`) and by stale compiled output in `dist/src/integrations/google-docs.*`, but no current source file exists at that path.
- `src/yc-job-hunter/*` is referenced by `scripts/setup-yc-hunter.sh` and by stale compiled output under `dist/yc-job-hunter/`, but no current source files exist in `src/yc-job-hunter/`.
- `npm run lint` is referenced by `.github/workflows/ci-cd.yml`, but `package.json` does not define a `lint` script.
- `/healthz` and `/readyz` HTTP endpoints are referenced by `.github/workflows/ci-cd.yml` and `ops/k8s/*`, but no current HTTP server source exists in `src/`.
- `.claude/settings.local.json` is referenced by `scripts/setup-claude-flow.sh`, but that file does not exist in the repository.

## 7. Current Database State

Current row counts: job_sources=1426, scans=17, jobs=7898, applications=0, application_events=0, followups=0, drafts=1, baseline_snapshots=1, baseline_jobs=36.

### job_sources

Columns:
- id INTEGER | PK
- provider TEXT | NOT NULL
- external_id TEXT | NOT NULL
- url TEXT | NOT NULL
- created_at TEXT | NOT NULL | DEFAULT datetime('now')
- updated_at TEXT | NOT NULL | DEFAULT datetime('now')

Indexes:
- sqlite_autoindex_job_sources_1 (provider, external_id) | UNIQUE, origin=u

Write/population notes:
- Current code writes provider, external_id, url, and updated_at via `upsertJobSource`; `id` and `created_at` are database-managed.
- Live rows: 1426. Providers present right now: yc=1409, greenhouse=16, careers=1.

### scans

Columns:
- id INTEGER | PK
- provider TEXT | NOT NULL
- started_at TEXT | NOT NULL
- completed_at TEXT
- raw_count INTEGER | NOT NULL | DEFAULT 0
- valid_count INTEGER | NOT NULL | DEFAULT 0
- source_counts_json TEXT | NOT NULL | DEFAULT '{}'

Indexes:
- None

Write/population notes:
- Current code writes provider and started_at via `createScan`, then fills completed_at, raw_count, valid_count, and source_counts_json via `completeScan`; `id` is database-managed.
- Live rows: 17. The latest completed scan batch is grouped under started_at 2026-03-26T23:43:07.657Z.

### jobs

Columns:
- id INTEGER | PK
- source_id INTEGER | NOT NULL
- scan_id INTEGER | NOT NULL
- external_key TEXT | NOT NULL
- role_external_id TEXT
- role_source TEXT | NOT NULL | DEFAULT 'company_fallback'
- company_name TEXT | NOT NULL
- title TEXT
- summary TEXT | NOT NULL
- website TEXT | NOT NULL
- locations TEXT | NOT NULL
- remote_flag INTEGER | NOT NULL | DEFAULT 0
- job_url TEXT | NOT NULL | DEFAULT ''
- regions_json TEXT | NOT NULL
- tags_json TEXT | NOT NULL
- industries_json TEXT | NOT NULL
- stage TEXT | NOT NULL
- batch TEXT | NOT NULL
- team_size INTEGER
- seniority_hint TEXT
- compensation_min INTEGER
- compensation_max INTEGER
- compensation_currency TEXT
- compensation_period TEXT
- extracted_skills_json TEXT | NOT NULL | DEFAULT '[]'
- top_company INTEGER | NOT NULL
- is_hiring INTEGER | NOT NULL
- score INTEGER | NOT NULL
- score_reasons_json TEXT | NOT NULL
- score_breakdown_json TEXT | NOT NULL | DEFAULT '{}'
- explanation_bullets_json TEXT | NOT NULL | DEFAULT '[]'
- risk_bullets_json TEXT | NOT NULL | DEFAULT '[]'
- status TEXT | NOT NULL | DEFAULT 'new'
- created_at TEXT | NOT NULL | DEFAULT datetime('now')
- updated_at TEXT | NOT NULL | DEFAULT datetime('now')
- posted_at TEXT

Indexes:
- idx_jobs_source_id (source_id) | origin=c
- idx_jobs_status (status) | origin=c
- idx_jobs_score (score) | origin=c
- sqlite_autoindex_jobs_1 (external_key) | UNIQUE, origin=u

Write/population notes:
- Current code writes every business column through `upsertJob`, while `markJobStatus` and `upsertApplication` also update status/updated_at; `id` and `created_at` are database-managed.
- Live rows: 7898. role_external_id=6489, title=6489, remote_flag=1 for 1644, posted_at=566, team_size=1409, seniority_hint=2467.
- Current live DB has zero populated values for compensation_min, compensation_max, compensation_currency, and compensation_period. Role-source distribution: greenhouse=6486, company_fallback=1409, careers=3. Status distribution: new=7898.

### applications

Columns:
- id INTEGER | PK
- job_id INTEGER | NOT NULL
- applied_at TEXT
- status TEXT | NOT NULL
- notes TEXT
- applied_url TEXT
- resume_version TEXT
- outreach_draft_version TEXT
- response_received INTEGER | NOT NULL | DEFAULT 0
- response_type TEXT
- interview_stage TEXT
- rejection_reason TEXT
- last_contacted_at TEXT
- created_at TEXT | NOT NULL | DEFAULT datetime('now')
- updated_at TEXT | NOT NULL | DEFAULT datetime('now')

Indexes:
- sqlite_autoindex_applications_1 (job_id) | UNIQUE, origin=u

Write/population notes:
- Current code writes every non-id application column through `upsertApplication`; `created_at` is database-managed.
- Live rows: 0. The table is currently empty, so every application column is unpopulated in the live database snapshot.

### application_events

Columns:
- id INTEGER | PK
- application_id INTEGER | NOT NULL
- event_type TEXT | NOT NULL
- previous_status TEXT
- next_status TEXT
- note TEXT
- metadata_json TEXT | NOT NULL | DEFAULT '{}'
- created_at TEXT | NOT NULL | DEFAULT datetime('now')

Indexes:
- idx_application_events_application_id (application_id, created_at) | origin=c

Write/population notes:
- Current code writes every non-id event column through `createApplicationEvent`; `created_at` is database-managed.
- Live rows: 0. The table is currently empty.

### followups

Columns:
- id INTEGER | PK
- job_id INTEGER | NOT NULL
- application_id INTEGER
- due_at TEXT | NOT NULL
- status TEXT | NOT NULL | DEFAULT 'pending'
- note TEXT
- created_at TEXT | NOT NULL | DEFAULT datetime('now')
- updated_at TEXT | NOT NULL | DEFAULT datetime('now')

Indexes:
- idx_followups_due (status, due_at) | origin=c

Write/population notes:
- Current code writes every non-id follow-up column through `createFollowup` and `updateFollowup`; `created_at` is database-managed.
- Live rows: 0. The table is currently empty.

### drafts

Columns:
- id INTEGER | PK
- job_id INTEGER | NOT NULL
- application_id INTEGER
- variant TEXT | NOT NULL | DEFAULT 'default'
- generated_content TEXT | NOT NULL
- edited_content TEXT
- created_at TEXT | NOT NULL | DEFAULT datetime('now')
- updated_at TEXT | NOT NULL | DEFAULT datetime('now')
- gmail_draft_id TEXT

Indexes:
- idx_drafts_application_id (application_id, updated_at) | origin=c
- idx_drafts_job_id (job_id, updated_at) | origin=c
- sqlite_autoindex_drafts_1 (job_id, variant) | UNIQUE, origin=u

Write/population notes:
- Current code writes every non-id draft column through `upsertDraft`; `created_at` is database-managed.
- Live rows: 1. Current summary: default=count:1, gmail_backed:0, linked_to_application:0.

### baseline_snapshots

Columns:
- id INTEGER | PK
- label TEXT | NOT NULL
- effective_date TEXT | NOT NULL
- created_at TEXT | NOT NULL | DEFAULT datetime('now')

Indexes:
- sqlite_autoindex_baseline_snapshots_1 (label) | UNIQUE, origin=u

Write/population notes:
- Current code writes label and effective_date through `createBaselineSnapshot`; `created_at` is database-managed.
- Live rows: 1. Snapshot(s): initial_30d_baseline effective 2026-02-24 created 2026-03-26 22:17:27.

### baseline_jobs

Columns:
- baseline_id INTEGER | PK | NOT NULL
- job_id INTEGER | PK | NOT NULL
- score_snapshot INTEGER | NOT NULL
- status_snapshot TEXT | NOT NULL
- role_source_snapshot TEXT | NOT NULL
- posted_at_snapshot TEXT
- discovered_at_snapshot TEXT | NOT NULL
- created_at TEXT | NOT NULL | DEFAULT datetime('now')

Indexes:
- idx_baseline_jobs_baseline_id (baseline_id, score_snapshot) | origin=c
- sqlite_autoindex_baseline_jobs_1 (baseline_id, job_id) | UNIQUE, origin=pk

Write/population notes:
- Current code writes every non-id baseline column through `snapshotJobsIntoBaseline`; `created_at` is database-managed.
- Live rows: 36. Current baseline rows with fallback roles: 0.

Latest scans (10 most recent rows):
- id=17 | provider=careers | started_at=2026-03-26T23:43:07.657Z | completed_at=2026-03-26T23:43:39.487Z | raw_count=3 | valid_count=3 | source_counts_json={"rawCount":3,"validCount":3,"totalRoles":3,"deduped":3,"upserted":3,"newCount":3,"scored80Plus":0,"roleCount":3}
- id=16 | provider=lever | started_at=2026-03-26T23:43:07.657Z | completed_at=2026-03-26T23:43:39.487Z | raw_count=0 | valid_count=0 | source_counts_json={"rawCount":0,"validCount":0,"totalRoles":0,"deduped":0,"upserted":0,"newCount":0,"scored80Plus":0,"roleCount":0}
- id=15 | provider=greenhouse | started_at=2026-03-26T23:43:07.657Z | completed_at=2026-03-26T23:43:39.487Z | raw_count=6475 | valid_count=6475 | source_counts_json={"rawCount":6475,"validCount":6475,"totalRoles":6475,"deduped":6475,"upserted":6475,"newCount":1067,"scored80Plus":0,"roleCount":6475}
- id=14 | provider=yc | started_at=2026-03-26T23:43:07.657Z | completed_at=2026-03-26T23:43:39.486Z | raw_count=1432 | valid_count=1409 | source_counts_json={"rawCount":1432,"validCount":1409,"totalRoles":1409,"deduped":1409,"upserted":1409,"newCount":0,"scored80Plus":0,"roleCount":0}
- id=13 | provider=lever | started_at=2026-03-26T22:05:59.671Z | completed_at=2026-03-26T22:07:18.248Z | raw_count=0 | valid_count=0 | source_counts_json={"rawCount":0,"validCount":0,"totalRoles":0,"deduped":0,"upserted":0,"newCount":0,"scored80Plus":0,"roleCount":0}
- id=12 | provider=greenhouse | started_at=2026-03-26T22:05:59.671Z | completed_at=2026-03-26T22:07:18.248Z | raw_count=5414 | valid_count=5414 | source_counts_json={"rawCount":5414,"validCount":5414,"totalRoles":5414,"deduped":5414,"upserted":5414,"newCount":3986,"scored80Plus":0,"roleCount":5414}
- id=11 | provider=yc | started_at=2026-03-26T22:05:59.671Z | completed_at=2026-03-26T22:07:18.247Z | raw_count=1432 | valid_count=1409 | source_counts_json={"rawCount":1432,"validCount":1409,"totalRoles":1409,"deduped":1409,"upserted":1409,"newCount":0,"scored80Plus":0,"roleCount":0}
- id=10 | provider=lever | started_at=2026-03-26T09:08:04.813Z | completed_at=2026-03-26T09:08:40.801Z | raw_count=0 | valid_count=0 | source_counts_json={"rawCount":0,"validCount":0,"totalRoles":0,"deduped":0,"upserted":0,"newCount":0,"scored80Plus":0,"roleCount":0}
- id=9 | provider=greenhouse | started_at=2026-03-26T09:08:04.813Z | completed_at=2026-03-26T09:08:40.801Z | raw_count=1433 | valid_count=1433 | source_counts_json={"rawCount":1433,"validCount":1433,"totalRoles":1433,"deduped":1433,"upserted":1433,"newCount":0,"scored80Plus":0,"roleCount":1433}
- id=8 | provider=yc | started_at=2026-03-26T09:08:04.813Z | completed_at=2026-03-26T09:08:40.801Z | raw_count=1432 | valid_count=1409 | source_counts_json={"rawCount":1432,"validCount":1409,"totalRoles":1409,"deduped":1409,"upserted":1409,"newCount":0,"scored80Plus":0,"roleCount":0}

## 8. Current Env Vars

- `ANTHROPIC_API_KEY`: optional; read by `src/commands/draft.ts` and `src/commands/profile.ts`. If missing, both commands fall back to deterministic local generation/extraction instead of calling Anthropic.
- `GOOGLE_CLIENT_ID`: required for Gmail draft creation and Gmail briefing send; missing it causes `src/integrations/gmail.ts` to throw a Google-credentials error.
- `GOOGLE_CLIENT_SECRET`: same requirement and failure mode as `GOOGLE_CLIENT_ID`.
- `GOOGLE_REFRESH_TOKEN`: same requirement and failure mode as `GOOGLE_CLIENT_ID`.
- `MY_EMAIL`: optional; if set, Gmail briefing sends target this address first. If absent, code falls back to `NOTIFY_EMAIL_TO`, then to the authenticated Gmail profile email.
- `NOTIFY_EMAIL_TO`: optional fallback briefing recipient. If both `MY_EMAIL` and `NOTIFY_EMAIL_TO` are missing and Gmail profile lookup also returns no email, briefing/notify cannot resolve a recipient.
- `LITESTREAM_REPLICA_URL`: optional locally; read by `scripts/start-with-litestream.sh`. If missing, the script skips restore/replication and just runs the daily pipeline directly.
- `LITESTREAM_S3_ENDPOINT`: optional; read by `scripts/start-with-litestream.sh` to add an S3-compatible endpoint to generated Litestream config.
- `CRON_SCHEDULE`: documented in `.env.example` and `railway.toml`, but no current application code reads it directly.
- `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY`: documented for Litestream/R2 setup, but no repository script reads them directly; they are expected to be consumed by Litestream itself when present in the environment.

## 9. Current CLI Surface

### npm Scripts

- `build`: runs `tsc` and writes compiled output to `dist/`.
- `dev`: runs `ts-node src/cli.ts`; flags are passed through to the CLI entrypoint.
- `cli`: same as `dev`, but intended as the explicit base CLI script.
- `scan`: runs `ts-node src/cli.ts scan`; accepts `--source`, `--slug-audit`, and repeated/comma-separated `--score-debug <selector>` flags, then prints a one-line scan summary.
- `import`: runs `ts-node src/cli.ts import`; accepts `<file>` plus optional `--format <csv|json>` and prints raw/valid/imported counts.
- `notify`: runs `ts-node src/cli.ts notify`; has no flags and prints either a Gmail success line or a skip/failure line.
- `prospect-refresh`: runs `ts-node src/cli.ts prospect-refresh`; has no flags and prints refresh completion or warning text.
- `review`: runs `ts-node src/cli.ts review`; accepts `--query`, `--min-score`, `--status`, `--remote`, `--today`, and `--limit`, then prints multi-line job reviews or `No jobs matched your filters.`
- `browse`: runs `ts-node src/cli.ts browse`; accepts `--query`, `--min-score`, `--status`, `--source`, `--remote`, `--prospect`, `--real-roles`, `--posted-within-days`, `--tracked-within-days`, `--sort`, and `--limit`, then prints browse rows or `No jobs matched your filters.`
- `stats`: runs `ts-node src/cli.ts stats`; has no flags and prints conversion, score-band, and source analytics.
- `today`: runs `ts-node src/cli.ts today --limit 10`; also accepts `--include-fallback` when passed after `--`, and prints prioritized action cards or `No high-priority actions right now.`
- `next`: runs `ts-node src/cli.ts next --limit 10`; this hits the `today` command alias with the same behavior as `today`.
- `auto-draft`: runs `ts-node src/cli.ts auto-draft`; accepts `--min-score`, `--send-to-gmail`, and `--variant`, then prints generated/skipped counts.
- `draft`: runs `ts-node src/cli.ts draft`; accepts `<company>` plus `--copy`, `--open`, `--save`, `--variant`, `--edited-file`, and `--send-to-gmail`, then prints the draft body and may also log Gmail-draft creation.
- `drafts`: runs `ts-node src/cli.ts drafts`; the CLI surface is `drafts list [--query]` and `drafts show <draft-id>`.
- `apply`: runs `ts-node src/cli.ts apply`; accepts `<company>` plus `--followup-days`, `--status`, `--notes`, `--applied-url`, `--resume-version`, `--outreach-draft-version`, `--response-received`, `--response-type`, `--interview-stage`, `--rejection-reason`, and `--last-contacted-at`, then prints the updated job/follow-up line.
- `followups`: runs `ts-node src/cli.ts followups`; accepts `--done`, `--skip`, `--reschedule`, `--days`, and `--note`, then either prints pending rows or the action result line.
- `profile`: runs `ts-node src/cli.ts profile`; accepts `<resume-path>` and prints `Saved profile for ...`.
- `briefing`: runs `ts-node src/cli.ts briefing`; accepts `--no-scan`, `--date <YYYY-MM-DD>`, and `--include-fallback`, then prints scan/assembly counts and either the Gmail message ID or credential/recipient errors.
- `baseline-bootstrap`: runs `ts-node src/cli.ts baseline-bootstrap`; accepts `--days`, `--label`, `--min-score`, `--include-fallback`, and `--replace`, then prints a multi-line snapshot summary.
- `google-auth`: runs `npx ts-node scripts/google-auth.ts`; no flags are defined in the script itself, and it opens a local Google OAuth flow then prints env var values when successful.
- `scan:careers`: runs `ts-node src/cli.ts scan:careers`; has no flags and prints scrape strategy plus up to 10 roles per page.
- `test`: runs `jest --passWithNoTests`.
- `test:integration`: runs the single integration suite `tests/pipeline.integration.test.ts` in-band.
- `typecheck`: runs `tsc --noEmit`.

### Registered CLI Commands

- `scan`: multi-source fetch/score/upsert command with `--source`, `--slug-audit`, and `--score-debug`.
- `import`: manual CSV/JSON ingest command with a required file argument and optional `--format`.
- `notify`: resend-latest-briefing command with no flags.
- `prospect-refresh`: refreshes the Prospect cache with no flags.
- `review`: review output over scored jobs with query/score/status filters.
- `browse`: browse output over scored jobs with richer source/date/prospect filters.
- `today` / `next`: prioritized next-action view with `--limit` and `--include-fallback`.
- `stats`: analytics command with no flags.
- `auto-draft`: batch draft-generation command with threshold/Gmail/variant flags.
- `draft`: single-draft command with copy/open/save/Gmail options.
- `drafts list` / `drafts show`: saved-draft browsing subcommands.
- `apply`: application-status and follow-up creation command.
- `followups`: follow-up listing/mutation command.
- `profile`: resume-to-profile command.
- `briefing`: daily HTML briefing send command.
- `scan:careers`: experimental career-page preview command.
- `baseline-bootstrap`: baseline snapshot command.

## 10. Current Test Coverage

- Test command run in this audit: `npm test -- --runInBand`.
- Current result: 24 test suites passed, 24 total; 138 tests passed, 138 total; 0 failed; 0 skipped; 0 snapshots.
- Type-check result in this audit: `npm run typecheck` exited successfully.
- Covered areas: scan flow, scan counting semantics, threshold behavior, fallback exclusion, briefing assembly, briefing HTML template, careers scraping, Greenhouse ingestion, Lever ingestion, Prospect parsing/enrichment, DB schema/migrations, apply/draft/drafts/followups flows, Gmail integration, browse/review/today/stats output, profile extraction, and the end-to-end pipeline integration path.
- Areas with no direct test files: deployment assets (`Dockerfile`, `railway.toml`, `.github/workflows/*`, `ops/k8s/*`), shell scripts, root documentation, `.claude*` workspace files, and the compiled `dist/` tree.
- There is no coverage-percentage report configured in Jest right now; current coverage evidence comes from the passing test files themselves rather than an LCOV/HTML coverage artifact.

## 11. Dependencies

### Production Dependencies

- `better-sqlite3`: used by `src/db/index.ts`, `src/db/schema.ts`, `src/db/repositories.ts`, and commands that import `Database` types.
- `clipboardy`: installed but never imported by current source; older clipboard behavior now uses `pbcopy` via `execSync`. [Flag: installed but unused in current source]
- `commander`: used by `src/cli.ts` and every file in `src/commands/` to define the CLI surface.
- `dotenv`: used by `src/cli.ts` to load `.env`.
- `google-auth`: installed but never imported by current source. [Flag: installed but unused in current source]
- `google-auth-library`: installed but never imported by current source. [Flag: installed but unused in current source]
- `googleapis`: used by `src/integrations/gmail.ts` and `scripts/google-auth.ts`; also exercised in Gmail-related tests.
- `open`: installed but never imported by current source. [Flag: installed but unused in current source]
- `pdf-parse`: dynamically required by `src/commands/profile.ts` for PDF resume text extraction.
- `zod`: used by `src/config/types.ts`, `src/commands/import.ts`, `src/ingest/greenhouse.ts`, `src/ingest/lever.ts`, and `src/ingest/yc.ts`.

### Dev Dependencies

- `@types/better-sqlite3`: TypeScript typings for the SQLite dependency; consumed by the TypeScript compiler rather than imported at runtime.
- `@types/jest`: TypeScript typings for the Jest test environment; consumed by the compiler/test tooling rather than imported at runtime.
- `@types/node`: Node.js typings for TypeScript; consumed by the compiler rather than imported at runtime.
- `@types/pdf-parse`: typings for the PDF parser package; consumed by the compiler rather than imported at runtime.
- `jest`: test runner invoked through `npm test` and configured by `jest.config.ts`.
- `ts-jest`: TypeScript transformer configured in `jest.config.ts`.
- `ts-node`: used by the CLI-focused npm scripts and by `scripts/google-auth.ts`.
- `typescript`: compiler/tooling dependency used by `npm run build` and `npm run typecheck`.

## 12. Open Questions

- README and `.env.example` still describe Google Drive / Google Docs briefing export, but the current runtime implementation is Gmail-only.
- README still says the briefing keeps a 60+ threshold for new-role email cards, while current code uses `DEFAULT_BRIEFING_MIN_SCORE = 50`.
- `src/commands/briefing.ts` counts `offer` inside an applications-status SQL clause even though `ApplicationStatus` in `src/db/types.ts` does not include `offer`; only `InterviewStage` includes it.
- `MY_EMAIL` is supported in `src/integrations/gmail.ts`, but it is not documented in `.env.example` or in the README environment-variable table.
- The live database currently shows no Lever jobs or Lever job_sources even though Lever scanning is implemented and recorded in `scans` with zero-count rows.
- `dist/` contains compiled artifacts that no longer match the current source tree, so the exact runtime behavior depends on whether commands are run through `ts-node` (`src/`) or through compiled `dist/` scripts.
- `scan:careers` still tells the user to persist results via import even though the main `scan` path already persists career-page roles directly.
