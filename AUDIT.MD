# Full Audit: `job-hunt-os`

## Executive Summary

This repository is no longer a mixed experiment. It is now a local-first, SQLite-backed, CLI-first job-hunt operating system MVP.

The repo is centered on one product loop:

1. capture a candidate profile
2. ingest roles from YC and manual sources
3. normalize and score them
4. review the best opportunities
5. draft outreach and applications
6. track application state and history
7. manage follow-ups
8. measure outcomes
9. surface the best actions to take today

The current product is strong enough to support an actual daily job-search workflow, especially for a YC-first or manually imported role pipeline.

It is intentionally:

- local-first
- SQLite-based
- CLI-first
- no frontend
- no cloud infra
- easy to tune
- minimal but coherent

---

## What This Project Is

`job-hunt-os` is a personal job-search operating system. It helps one candidate maintain a structured, persistent workflow for discovering roles, ranking fit, drafting outreach, tracking applications, managing follow-ups, and reviewing outcome analytics.

It is not just a job scraper.

It is trying to be an end-to-end operating loop for job hunting:

- discovery
- prioritization
- execution
- follow-through
- learning from outcomes

---

## What The Repo Seeks To Do

At the product level, this repo is trying to do all of the following:

- maintain a reusable candidate profile for scoring
- extract structured candidate details from a resume
- ingest job opportunities from YC hiring data
- ingest job opportunities manually from CSV and JSON
- normalize all external role data into one schema
- persist opportunities durably in SQLite
- score roles by candidate fit and actionability
- explain why a role ranks well
- surface risks, not just positives
- help the user decide what to do next
- generate personalized outreach drafts
- store draft variants durably
- track application status over time
- keep a full event history of workflow changes
- schedule, list, and update follow-ups
- capture outcomes like replies, interviews, and rejections
- compute funnel analytics and breakdowns
- provide a daily action queue of the highest-leverage next steps

That is the core ambition of the project.

---

## Product Boundaries

### In scope

- local job-search operations
- candidate profile management
- YC role/company ingestion
- manual role import
- scoring and review
- outreach drafting
- application workflow
- follow-up tracking
- analytics
- action prioritization

### Explicitly out of scope right now

- frontend UI
- hosted backend
- cloud sync
- email sending
- ATS integrations
- browser automation
- collaborative multi-user usage

Those can come later, but the current MVP is intentionally centered on a strong local CLI workflow.

---

## Current Top-Level Product Surface

The repo exposes a single CLI entrypoint through [`src/cli.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/cli.ts).

Current commands from [`package.json`](/Users/anishpav/Anish_Personal_projects/my-service/package.json):

- `npm run scan`
- `npm run import`
- `npm run review`
- `npm run stats`
- `npm run today`
- `npm run next`
- `npm run draft`
- `npm run drafts`
- `npm run apply`
- `npm run followups`
- `npm run profile`

Support scripts:

- `npm run build`
- `npm run dev`
- `npm run cli`
- `npm run test`
- `npm run typecheck`

This is now a clean and coherent command surface.

---

## Current File Structure

### Config

- [`config/scoring.ts`](/Users/anishpav/Anish_Personal_projects/my-service/config/scoring.ts)

### CLI entrypoint

- [`src/cli.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/cli.ts)

### Commands

- [`src/commands/apply.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/apply.ts)
- [`src/commands/draft.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/draft.ts)
- [`src/commands/drafts.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/drafts.ts)
- [`src/commands/followups.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/followups.ts)
- [`src/commands/import.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/import.ts)
- [`src/commands/profile.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/profile.ts)
- [`src/commands/review.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/review.ts)
- [`src/commands/scan.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/scan.ts)
- [`src/commands/stats.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/stats.ts)
- [`src/commands/today.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/today.ts)

### Candidate config

- [`src/config/profile.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/config/profile.ts)
- [`src/config/types.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/config/types.ts)

### Persistence

- [`src/db/index.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/index.ts)
- [`src/db/repositories.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/repositories.ts)
- [`src/db/schema.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/schema.ts)
- [`src/db/types.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/types.ts)

### Filtering and ingestion

- [`src/filter/jobs.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/filter/jobs.ts)
- [`src/ingest/normalize.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/normalize.ts)
- [`src/ingest/yc.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/yc.ts)

### Scoring

- [`src/score/scorer.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/score/scorer.ts)

### Tests

- [`tests/apply.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/apply.test.ts)
- [`tests/db.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/db.test.ts)
- [`tests/drafts.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/drafts.test.ts)
- [`tests/followups.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/followups.test.ts)
- [`tests/import.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/import.test.ts)
- [`tests/migration.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/migration.test.ts)
- [`tests/profile.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/profile.test.ts)
- [`tests/review.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/review.test.ts)
- [`tests/scan.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/scan.test.ts)
- [`tests/stats.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/stats.test.ts)
- [`tests/today.test.ts`](/Users/anishpav/Anish_Personal_projects/my-service/tests/today.test.ts)

---

## Architecture Overview

The architecture now has a clear flow:

`profile -> ingest/import -> normalize -> score -> persist -> review -> draft/apply/follow-up -> analytics -> daily action queue`

That is the biggest architectural success in the repo.

Each area has a clear responsibility:

- `commands/`: CLI UX and orchestration
- `config/`: candidate profile and tunable settings
- `db/`: schema, migrations, repositories, types
- `ingest/`: source-specific fetch and normalization
- `filter/`: review filtering
- `score/`: ranking logic
- `tests/`: regression protection

This is a clean MVP architecture.

---

## Source Of Truth

SQLite is the source of truth.

That matters because the repo has moved beyond temporary JSON snapshots and now maintains durable state for:

- opportunities
- applications
- follow-ups
- drafts
- analytics inputs
- workflow history

JSON still exists where it makes sense:

- `data/profile.json` for a lightweight candidate profile
- `data/yc_hiring_raw.json` for optional raw source debugging

But the operational system of record is SQLite.

---

## Database Audit

The database is initialized via [`src/db/index.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/index.ts) and schema management lives in [`src/db/schema.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/schema.ts).

### Current database file

- `data/job_hunt.db`

### Tables

#### `job_sources`

Purpose:

- store source/provider identity for ingested jobs

Important fields:

- `provider`
- `external_id`
- `url`

Used for:

- distinguishing YC vs manual import
- maintaining a stable source key

#### `scans`

Purpose:

- persist each ingestion run

Important fields:

- `provider`
- `started_at`
- `completed_at`
- `raw_count`
- `valid_count`

Used for:

- historical scan tracking
- future observability

#### `jobs`

Purpose:

- store normalized opportunities

Important fields:

- source and scan identity
- `external_key`
- `role_external_id`
- `role_source`
- `company_name`
- `title`
- `summary`
- `website`
- `locations`
- `remote_flag`
- `job_url`
- `regions_json`
- `tags_json`
- `industries_json`
- `stage`
- `batch`
- `team_size`
- `seniority_hint`
- `compensation_min`
- `compensation_max`
- `compensation_currency`
- `compensation_period`
- `extracted_skills_json`
- `top_company`
- `is_hiring`
- `score`
- `score_reasons_json`
- `score_breakdown_json`
- `explanation_bullets_json`
- `risk_bullets_json`
- `status`

This is the core opportunity model in the system.

#### `applications`

Purpose:

- store the current application/workflow state for each opportunity

Important fields:

- `job_id`
- `applied_at`
- `status`
- `notes`
- `applied_url`
- `resume_version`
- `outreach_draft_version`
- `response_received`
- `response_type`
- `interview_stage`
- `rejection_reason`
- `last_contacted_at`

This lets the repo represent a job hunt as a real workflow rather than a ranked list.

#### `application_events`

Purpose:

- provide a durable history of application changes

Important fields:

- `application_id`
- `event_type`
- `previous_status`
- `next_status`
- `note`
- `metadata_json`
- `created_at`

Used for:

- status transition durability
- follow-up audit history
- richer analytics later
- preserving context over time

#### `followups`

Purpose:

- store pending and resolved follow-up reminders

Important fields:

- `job_id`
- `application_id`
- `due_at`
- `status`
- `note`

Supports:

- pending follow-ups
- completed follow-ups
- skipped follow-ups
- rescheduled follow-ups

#### `drafts`

Purpose:

- persist generated outreach/application draft variants

Important fields:

- `job_id`
- `application_id`
- `variant`
- `generated_content`
- `edited_content`
- timestamps

Used for:

- preserving drafts across sessions
- maintaining draft variants
- connecting drafts to workflow state

### Migration story

The repo includes migration support for:

- older `jobs` tables
- older `applications` tables
- older `drafts` tables
- adding newer score and skill columns
- adding application outcome fields
- adding draft application linkage

This is a very important maturity signal for the repo. It means the local database can evolve without forcing a reset.

---

## Candidate Profile Audit

Candidate profile support lives in:

- [`src/commands/profile.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/profile.ts)
- [`src/config/profile.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/config/profile.ts)
- [`src/config/types.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/config/types.ts)

### Current profile capabilities

- accept `.pdf` resumes
- accept `.txt` resumes
- extract text from PDF
- attempt AI extraction if `ANTHROPIC_API_KEY` is present
- fall back to local heuristic extraction if AI is unavailable or fails
- validate extracted data with Zod
- save normalized profile to `data/profile.json`

### Current profile schema

- `name`
- `skills_tier1`
- `skills_tier2`
- `domains`
- `years_of_experience`
- `location`
- `preferences.remote`
- `preferences.healthcare`
- `preferences.early_stage`

### Why this matters

This is how the system personalizes scoring. It makes the repo candidate-aware rather than generic.

### Current tradeoff

The profile remains file-based rather than DB-backed.

That is a reasonable MVP decision because:

- it keeps persistence scope small
- it is easy to inspect and edit manually
- it is stable enough for a single-user local workflow

---

## Ingestion Audit

Ingestion lives in:

- [`src/ingest/yc.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/yc.ts)
- [`src/ingest/normalize.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/normalize.ts)
- [`src/commands/scan.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/scan.ts)
- [`src/commands/import.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/import.ts)

### YC ingestion features

- fetch YC hiring data
- validate upstream payloads
- skip malformed records instead of crashing
- persist raw YC payload to `data/yc_hiring_raw.json`
- normalize YC company-level or role-level structures
- upsert records into SQLite
- record scan metadata

### Role-level ingestion features

- store actual roles when role data exists
- preserve company-level fallback rows when the source is sparse
- normalize role title
- normalize role URL
- normalize description
- normalize location
- normalize remote flag
- normalize seniority hints
- normalize compensation hints if present
- extract skills from title, summary, tags, industries, and description

### Manual import features

- import JSON arrays of roles
- import CSV files of roles
- validate incoming rows
- skip invalid rows while keeping valid ones
- normalize imported rows into the same job schema
- score imported jobs with the same scoring model
- persist imported jobs under a provider like `manual`

### Why this matters

This gives the system two important strengths:

- a live source for recurring discovery
- a manual path that makes the repo useful beyond YC

---

## Normalization Audit

Normalization is one of the most important parts of the repo.

Its job is to convert messy external input into one internal opportunity model.

Current normalization covers:

- company name
- role title
- role URL / job URL
- summary / description
- location text
- remote flag
- stage
- batch
- team size
- tags
- industries
- seniority hints
- compensation hints
- extracted skills
- source identity
- fallback handling when role-level detail is absent

This is what allows `review`, `apply`, `draft`, `stats`, and `today` to operate over one coherent schema.

---

## Scoring Audit

Scoring lives in:

- [`src/score/scorer.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/score/scorer.ts)
- [`config/scoring.ts`](/Users/anishpav/Anish_Personal_projects/my-service/config/scoring.ts)

### Current scoring dimensions

The total score is broken into:

- `roleFit`
- `stackFit`
- `seniorityFit`
- `freshness`
- `companySignal`

### What the system stores per job

- total score
- score reasons
- score breakdown JSON
- explanation bullets
- risk bullets

### What scoring is trying to answer

Not just:

- "Is this a good job?"

But:

- "Is this a good role for this candidate right now?"

### Signals represented in current scoring

- title and role-family match
- candidate skill overlap
- domain overlap
- seniority alignment
- hiring freshness
- stage and company-quality hints
- remote friendliness
- compensation visibility
- source and company signals

### Why the score design is good

- it is interpretable
- it is tunable
- it is not a black box
- it supports explanation in the review surface
- it supports action prioritization later

### Current limitations

- still heuristic
- not based on true role outcome learning yet
- depends on source richness
- seniority and freshness are still inferred coarsely

These are acceptable MVP constraints.

---

## Review Audit

Review lives in [`src/commands/review.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/review.ts).

### Current review features

- list ranked opportunities from SQLite
- filter by query
- filter by minimum score
- filter by status
- filter by remote-only
- support a `--today` jobs-focused review filter
- show role/company summary
- show total score
- show score breakdown
- show top reasons
- show top risk
- show extracted skills
- show recommended next action

### Review quality improvements already implemented

- prefers actual role rows over company fallback rows when possible
- surfaces positives and risks together
- exposes a next-step recommendation
- supports action-oriented filtering

### What review is good at now

- helping the user decide what to inspect
- helping the user decide whether a role looks promising
- making the score legible rather than mysterious

### What review does not yet do

- multi-column TUI workflows
- grouped saved searches
- interactive triage UI
- direct note editing inside review

Those are possible future upgrades, not missing MVP basics.

---

## Daily Action Queue Audit

The daily action queue lives in [`src/commands/today.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/today.ts).

This is one of the most product-leverage-heavy features in the repo.

### Current `today` / `next` capabilities

- aggregate due follow-ups
- aggregate drafted-but-unsent applications
- aggregate strong unapplied roles
- rank actions by urgency plus opportunity quality
- show concise reasons
- show one surfaced risk
- show a recommended next step

### Why this feature matters

This changes the repo from:

- a tracker

into:

- a daily operating system

It answers:

- "What should I do right now?"

That is one of the strongest product ideas in the system.

---

## Drafting Audit

Draft support lives in:

- [`src/commands/draft.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/draft.ts)
- [`src/commands/drafts.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/drafts.ts)

### Current drafting features

- generate a role-aware outreach draft
- customize draft copy from stored job context
- optionally save generated drafts to SQLite
- support multiple named variants
- store edited content separately from generated content
- list saved drafts
- show a saved draft
- attach drafts to jobs
- attach drafts to applications when one exists
- record draft save/update events in application history when applicable

### Why this matters

This makes drafting durable instead of ephemeral.

That is important because job search work is iterative. A good operating system should not lose draft work between sessions.

---

## Application Workflow Audit

Application workflow support lives primarily in:

- [`src/commands/apply.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/apply.ts)
- [`src/commands/followups.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/followups.ts)
- [`src/db/repositories.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/repositories.ts)

### Current application states

- `saved`
- `shortlisted`
- `drafted`
- `applied`
- `followup_due`
- `responded`
- `replied`
- `interview`
- `rejected`
- `archived`

### Current application features

- create or update application state
- store notes
- store applied URL
- store resume version
- store outreach draft version
- store response status
- store response type
- store interview stage
- store rejection reason
- store last contacted timestamp
- create follow-ups from application updates
- keep jobs and applications in sync at the workflow level

### Event history features

Every important workflow update is recorded durably:

- status changes
- follow-up creation
- follow-up completion
- follow-up skipping
- follow-up rescheduling
- draft saved / updated when tied to an application

That makes the system auditable and much more trustworthy over time.

---

## Follow-Up Audit

Follow-up support lives in [`src/commands/followups.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/followups.ts).

### Current follow-up features

- list pending follow-ups
- mark follow-up done
- skip follow-up
- reschedule follow-up
- attach notes to follow-up updates
- record those updates as application events when possible

### Why this matters

Follow-through is a huge part of real-world job hunts. This is one of the features that makes the repo operational rather than merely analytical.

---

## Outcome Tracking Audit

Outcome tracking is built into the application model and analytics flow.

### Current outcome fields

- `response_received`
- `response_type`
- `interview_stage`
- `rejection_reason`
- `last_contacted_at`

### Why this matters

This is what makes analytics meaningful later. Without outcome fields, there is no real feedback loop between discovery and results.

---

## Analytics Audit

Analytics lives in [`src/commands/stats.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/stats.ts).

### Current analytics features

- show funnel counts for:
  - saved
  - applied
  - replied
  - interview
- show score-range breakdowns
- show source breakdowns
- compute conversion-style metrics from workflow state

### Why this matters

This lets the user learn from the process:

- are high-score jobs converting better?
- is one source performing better than another?
- where is the funnel collapsing?

That is a meaningful step toward a self-improving operating system.

---

## Current End-To-End Workflows

### Workflow 1: set up profile

1. run `npm run profile -- /path/to/resume.pdf`
2. inspect or edit `data/profile.json`

### Workflow 2: ingest opportunities

1. run `npm run scan`
2. or run `npm run import -- ./roles.json`
3. or run `npm run import -- ./roles.csv --format csv`

### Workflow 3: review and triage

1. run `npm run review`
2. optionally filter by score, remote, status, or query
3. decide whether to save, shortlist, or draft

### Workflow 4: draft outreach

1. run `npm run draft -- "Role Name"`
2. optionally save the draft with `--save --variant v1`
3. review saved drafts with `npm run drafts -- list`

### Workflow 5: update application state

1. run `npm run apply -- "Role Name" --status drafted`
2. later run `npm run apply -- "Role Name" --status applied --applied-url ...`
3. track status changes over time

### Workflow 6: manage follow-ups

1. run `npm run followups`
2. mark due items done
3. skip or reschedule when needed

### Workflow 7: see what matters today

1. run `npm run today`
2. or run `npm run next`
3. follow the ranked action queue

### Workflow 8: review outcomes

1. run `npm run stats`
2. inspect funnel and breakdowns
3. use that to tune search and scoring

---

## Complete Feature Inventory

Below is a consolidated feature list of what the project currently supports.

### Core platform features

- CLI-first architecture
- SQLite persistence
- migration-safe schema evolution
- single local-user workflow
- structured test suite
- tunable config

### Profile features

- resume ingestion from `.pdf`
- resume ingestion from `.txt`
- AI-assisted profile extraction if configured
- heuristic fallback profile extraction
- structured candidate profile persistence
- manual profile editing

### Ingestion features

- YC hiring feed fetch
- source validation with Zod
- raw payload persistence
- scan run persistence
- manual JSON import
- manual CSV import
- invalid-row skipping
- provider-aware ingestion

### Role/opportunity modeling features

- role-level storage
- company fallback storage
- normalized role title
- normalized job URL
- normalized summary
- normalized location
- normalized remote flag
- normalized seniority hints
- normalized compensation hints
- extracted skills persistence

### Scoring features

- role fit score
- stack fit score
- seniority fit score
- freshness score
- company signal score
- total score persistence
- score reasons persistence
- explanation bullets
- risk bullets
- config-driven tuning

### Review features

- ranked review
- query filter
- min-score filter
- status filter
- remote-only filter
- jobs-focused today filter
- role prioritization over company fallback rows
- score breakdown display
- reasons display
- risk display
- next action recommendation

### Draft features

- generate outreach drafts
- role-aware draft content
- save draft variants
- persist edited content
- list drafts
- show drafts
- link drafts to jobs
- link drafts to applications
- event logging on draft persistence

### Application workflow features

- saved state
- shortlisted state
- drafted state
- applied state
- followup_due state
- responded state
- replied state
- interview state
- rejected state
- archived state
- notes
- applied URL
- resume version
- outreach draft version
- current application record
- workflow status sync with jobs

### Event-history features

- durable status change logging
- metadata on application events
- follow-up created events
- follow-up done events
- follow-up skipped events
- follow-up rescheduled events
- draft saved events
- draft updated events

### Follow-up features

- create follow-ups automatically
- list pending follow-ups
- complete follow-ups
- skip follow-ups
- reschedule follow-ups
- add follow-up notes

### Outcome tracking features

- response received flag
- response type
- interview stage
- rejection reason
- last contacted timestamp

### Analytics features

- conversion funnel counts
- score-range breakdown
- source breakdown
- status-derived pipeline analytics

### Daily operating features

- `today` command
- `next` alias
- cross-workflow action ranking
- urgency-aware prioritization
- quality-aware prioritization
- concise reason surfacing
- one-risk surfacing
- recommended next-step surfacing

---

## What You Have Done So Far

This section summarizes the major product and engineering work already completed in the repo.

### 1. Chose a clear product direction

You moved the repo away from an ambiguous mixed-purpose state and made it clearly about a CLI-first local job-hunt operating system.

### 2. Re-centered the codebase around the CLI

You introduced a single root CLI entrypoint and turned the repo into a coherent command-based product.

### 3. Made SQLite the source of truth

You replaced fragile JSON-only operational state with durable tables for jobs, scans, applications, follow-ups, drafts, and workflow history.

### 4. Preserved local-first simplicity

You kept the product simple:

- no frontend
- no cloud backend
- no deployment complexity
- no hosted state required

### 5. Built a real persistence layer

You added a proper schema, repository functions, and migration safety instead of keeping the system as ad hoc scripts.

### 6. Upgraded ingestion from company-only to role-aware

You extended the system so it can store real roles when available, while still keeping company-level fallback behavior.

### 7. Improved scoring quality

You turned scoring into a breakdown model instead of a flat score and made it explainable through reasons and risks.

### 8. Improved review quality

You made review actionable by surfacing:

- reasons
- risks
- skills
- next actions

### 9. Added deeper workflow state

You expanded application states far beyond "applied" and gave the system a meaningful workflow model.

### 10. Added durable history

You made workflow history durable through an event table, which is one of the most important maturity upgrades in the repo.

### 11. Added follow-up management

You made follow-ups updateable and persistent, which reflects real job-hunt behavior rather than static tracking.

### 12. Added manual import

You gave the repo a path beyond YC-only usage by supporting CSV and JSON role import.

### 13. Added draft persistence

You made drafts durable, variant-aware, and tied them into application context.

### 14. Added outcome tracking

You captured replies, interviews, rejections, and contact timing so the repo can learn from real results.

### 15. Added analytics

You introduced funnel and breakdown metrics so the system can quantify what is and is not working.

### 16. Added a daily operating surface

You implemented `today` / `next`, which is probably the highest-leverage UX feature in the repo because it answers the user’s daily question:

- "What should I do now?"

### 17. Added strong regression protection

You built out a test suite that now covers:

- DB behavior
- migrations
- scanning
- review
- draft persistence
- apply flow
- follow-ups
- import validation
- analytics
- daily action ranking
- profile extraction

That is a very healthy sign for an MVP.

---

## Current Strengths

### Clear product identity

The repo has a clear purpose now. That alone is a huge improvement over a mixed experiment.

### Good architecture for the current stage

The folder structure, persistence model, and command boundaries are all sensible.

### Durable local state

SQLite is the right choice here.

### Explainable scoring

The ranking system is understandable and tunable.

### Real workflow support

This is not just discovery; it supports actual application execution.

### Good operational ergonomics

The `today`/`next` command is especially strong.

### Migration awareness

Schema evolution is being handled responsibly.

### Strong tests

The repo is protected against regression much better than most personal tools at this stage.

---

## Current Weak Spots

### Source quality is still a limiting factor

YC data may still be company-heavy rather than richly role-heavy, which means role-level detail can be sparse depending on upstream data quality.

### Drafting is still template-driven

Draft generation is useful, but it is still fundamentally a templated drafting system rather than a richer context-aware writing assistant.

### Analytics are descriptive, not yet prescriptive

The system can show funnel and breakdowns, but it does not yet use historical outcomes to adapt scoring weights automatically.

### One-application-per-job remains a simplifying assumption

That is fine for MVP, but it could become limiting if you want multiple attempts, multiple channels, or richer contact workflows.

### Review and daily workflows are still plain-text CLI

This is intentional, but there is still room to improve information density and ergonomics inside the terminal.

### No outbound action integrations

The system tracks and drafts work, but it does not actually send email, submit applications, or log browser-side activity.

---

## Current Risks

### Risk 1: data-source sparsity

If upstream sources do not provide role-level detail consistently, ranking quality may depend heavily on fallback normalization.

### Risk 2: heuristic drift

Scoring is still hand-tuned. If your target roles change, the config will need tuning to keep rankings sharp.

### Risk 3: event/history depth may become a bottleneck

As the workflow gets richer, application history may need stronger querying and reporting patterns.

### Risk 4: CLI discoverability

As commands and flags grow, onboarding and command discoverability become more important.

These are manageable risks, not red flags.

---

## What Is Already Good Enough To Use Daily

The repo is already strong enough for daily use in the following loop:

- maintain profile
- scan or import roles
- review top opportunities
- draft outreach
- mark progress
- manage follow-ups
- check daily queue
- inspect stats weekly

That is a complete working MVP loop.

---

## What Would Likely Be The Next High-Leverage Upgrades

This section is not a request to implement anything now. It is a strategic audit view of likely next leverage.

### P0: workflow ergonomics

- add command help polish and examples
- add more explicit shortlist/hide/archive commands
- improve query ergonomics for finding exact roles quickly

### P1: better learning loop

- make analytics feed back into scoring tuning
- add source and score cohort outcome comparisons
- add notes or reasoning on why applications were pursued

### P1: richer manual curation

- add company blacklist
- add hide / snooze
- add resume-to-role matching notes
- add explicit "not interested" state

### P2: outbound integrations

- email export helpers
- application link openers
- richer draft templates
- browser-side helpers

### P2: more sources

- careers page import
- lightweight scraping adapters
- source-specific importers

---

## Bottom Line

This repo has evolved into a real CLI-first job-hunt operating system MVP.

It currently supports:

- profile extraction
- role ingestion
- role normalization
- configurable scoring
- ranked review
- risk-aware recommendations
- draft persistence
- application workflow
- event history
- follow-up tracking
- outcome tracking
- analytics
- daily action prioritization

The most important accomplishment is not any single command. It is that the repo now has a coherent operating model.

Instead of a bag of scripts, it is now a structured local system for running a job search.

That is the central success of the project so far.
