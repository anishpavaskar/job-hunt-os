import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { closeDb, initDb, resetDb } from "../src/db";

describe("migration safety", () => {
  afterEach(() => {
    closeDb();
    resetDb();
  });

  test("upgrades legacy applications table and creates application_events", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-migrate-"));
    const dbPath = path.join(tempDir, "job_hunt.db");
    const legacy = new Database(dbPath);

    legacy.exec(`
      CREATE TABLE job_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        url TEXT NOT NULL
      );

      CREATE TABLE scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        started_at TEXT NOT NULL
      );

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
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL UNIQUE,
        applied_at TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    legacy.close();

    const db = initDb(dbPath);
    const appColumns = (
      db.prepare(`PRAGMA table_info(applications)`).all() as Array<{ name: string }>
    ).map((column) => column.name);
    expect(appColumns).toContain("applied_url");
    expect(appColumns).toContain("resume_version");
    expect(appColumns).toContain("outreach_draft_version");
    expect(appColumns).toContain("response_received");
    expect(appColumns).toContain("response_type");
    expect(appColumns).toContain("interview_stage");
    expect(appColumns).toContain("rejection_reason");
    expect(appColumns).toContain("last_contacted_at");

    const eventsTable = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'application_events'`)
      .get();
    expect(eventsTable).toBeTruthy();

    const scanColumns = (
      db.prepare(`PRAGMA table_info(scans)`).all() as Array<{ name: string }>
    ).map((column) => column.name);
    expect(scanColumns).toContain("source_counts_json");

    const jobColumns = (
      db.prepare(`PRAGMA table_info(jobs)`).all() as Array<{ name: string }>
    ).map((column) => column.name);
    expect(jobColumns).toContain("extracted_skills_json");
  });

  test("creates drafts table for existing databases", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-migrate-drafts-"));
    const dbPath = path.join(tempDir, "job_hunt.db");
    const legacy = new Database(dbPath);

    legacy.exec(`
      CREATE TABLE job_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        url TEXT NOT NULL
      );
      CREATE TABLE scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        started_at TEXT NOT NULL
      );
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
        top_company INTEGER NOT NULL,
        is_hiring INTEGER NOT NULL,
        score INTEGER NOT NULL,
        score_reasons_json TEXT NOT NULL,
        score_breakdown_json TEXT NOT NULL DEFAULT '{}',
        explanation_bullets_json TEXT NOT NULL DEFAULT '[]',
        risk_bullets_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    legacy.close();

    const db = initDb(dbPath);
    const draftsTable = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts'`)
      .get();
    expect(draftsTable).toBeTruthy();
  });

  test("upgrades legacy drafts table with application linkage", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-migrate-draft-links-"));
    const dbPath = path.join(tempDir, "job_hunt.db");
    const legacy = new Database(dbPath);

    legacy.exec(`
      CREATE TABLE job_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        url TEXT NOT NULL
      );
      CREATE TABLE scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        started_at TEXT NOT NULL
      );
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
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        variant TEXT NOT NULL DEFAULT 'default',
        generated_content TEXT NOT NULL,
        edited_content TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(job_id, variant)
      );
    `);
    legacy.close();

    const db = initDb(dbPath);
    const draftColumns = (
      db.prepare(`PRAGMA table_info(drafts)`).all() as Array<{ name: string }>
    ).map((column) => column.name);
    expect(draftColumns).toContain("application_id");
    expect(draftColumns).toContain("gmail_draft_id");
  });
});
