import Database from "better-sqlite3";

export function applySchema(db: Database.Database): void {
  migrateJobsTable(db);
  migrateApplicationsTable(db);
  ensureScansColumns(db);
  ensureJobsColumns(db);
  ensureDraftsColumns(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, external_id)
    );

    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      raw_count INTEGER NOT NULL DEFAULT 0,
      valid_count INTEGER NOT NULL DEFAULT 0,
      source_counts_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS jobs (
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES job_sources(id),
      FOREIGN KEY (scan_id) REFERENCES scans(id)
    );

    CREATE TABLE IF NOT EXISTS applications (
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

    CREATE TABLE IF NOT EXISTS application_events (
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

    CREATE TABLE IF NOT EXISTS followups (
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

    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      application_id INTEGER,
      variant TEXT NOT NULL DEFAULT 'default',
      generated_content TEXT NOT NULL,
      edited_content TEXT,
      gmail_draft_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (application_id) REFERENCES applications(id),
      UNIQUE(job_id, variant)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_source_id ON jobs(source_id);
    CREATE INDEX IF NOT EXISTS idx_application_events_application_id ON application_events(application_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_drafts_job_id ON drafts(job_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_drafts_application_id ON drafts(application_id, updated_at DESC);
  `);
}

function migrateJobsTable(db: Database.Database): void {
  const columns = db.prepare(`PRAGMA table_info(jobs)`).all() as Array<{ name: string }>;
  if (columns.length === 0) return;
  if (columns.some((column) => column.name === "external_key")) return;

  db.exec(`
    ALTER TABLE jobs RENAME TO jobs_legacy;

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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES job_sources(id),
      FOREIGN KEY (scan_id) REFERENCES scans(id)
    );

    INSERT INTO jobs (
      id, source_id, scan_id, external_key, role_external_id, role_source,
      company_name, title, summary, website, locations, remote_flag, job_url,
      regions_json, tags_json, industries_json, stage, batch, team_size,
      seniority_hint, compensation_min, compensation_max, compensation_currency, compensation_period,
      extracted_skills_json, top_company, is_hiring, score, score_reasons_json, score_breakdown_json, explanation_bullets_json, risk_bullets_json, status, created_at, updated_at
    )
    SELECT
      id, source_id, scan_id, 'company:' || source_id, NULL, 'company_fallback',
      company_name, title, summary, website, locations,
      CASE
        WHEN regions_json LIKE '%Remote%' OR locations LIKE '%Remote%' THEN 1
        ELSE 0
      END,
      COALESCE(NULLIF(website, ''), ''),
      regions_json, tags_json, industries_json, stage, batch, team_size,
      NULL, NULL, NULL, NULL, NULL,
      '[]',
      top_company, is_hiring, score, score_reasons_json, '{}', '[]', '[]', status, created_at, updated_at
    FROM jobs_legacy;

    DROP TABLE jobs_legacy;
  `);

}

function ensureJobsColumns(db: Database.Database): void {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(jobs)`).all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (columns.size === 0) {
    return;
  }
  if (!columns.has("score_breakdown_json")) {
    db.exec(`ALTER TABLE jobs ADD COLUMN score_breakdown_json TEXT NOT NULL DEFAULT '{}'`);
  }
  if (!columns.has("explanation_bullets_json")) {
    db.exec(`ALTER TABLE jobs ADD COLUMN explanation_bullets_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!columns.has("risk_bullets_json")) {
    db.exec(`ALTER TABLE jobs ADD COLUMN risk_bullets_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!columns.has("extracted_skills_json")) {
    db.exec(`ALTER TABLE jobs ADD COLUMN extracted_skills_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

function ensureScansColumns(db: Database.Database): void {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(scans)`).all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (columns.size === 0) {
    return;
  }
  if (!columns.has("source_counts_json")) {
    db.exec(`ALTER TABLE scans ADD COLUMN source_counts_json TEXT NOT NULL DEFAULT '{}'`);
  }
}

function ensureDraftsColumns(db: Database.Database): void {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(drafts)`).all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (columns.size === 0) {
    return;
  }
  if (!columns.has("application_id")) {
    db.exec(`ALTER TABLE drafts ADD COLUMN application_id INTEGER REFERENCES applications(id)`);
  }
  if (!columns.has("gmail_draft_id")) {
    db.exec(`ALTER TABLE drafts ADD COLUMN gmail_draft_id TEXT`);
  }
}

function migrateApplicationsTable(db: Database.Database): void {
  const columns = db.prepare(`PRAGMA table_info(applications)`).all() as Array<{ name: string; notnull: number }>;
  if (columns.length === 0) return;
  if (columns.some((column) => column.name === "response_received")) return;

  db.exec(`
    ALTER TABLE applications RENAME TO applications_legacy;

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

    INSERT INTO applications (
      id, job_id, applied_at, status, notes, applied_url, resume_version, outreach_draft_version,
      response_received, response_type, interview_stage, rejection_reason, last_contacted_at,
      created_at, updated_at
    )
    SELECT
      id, job_id, applied_at, status, notes, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, created_at, updated_at
    FROM applications_legacy;

    DROP TABLE applications_legacy;
  `);
}
