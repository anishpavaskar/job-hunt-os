# Step 0 Audit: Current Codebase Map

This document is a current-state orientation audit for `job-hunt-os`. It focuses on the exact areas requested in Prompt 0:

- the normalized `jobs` table schema
- the scoring dimensions and how they consume profile data
- the YC ingester pattern from fetch to upsert
- the current `profile.json` schema and how scoring reads it

This reflects the repo as it exists now, not the earlier roadmap wording in [`CODEBASE_MAP.md`](/Users/anishpav/Anish_Personal_projects/my-service/CODEBASE_MAP.md).

## 1. Normalized Job Schema

The normalized job record lives in the SQLite `jobs` table defined in [`src/db/schema.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/schema.ts).

Each row is an opportunity. It may represent:

- a real role row when upstream role data exists
- a fallback company-level hiring row when the source is company-shaped

### `jobs` table fields

- `id`
  - SQLite primary key

- `source_id`
  - foreign key to `job_sources`
  - identifies the source/provider record for this opportunity

- `scan_id`
  - foreign key to `scans`
  - identifies which scan run last wrote this row

- `external_key`
  - unique stable key for the stored opportunity
  - examples:
    - `company:slug`
    - `role:slug:role-id`

- `role_external_id`
  - source-native role ID when available

- `role_source`
  - describes where the role row came from
  - current important values:
    - `role`
    - `company_fallback`
    - imported role-style values from manual import paths

- `company_name`
  - normalized company display name

- `title`
  - role title when available
  - nullable for company fallback rows

- `summary`
  - normalized summary text used heavily in scoring and review
  - for real roles this comes from role description when available
  - for fallback rows this comes from company one-liner / description

- `website`
  - company website

- `locations`
  - normalized location text

- `remote_flag`
  - integer boolean
  - `1` when remote is inferred or explicit

- `job_url`
  - role apply/listing URL when available
  - falls back to company/source URL when needed

- `regions_json`
  - JSON array stored as text
  - normalized source regions

- `tags_json`
  - JSON array stored as text
  - source tags or department-style labels

- `industries_json`
  - JSON array stored as text
  - industry/domain classification from source

- `stage`
  - company stage

- `batch`
  - source batch label
  - especially important for YC freshness scoring

- `team_size`
  - nullable numeric size signal

- `seniority_hint`
  - normalized text hint for level/seniority

- `compensation_min`
  - nullable minimum compensation

- `compensation_max`
  - nullable maximum compensation

- `compensation_currency`
  - nullable currency code/text

- `compensation_period`
  - nullable period hint like yearly / hourly

- `extracted_skills_json`
  - JSON array stored as text
  - derived from title + description + tags + industries

- `top_company`
  - integer boolean quality signal

- `is_hiring`
  - integer boolean

- `score`
  - total fit score from the current scorer

- `score_reasons_json`
  - JSON array of machine-readable reason strings
  - examples:
    - `role_fit:12`
    - `stack_fit:20`

- `score_breakdown_json`
  - JSON object with the category-level breakdown

- `explanation_bullets_json`
  - JSON array of concise positive bullets for review surfaces

- `risk_bullets_json`
  - JSON array of concise risk bullets for review surfaces

- `status`
  - current workflow state at the job level
  - examples:
    - `new`
    - `saved`
    - `shortlisted`
    - `drafted`
    - `applied`
    - `followup_due`
    - `replied`
    - `interview`
    - `rejected`
    - `archived`

- `created_at`
  - SQLite timestamp

- `updated_at`
  - SQLite timestamp

### How jobs are normalized before storage

Normalization is defined in [`src/ingest/normalize.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/normalize.ts).

The internal normalized shape before DB upsert is `NormalizedOpportunity`, with:

- `externalKey`
- `roleExternalId`
- `roleSource`
- `title`
- `summary`
- `locations`
- `remoteFlag`
- `jobUrl`
- `seniorityHint`
- `compensationMin`
- `compensationMax`
- `compensationCurrency`
- `compensationPeriod`
- `extractedSkills`

That normalized shape is then converted into a DB upsert input by `toJobUpsertInput(...)`.

## 2. Scoring Dimensions And Profile Usage

Scoring lives in [`src/score/scorer.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/score/scorer.ts).

The scorer computes 5 dimensions, then sums them into a total score capped at 100.

The weights come from [`config/scoring.ts`](/Users/anishpav/Anish_Personal_projects/my-service/config/scoring.ts):

- `roleFit`: `25`
- `stackFit`: `30`
- `seniorityFit`: `15`
- `freshness`: `10`
- `companySignal`: `20`

### A. `roleFit`

Purpose:

- estimate whether the opportunity text looks like the kind of role the candidate wants

Inputs:

- normalized opportunity title
- normalized opportunity summary
- role-family keyword groups from `ROLE_KEYWORDS`
- profile role and capability signals

How it works:

- builds a lowercased text corpus from `title + summary`
- checks hits against built-in role-family keyword groups:
  - platform
  - backend
  - devops
  - data
  - ai
- only counts a role-family hit strongly if the profile corpus also contains that family’s terms
- profile corpus is built from:
  - `skills_tier1`
  - `skills_tier2`
  - `domains`
- adds a direct boost for matches against `profile.target_roles`
- adds a small boost if:
  - `preferences.healthcare` is true and text contains health-related terms
  - `preferences.remote` is true and the opportunity is remote

Profile fields consumed directly:

- `target_roles`
- `skills_tier1`
- `skills_tier2`
- `domains`
- `preferences.healthcare`
- `preferences.remote`

### B. `stackFit`

Purpose:

- estimate technical and domain overlap

Inputs:

- normalized role/company text from:
  - title
  - summary
  - company one-liner
  - company long description
  - company tags
  - company industries

How it works:

- matches the text against:
  - `skills_tier1`
  - `skills_tier2`
  - `domains`
  - `practices`
- also matches against built-in `RESUME_KEYWORDS` from config
- weighted roughly as:
  - tier 1 skill hit: `4`
  - tier 2 skill hit: `2`
  - domain hit: `3`
  - practice hit: `3`
  - built-in resume keyword hit: `2`

Profile fields consumed directly:

- `skills_tier1`
- `skills_tier2`
- `domains`
- `practices`

### C. `seniorityFit`

Purpose:

- estimate fit between the role’s level and the candidate’s likely level

Inputs:

- normalized `seniority_hint`
- profile years of experience

How it works:

- infers candidate seniority from `years_of_experience`
  - missing years defaults to `mid`
  - `>= 5` years => `senior`
  - `>= 2` years => `mid`
  - otherwise => `junior`
- checks `seniority_hint` against config keyword groups:
  - junior
  - mid
  - senior
- if no seniority hint exists, returns a neutral half-weight score

Profile fields consumed directly:

- `years_of_experience`

### D. `freshness`

Purpose:

- estimate how actionable or recent the opportunity is

Inputs:

- company batch
- company `isHiring`

How it works:

- recent batch in `RECENT_BATCHES` => boost
- actively hiring => boost

Profile fields consumed directly:

- none

### E. `companySignal`

Purpose:

- estimate company quality and practical attractiveness

Inputs:

- `top_company`
- stage
- team size
- remote flag
- compensation presence
- company locations / regions
- healthcare tags
- profile location preferences

How it works:

- boosts:
  - top YC companies
  - growth-stage companies
  - small early-stage teams
  - remote opportunities
  - disclosed compensation
  - Bay Area / US location
  - healthcare-tagged companies
- then adds a profile-aware location adjustment:
  - direct location match to candidate location
  - relocation willingness
  - hybrid preference if the company has location signal

Profile fields consumed directly:

- `location`
- `preferences.hybrid`
- `preferences.relocation`

Profile fields indirectly relevant through other dimensions:

- `preferences.healthcare`

### Score outputs written per job

For each scored opportunity, the system stores:

- total `score`
- `score_reasons_json`
- `score_breakdown_json`
- `explanation_bullets_json`
- `risk_bullets_json`

These outputs power:

- `review`
- `today`
- `next`
- filtering and prioritization

## 3. YC Ingester Interface Pattern

The YC ingest flow spans:

- [`src/ingest/yc.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/yc.ts)
- [`src/ingest/normalize.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/normalize.ts)
- [`src/commands/scan.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/scan.ts)
- repository upsert functions in [`src/db/repositories.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/repositories.ts)

The current interface pattern is:

1. fetch raw source data
2. validate source rows with Zod
3. persist raw payload for debugging
4. normalize roles or fallback company opportunities
5. score each normalized opportunity with the candidate profile
6. upsert source records and jobs into SQLite
7. record scan metadata

### A. Fetch

In [`src/ingest/yc.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/yc.ts):

- source URL:
  - `https://yc-oss.github.io/api/companies/hiring.json`
- `fetchYcCompanies(cwd?)`:
  - fetches the JSON payload
  - checks HTTP status
  - validates that the top-level result is an array

### B. Validate

Validation uses two schemas:

- `ycCompanySchema`
- `ycRoleSchema`

`ycCompanySchema` validates company-level fields like:

- `name`
- `slug`
- `website`
- `all_locations`
- `one_liner`
- `long_description`
- `team_size`
- `tags`
- `top_company`
- `isHiring`
- `batch`
- `industries`
- `regions`
- `stage`
- `url`
- optional nested role containers:
  - `roles`
  - `jobs`
  - `openings`

`ycRoleSchema` validates potential nested role objects with fields like:

- `id`
- `title`
- `description`
- `location`
- `locations`
- `remote`
- `remote_ok`
- `remote_allowed`
- `url`
- `job_url`
- `apply_url`
- compensation fields
- seniority fields

Validation behavior:

- invalid companies are skipped silently at fetch time
- invalid role-like nested objects are filtered out in scan time
- the process does not crash on malformed nested role records

### C. Persist raw source payload

`fetchYcCompanies(...)` writes the raw payload to:

- `data/yc_hiring_raw.json`

This is useful for:

- debugging source changes
- inspecting the raw YC feed
- understanding why role rows may or may not be present

### D. Normalize

In [`src/commands/scan.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/scan.ts):

- scan loads the profile with `loadProfile()`
- scan creates a new scan row with `createScan(...)`
- scan fetches companies through `fetchYcCompanies()`

For each company:

- `upsertJobSource(...)` creates or updates the `job_sources` record
- it collects nested candidates from:
  - `company.roles`
  - `company.jobs`
  - `company.openings`
- each nested item is validated with `ycRoleSchema.safeParse(...)`
- only items with at least some useful role fields are kept

Then one of two normalization paths runs:

#### Role path

If candidate roles exist:

- `normalizeRoleOpportunity(company, role, index)`
- produces a role-level `NormalizedOpportunity`

#### Fallback path

If no candidate roles exist:

- `normalizeCompanyFallback(company)`
- produces a company-level fallback opportunity

This is why the system can still work even when YC returns mostly company-shaped data.

### E. Score

Each normalized opportunity is scored with:

- `scoreOpportunity(company, opportunity, profile)`

This is where profile-aware ranking happens.

### F. Upsert

The scored normalized opportunity is converted into a DB input with:

- `toJobUpsertInput(company, opportunity, sourceId, scanId, scoring)`

Then persisted with:

- `upsertJob(...)`

Important repository behavior:

- `upsertJobSource(...)`
  - keeps a stable per-provider source row

- `upsertJob(...)`
  - inserts or updates by `external_key`
  - refreshes mutable fields like:
    - summary
    - remote flag
    - compensation
    - score
    - explanations
    - risks

### G. Complete scan metadata

At the end of the run:

- `completeScan(...)` writes:
  - raw count
  - valid count
  - completed timestamp

### Summary of the ingester pattern

The current YC pattern is:

- `yc.ts` owns source fetch + top-level validation + raw payload persistence
- `normalize.ts` owns source-to-normalized-opportunity transformation
- `scan.ts` owns orchestration, profile loading, score application, and DB writes
- `repositories.ts` owns durable persistence

That is the current ingest interface pattern in this repo.

## 4. `profile.json` Schema And Scorer Inputs

The profile schema lives in [`src/config/types.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/config/types.ts).

It is loaded from disk by [`src/config/profile.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/config/profile.ts).

Current profile path:

- `data/profile.json`

### Supported profile shape

```json
{
  "name": "ANISH PAVASKAR",
  "target_roles": [
    "Backend Engineer",
    "Platform Engineer"
  ],
  "skills_tier1": [
    "Python",
    "Go",
    "Kubernetes"
  ],
  "skills_tier2": [
    "Prometheus",
    "Grafana"
  ],
  "domains": [
    "Backend Engineering",
    "Cloud Infrastructure"
  ],
  "practices": [
    "CI/CD",
    "Microservices"
  ],
  "years_of_experience": 3,
  "location": "Milpitas, CA",
  "preferences": {
    "remote": true,
    "hybrid": true,
    "healthcare": true,
    "early_stage": true,
    "relocation": true
  }
}
```

### Field-by-field meaning

- `name`
  - candidate display name

- `target_roles`
  - role-family labels the candidate wants
  - directly boosts `roleFit`

- `skills_tier1`
  - strongest core skills
  - heavily used in `stackFit`
  - also contributes indirectly to `roleFit` corpus matching

- `skills_tier2`
  - secondary skills
  - used in `stackFit`
  - also contributes indirectly to `roleFit` corpus matching

- `domains`
  - problem/domain areas
  - used in `stackFit`
  - also contributes indirectly to `roleFit`

- `practices`
  - engineering practices like:
    - `CI/CD`
    - `Microservices`
    - `Distributed Systems`
    - `Observability`
  - used in `stackFit`

- `years_of_experience`
  - used in `seniorityFit`
  - if omitted, seniority defaults to neutral mid-level

- `location`
  - used in profile-aware location/company scoring

- `preferences.remote`
  - boosts role fit for remote opportunities

- `preferences.hybrid`
  - contributes to profile-aware company/location scoring

- `preferences.healthcare`
  - boosts role fit on health-related text

- `preferences.early_stage`
  - currently stored in profile and available for future tuning
  - not strongly consumed directly in the current scorer

- `preferences.relocation`
  - contributes to location/company scoring

### How the scorer reads the profile

Directly used in `scoreOpportunity(...)`:

- `target_roles`
- `skills_tier1`
- `skills_tier2`
- `domains`
- `practices`
- `years_of_experience`
- `location`
- `preferences.remote`
- `preferences.hybrid`
- `preferences.healthcare`
- `preferences.relocation`

Currently present but not strongly used in the numeric score:

- `preferences.early_stage`

### Practical takeaway

Today’s scorer is most sensitive to:

- your role intent
- your technical skills
- your domain fit
- your engineering practices
- your remote/location preferences
- your seniority

That means `profile.json` is not just metadata. It is the core personalization input for ranking.

## Closing Summary

The current codebase already has a clean separation of concerns:

- `yc.ts` fetches and validates
- `normalize.ts` creates normalized opportunities
- `scan.ts` orchestrates profile-aware ingestion
- `scorer.ts` computes fit across five dimensions
- `schema.ts` defines the durable normalized job model
- `profile.json` provides the candidate-specific input that personalizes ranking

The most important current architectural fact is this:

the system does not score “jobs in the abstract.” It scores normalized opportunities against a candidate profile, then stores both the total score and the explanation structure needed for review and daily action workflows.
