# PROMPT D: DATABASE TRUTH TABLE

## 1. Actual schema from the live DB

Command run:

```bash
sqlite3 data/job_hunt.db ".schema"
```

Output:

```sql
CREATE TABLE job_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, external_id)
    );
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      raw_count INTEGER NOT NULL DEFAULT 0,
      valid_count INTEGER NOT NULL DEFAULT 0
    , source_counts_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      scan_id INTEGER NOT NULL,
      external_key TEXT NOT NULL UNIQUE,
      role_external_id TEXT,
      role_source TEXT NOT NULL DEFAULT 'company_fallback',
      company_name TEXT NOT NULL,
      title TEXT,
      summary TEXT NOT NULL,
      website TEXT NOT NULL,
      locations TEXT NOT NULL,
      remote_flag INTEGER NOT NULL DEFAULT 0,
      job_url TEXT NOT NULL DEFAULT '',
      regions_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      industries_json TEXT NOT NULL,
      stage TEXT NOT NULL,
      batch TEXT NOT NULL,
      team_size INTEGER,
      seniority_hint TEXT,
      compensation_min INTEGER,
      compensation_max INTEGER,
      compensation_currency TEXT,
      compensation_period TEXT,
      extracted_skills_json TEXT NOT NULL DEFAULT '[]',
      top_company INTEGER NOT NULL,
      is_hiring INTEGER NOT NULL,
      score INTEGER NOT NULL,
      score_reasons_json TEXT NOT NULL,
      score_breakdown_json TEXT NOT NULL DEFAULT '{}',
      explanation_bullets_json TEXT NOT NULL DEFAULT '[]',
      risk_bullets_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), posted_at TEXT,
      FOREIGN KEY (source_id) REFERENCES job_sources(id),
      FOREIGN KEY (scan_id) REFERENCES scans(id)
    );
CREATE TABLE applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL UNIQUE,
      applied_at TEXT,
      status TEXT NOT NULL,
      notes TEXT,
      applied_url TEXT,
      resume_version TEXT,
      outreach_draft_version TEXT,
      response_received INTEGER NOT NULL DEFAULT 0,
      response_type TEXT,
      interview_stage TEXT,
      rejection_reason TEXT,
      last_contacted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );
CREATE TABLE application_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      previous_status TEXT,
      next_status TEXT,
      note TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id)
    );
CREATE TABLE followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      application_id INTEGER,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (application_id) REFERENCES applications(id)
    );
CREATE TABLE drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      application_id INTEGER,
      variant TEXT NOT NULL DEFAULT 'default',
      generated_content TEXT NOT NULL,
      edited_content TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), gmail_draft_id TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (application_id) REFERENCES applications(id),
      UNIQUE(job_id, variant)
    );
CREATE INDEX idx_jobs_score ON jobs(score DESC);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_source_id ON jobs(source_id);
CREATE INDEX idx_application_events_application_id ON application_events(application_id, created_at);
CREATE INDEX idx_followups_due ON followups(status, due_at);
CREATE INDEX idx_drafts_job_id ON drafts(job_id, updated_at DESC);
CREATE INDEX idx_drafts_application_id ON drafts(application_id, updated_at DESC);
CREATE TABLE baseline_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      effective_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE TABLE baseline_jobs (
      baseline_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      score_snapshot INTEGER NOT NULL,
      status_snapshot TEXT NOT NULL,
      role_source_snapshot TEXT NOT NULL,
      posted_at_snapshot TEXT,
      discovered_at_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (baseline_id, job_id),
      FOREIGN KEY (baseline_id) REFERENCES baseline_snapshots(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
CREATE INDEX idx_baseline_jobs_baseline_id ON baseline_jobs(baseline_id, score_snapshot DESC);
```

## 2. Row counts and live-column usage

### Table row counts

Command run:

```sql
SELECT 'job_sources', COUNT(*) FROM job_sources
UNION ALL SELECT 'scans', COUNT(*) FROM scans
UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'applications', COUNT(*) FROM applications
UNION ALL SELECT 'application_events', COUNT(*) FROM application_events
UNION ALL SELECT 'followups', COUNT(*) FROM followups
UNION ALL SELECT 'drafts', COUNT(*) FROM drafts
UNION ALL SELECT 'baseline_snapshots', COUNT(*) FROM baseline_snapshots
UNION ALL SELECT 'baseline_jobs', COUNT(*) FROM baseline_jobs;
```

Output:

```text
job_sources|1426
scans|17
jobs|7898
applications|0
application_events|0
followups|0
drafts|1
baseline_snapshots|1
baseline_jobs|36
```

### `job_sources`

```text
total_job_sources  provider_nonnull  external_id_nonnull  url_nonempty
-----------------  ----------------  -------------------  ------------
1426               1426              1426                 1426
```

Provider distribution:

```text
yc|1409
greenhouse|16
careers|1
```

### `scans`

```text
total_scans  provider_nonnull  started_at_nonnull  completed_at_nonnull  source_counts_nonnull
-----------  ----------------  ------------------  --------------------  ---------------------
17           17                17                  17                    17
```

### `jobs`

```text
total_jobs  source_id_nonnull  scan_id_nonnull  external_key_nonnull  title_nonnull  job_url_nonempty  posted_at_nonnull  score_reasons_nonnull  explanation_nonnull  risk_nonnull
----------  -----------------  ---------------  --------------------  -------------  ----------------  -----------------  ---------------------  -------------------  ------------
7898        7898               7898             7898                  6489           7898              566                7898                   7898                 7898
```

Role-source distribution:

```text
role_source       roles  companies
----------------  -----  ---------
greenhouse        6486   16
company_fallback  1409   1401
careers           3      1
```

### `applications`

```text
total_applications  job_id_nonnull  status_nonnull  applied_at_nonnull  last_contacted_nonnull
------------------  --------------  --------------  ------------------  ----------------------
0
```

### `application_events`

```text
total_events  application_id_nonnull  event_type_nonnull  metadata_nonnull
------------  ----------------------  ------------------  ----------------
0
```

### `followups`

```text
total_followups  job_id_nonnull  application_id_nonnull  due_at_nonnull  status_nonnull
---------------  --------------  ----------------------  --------------  --------------
0
```

### `drafts`

```text
total_drafts  job_id_nonnull  application_id_nonnull  variant_nonnull  generated_nonnull  gmail_draft_nonnull
------------  --------------  ----------------------  ---------------  -----------------  -------------------
1             1               0                       1                1                  0
```

### `baseline_snapshots`

```text
total_baseline_snapshots  label_nonnull  effective_date_nonnull
------------------------  -------------  ----------------------
1                         1              1
```

### `baseline_jobs`

```text
total_baseline_jobs  baseline_id_nonnull  job_id_nonnull  score_nonnull  posted_nonnull
-------------------  -------------------  --------------  -------------  --------------
36                   36                   36              36             0
```

## 3. The 3 highest-scored jobs right now

Command run:

```sql
SELECT * FROM jobs ORDER BY score DESC, updated_at DESC LIMIT 3;
```

Output:

```text
id     source_id  scan_id  external_key                   role_external_id  role_source       company_name  title                                               summary                                                         website                                                   locations                                                       remote_flag  job_url                                                   regions_json                                     tags_json                                               industries_json                            stage     batch        team_size  seniority_hint  compensation_min  compensation_max  compensation_currency  compensation_period  extracted_skills_json                                                                          top_company  is_hiring  score  score_reasons_json                                                                                                score_breakdown_json                                                                                     explanation_bullets_json                                                                                                                              risk_bullets_json                                    status  created_at           updated_at           posted_at
-----  ---------  -------  -----------------------------  ----------------  ----------------  ------------  --------------------------------------------------  --------------------------------------------------------------  --------------------------------------------------------  --------------------------------------------------------------  -----------  --------------------------------------------------------  -----------------------------------------------  ------------------------------------------------------  -----------------------------------------  --------  -----------  ---------  --------------  ----------------  ----------------  ---------------------  -------------------  ---------------------------------------------------------------------------------------------  -----------  ---------  -----  ----------------------------------------------------------------------------------------------------------------  -------------------------------------------------------------------------------------------------------  ----------------------------------------------------------------------------------------------------------------------------------------------------  ---------------------------------------------------  ------  -------------------  -------------------  ------------------------
311    311        14       company:confident-ai                             company_fallback  Confident AI                                                      The Leading LLM Eval and Observability Platform for AI Quality  https://confident-ai.com                                  San Francisco, CA, USA                                          0            https://www.ycombinator.com/companies/confident-ai        ["United States of America","America / Canada"]  ["Developer Tools","Generative AI","Open Source","AI"]  ["B2B","Engineering, Product and Design"]  Early     Winter 2025  7                                                                                                          ["Developer Tools","Infrastructure","Open Source","Generative AI","AI","observability","llm"]  0            1          54     ["role_fit:12","stack_fit:11","seniority_fit:7","freshness:10","company_signal:14"]                               {"roleFit":12,"stackFit":11,"seniorityFit":7,"freshness":10,"companySignal":14,"prospect_listed":false}  ["Fresh enough to prioritize from Winter 2025"]                                                                                                       ["Not clearly remote","Compensation not disclosed"]  new     2026-03-26 05:56:30  2026-03-26 23:43:38
17434  17381      15       greenhouse:scaleai:4665557005  4665557005        greenhouse        Scale AI      Infrastructure Software Engineer, Enterprise GenAI                                                                  https://job-boards.greenhouse.io/scaleai/jobs/4665557005  San Francisco, CA; New York, NY                                 0            https://job-boards.greenhouse.io/scaleai/jobs/4665557005  []                                               ["Infrastructure","AI"]                                 []                                         External  External                                                                                                                ["Infrastructure","AI"]                                                                        0            1          53     ["role_fit:24","stack_fit:0","seniority_fit:7","freshness:3","company_signal:19","Prospect-curated top startup"]  {"roleFit":24,"stackFit":0,"seniorityFit":7,"freshness":3,"companySignal":19,"prospect_listed":true}     ["Strong role fit for Infrastructure Software Engineer, Enterprise GenAI","Prospect-curated top startup","Matches one of your target role families"]  ["Not clearly remote","Compensation not disclosed"]  new     2026-03-26 22:07:18  2026-03-26 23:43:39  2026-02-24T00:15:38.000Z
17506  17381      15       greenhouse:scaleai:4363623005  4363623005        greenhouse        Scale AI      Software Engineer, Frontier AI Infrastructure                                                                       https://job-boards.greenhouse.io/scaleai/jobs/4363623005  San Francisco, CA; St. Louis, MO; New York, NY; Washington, DC  0            https://job-boards.greenhouse.io/scaleai/jobs/4363623005  []                                               ["Infrastructure","AI"]                                 []                                         External  External                                                                                                                ["Infrastructure","AI"]                                                                        0            1          53     ["role_fit:24","stack_fit:0","seniority_fit:7","freshness:3","company_signal:19","Prospect-curated top startup"]  {"roleFit":24,"stackFit":0,"seniorityFit":7,"freshness":3,"companySignal":19,"prospect_listed":true}     ["Strong role fit for Software Engineer, Frontier AI Infrastructure","Prospect-curated top startup","Matches one of your target role families"]       ["Not clearly remote","Compensation not disclosed"]  new     2026-03-26 22:07:18  2026-03-26 23:43:39  2024-02-15T16:18:14.000Z
```

## 4. Most recent scan record

Command run:

```sql
SELECT id, provider, started_at, completed_at, raw_count, valid_count, source_counts_json
FROM scans
ORDER BY id DESC
LIMIT 5;
```

Output:

```text
id  provider    started_at                completed_at              raw_count  valid_count  source_counts_json
--  ----------  ------------------------  ------------------------  ---------  -----------  --------------------------------------------------------------------------------------------------------------------------------------
17  careers     2026-03-26T23:43:07.657Z  2026-03-26T23:43:39.487Z  3          3            {"rawCount":3,"validCount":3,"totalRoles":3,"deduped":3,"upserted":3,"newCount":3,"scored80Plus":0,"roleCount":3}
16  lever       2026-03-26T23:43:07.657Z  2026-03-26T23:43:39.487Z  0          0            {"rawCount":0,"validCount":0,"totalRoles":0,"deduped":0,"upserted":0,"newCount":0,"scored80Plus":0,"roleCount":0}
15  greenhouse  2026-03-26T23:43:07.657Z  2026-03-26T23:43:39.487Z  6475       6475         {"rawCount":6475,"validCount":6475,"totalRoles":6475,"deduped":6475,"upserted":6475,"newCount":1067,"scored80Plus":0,"roleCount":6475}
14  yc          2026-03-26T23:43:07.657Z  2026-03-26T23:43:39.486Z  1432       1409         {"rawCount":1432,"validCount":1409,"totalRoles":1409,"deduped":1409,"upserted":1409,"newCount":0,"scored80Plus":0,"roleCount":0}
13  lever       2026-03-26T22:05:59.671Z  2026-03-26T22:07:18.248Z  0          0            {"rawCount":0,"validCount":0,"totalRoles":0,"deduped":0,"upserted":0,"newCount":0,"scored80Plus":0,"roleCount":0}
```

Most recent record by `id` is:

```text
id=17 provider=careers raw_count=3 valid_count=3
```

## 5. All application records

Command run:

```sql
SELECT * FROM applications ORDER BY created_at DESC;
```

Output:

```text
(no rows)
```

## 6. All follow-up records

Command run:

```sql
SELECT * FROM followups ORDER BY due_at ASC;
```

Output:

```text
(no rows)
```

No follow-ups are due because there are no follow-up rows.

## 7. All draft records

Command run:

```sql
SELECT * FROM drafts ORDER BY created_at DESC;
```

Output:

```text
id  job_id  application_id  variant  generated_content                                                                                                                                                                                                                                                                                                                    edited_content  created_at           updated_at           gmail_draft_id
--  ------  --------------  -------  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------  --------------  -------------------  -------------------  --------------
1   8059                    default  Subject: Frontend Platform Engineer Interest - Python/TypeScript Infrastructure Background

Hi,

I came across the Frontend Platform Engineer role at Stripe and was drawn to the JavaScript infrastructure focus. While my background is primarily in backend engineering with Python, TypeScript, and Kubernetes, I have solid JavaScript experience and have built infrastructure tooling that directly supported frontend teams.

At my previous roles, I've worked extensively with Node.js and TypeScript to create developer tools and CI/CD pipelines. I'm particularly interested in how Stripe approaches JavaScript infrastructure challenges at scale, given my experience with distributed systems and infrastructure as code practices.

I noticed the role is based in Canada - I'm currently in Milpitas but open to relocation for the right opportunity. Stripe's developer-first approach to payments infrastructure aligns well with my interest in building tools that enable other engineers.

Would love to discuss how my infrastructure engineering background could contribute to Stripe's JavaScript platform work.

Best regards,
Anish Pavaskar                                                                                                                                                                                                                                                                                                                                                                                               
```

Linked to an application?

```text
application_id = NULL
```

## 8. Orphaned-record check

Command run:

```sql
SELECT
  (SELECT COUNT(*) FROM jobs j LEFT JOIN job_sources s ON s.id = j.source_id WHERE s.id IS NULL) AS jobs_without_source,
  (SELECT COUNT(*) FROM applications a LEFT JOIN jobs j ON j.id = a.job_id WHERE j.id IS NULL) AS applications_without_job,
  (SELECT COUNT(*) FROM followups f LEFT JOIN applications a ON a.id = f.application_id WHERE f.application_id IS NOT NULL AND a.id IS NULL) AS followups_without_application,
  (SELECT COUNT(*) FROM drafts d LEFT JOIN applications a ON a.id = d.application_id WHERE d.application_id IS NOT NULL AND a.id IS NULL) AS drafts_without_application;
```

Output:

```text
jobs_without_source  applications_without_job  followups_without_application  drafts_without_application
-------------------  ------------------------  -----------------------------  --------------------------
0                    0                         0                              0
```

## 9. Running migrations on the current DB

Runtime migration code lives in:

- `src/db/schema.ts:3-160` (`applySchema`)
- `src/db/schema.ts:163-237` (`migrateJobsTable`)
- `src/db/schema.ts:239-288` (`ensureJobsColumns`, `ensureScansColumns`, `ensureDraftsColumns`)
- `src/db/schema.ts:290-328` (`migrateApplicationsTable`)

What was run:

```bash
cp data/job_hunt.db /tmp/job_hunt_audit_migration.db
node - <<'NODE'
const { initDb, closeDb } = require('./dist/src/db');
try {
  initDb('/tmp/job_hunt_audit_migration.db');
  console.log('initDb succeeded on copied DB');
} finally {
  try { closeDb(); } catch {}
}
NODE
```

Output:

```text
initDb succeeded on copied DB
```

Conclusion from that run:

- all migration/ensure functions executed without error on a copied version of the current DB
- the current DB already has the target columns/tables, so the migration functions were effectively no-ops on this copy
