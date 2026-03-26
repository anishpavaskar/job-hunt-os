import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { applySchema } from "./schema";

let db: Database.Database | null = null;

export function getDefaultDbPath(cwd = process.cwd()): string {
  return path.join(cwd, "data", "job_hunt.db");
}

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath ?? getDefaultDbPath();
  if (resolvedPath !== ":memory:") {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initDb(dbPath?: string): Database.Database {
  const instance = getDb(dbPath);
  applySchema(instance);
  return instance;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function resetDb(): void {
  closeDb();
}
