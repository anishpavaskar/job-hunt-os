import "dotenv/config";

import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonMode = "array" | "object";
type RowRecord = Record<string, unknown>;

interface SQLiteStatement<T = RowRecord> {
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
}

interface SQLiteDatabase {
  prepare<T = RowRecord>(sql: string): SQLiteStatement<T>;
  close(): void;
}

type BetterSqliteCtor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => SQLiteDatabase;

const BetterSqlite = require("better-sqlite3") as BetterSqliteCtor;

type TableName =
  | "job_sources"
  | "scans"
  | "jobs"
  | "applications"
  | "application_events"
  | "followups"
  | "drafts"
  | "baseline_snapshots"
  | "baseline_jobs";

type TableConfig = {
  name: TableName;
  orderBy: string;
  onConflict: string;
  booleanColumns?: string[];
  jsonColumns?: Record<string, JsonMode>;
  sequenceColumn?: string;
};

type VerificationCounts = Record<TableName, number>;

const BATCH_SIZE = 500;
const LOCAL_DB_PATH = path.resolve(process.cwd(), "data", "job_hunt.db");
const DRY_RUN = process.argv.includes("--dry-run");

const TABLES: TableConfig[] = [
  {
    name: "job_sources",
    orderBy: "id ASC",
    onConflict: "id",
    sequenceColumn: "id",
  },
  {
    name: "scans",
    orderBy: "id ASC",
    onConflict: "id",
    jsonColumns: { source_counts_json: "object" },
    sequenceColumn: "id",
  },
  {
    name: "jobs",
    orderBy: "id ASC",
    onConflict: "id",
    booleanColumns: ["remote_flag", "top_company", "is_hiring"],
    jsonColumns: {
      regions_json: "array",
      tags_json: "array",
      industries_json: "array",
      extracted_skills_json: "array",
      score_reasons_json: "array",
      score_breakdown_json: "object",
      explanation_bullets_json: "array",
      risk_bullets_json: "array",
    },
    sequenceColumn: "id",
  },
  {
    name: "applications",
    orderBy: "id ASC",
    onConflict: "id",
    booleanColumns: ["response_received"],
    sequenceColumn: "id",
  },
  {
    name: "application_events",
    orderBy: "id ASC",
    onConflict: "id",
    jsonColumns: { metadata_json: "object" },
    sequenceColumn: "id",
  },
  {
    name: "followups",
    orderBy: "id ASC",
    onConflict: "id",
    sequenceColumn: "id",
  },
  {
    name: "drafts",
    orderBy: "id ASC",
    onConflict: "id",
    sequenceColumn: "id",
  },
  {
    name: "baseline_snapshots",
    orderBy: "id ASC",
    onConflict: "id",
    sequenceColumn: "id",
  },
  {
    name: "baseline_jobs",
    orderBy: "baseline_id ASC, job_id ASC",
    onConflict: "baseline_id,job_id",
  },
];

function requireSupabaseEnv(): { url: string; serviceKey: string } {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  }
  return { url, serviceKey };
}

function createSupabaseClient(): SupabaseClient {
  const { url, serviceKey } = requireSupabaseEnv();
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function assertLocalDbExists(dbPath: string): void {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database not found at ${dbPath}`);
  }
}

function openSqlite(dbPath: string): SQLiteDatabase {
  assertLocalDbExists(dbPath);
  return new BetterSqlite(dbPath, { readonly: true, fileMustExist: true });
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function parseJsonCell(value: unknown, mode: JsonMode): unknown {
  const fallback = mode === "array" ? [] : {};
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return fallback;
    }
  }
  if (typeof value === "object") return value;
  return fallback;
}

function sanitizeRow(
  row: RowRecord,
  config: TableConfig,
): RowRecord {
  const next: RowRecord = {};
  for (const [key, rawValue] of Object.entries(row)) {
    let value: unknown = rawValue;
    if (config.booleanColumns?.includes(key)) {
      value = Boolean(rawValue);
    } else if (config.jsonColumns?.[key]) {
      value = parseJsonCell(rawValue, config.jsonColumns[key]);
    }

    next[key] = value === undefined ? null : value;
  }
  return next;
}

function loadSqliteRows(db: SQLiteDatabase, config: TableConfig): RowRecord[] {
  const sql = `SELECT * FROM ${config.name} ORDER BY ${config.orderBy}`;
  return db.prepare<RowRecord>(sql).all();
}

function getSqliteCount(db: SQLiteDatabase, table: TableName): number {
  const row = db.prepare<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).get();
  return row?.count ?? 0;
}

async function getSupabaseCount(client: SupabaseClient, table: TableName): Promise<number> {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) {
    throw new Error(`count ${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function upsertBatch(
  client: SupabaseClient,
  table: TableName,
  rows: RowRecord[],
  onConflict: string,
): Promise<void> {
  const { error } = await client.from(table).upsert(rows, { onConflict });
  if (error) {
    throw new Error(error.message);
  }
}

async function writeBatchWithFallback(
  client: SupabaseClient,
  config: TableConfig,
  rows: RowRecord[],
): Promise<{ migrated: number; failed: number }> {
  try {
    await upsertBatch(client, config.name, rows, config.onConflict);
    return { migrated: rows.length, failed: 0 };
  } catch (error) {
    console.error(
      `[migrate] ${config.name}: batch failed for ${rows.length} rows (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  let migrated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await upsertBatch(client, config.name, [row], config.onConflict);
      migrated += 1;
    } catch (error) {
      failed += 1;
      const idLabel =
        "id" in row && row.id != null
          ? `id=${String(row.id)}`
          : config.name === "baseline_jobs"
            ? `baseline_id=${String(row.baseline_id)} job_id=${String(row.job_id)}`
            : "unknown-row";
      console.error(
        `[migrate] ${config.name}: row failed (${idLabel}) (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
  return { migrated, failed };
}

async function migrateTable(
  sqlite: SQLiteDatabase,
  client: SupabaseClient | null,
  config: TableConfig,
): Promise<{ total: number; migrated: number; failed: number }> {
  const rawRows = loadSqliteRows(sqlite, config);
  const total = rawRows.length;
  const batches = chunk(rawRows.map((row) => sanitizeRow(row, config)), BATCH_SIZE);
  let migrated = 0;
  let failed = 0;

  if (DRY_RUN) {
    console.log(
      `[migrate] ${config.name}: dry-run, ${total} rows would be migrated in ${batches.length} batches`,
    );
    return { total, migrated: total, failed: 0 };
  }

  if (!client) {
    throw new Error(`Supabase client missing for live migration of ${config.name}`);
  }

  for (const batch of batches) {
    const result = await writeBatchWithFallback(client, config, batch);
    migrated += result.migrated;
    failed += result.failed;
    console.log(`[migrate] ${config.name}: ${migrated}/${total} migrated`);
  }

  return { total, migrated, failed };
}

async function resetSequence(
  client: SupabaseClient,
  table: TableName,
  column = "id",
): Promise<void> {
  const { error } = await client.rpc("reset_table_sequence", {
    p_table_name: table,
    p_column_name: column,
  });
  if (error) {
    console.warn(
      `[migrate] ${table}: unable to reset sequence via reset_table_sequence() (${error.message})`,
    );
    return;
  }
  console.log(`[migrate] ${table}: sequence reset`);
}

async function resetSequences(client: SupabaseClient): Promise<void> {
  for (const config of TABLES) {
    if (!config.sequenceColumn) continue;
    await resetSequence(client, config.name, config.sequenceColumn);
  }
}

async function fetchSupabaseIds(
  client: SupabaseClient,
  table: "jobs" | "applications" | "baseline_snapshots",
): Promise<Set<number>> {
  const ids = new Set<number>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await client
      .from(table)
      .select("id")
      .range(from, from + pageSize - 1)
      .order("id", { ascending: true });
    if (error) throw new Error(`fetch ids from ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      ids.add(Number(row.id));
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

async function verifyTopJobs(
  sqlite: SQLiteDatabase,
  client: SupabaseClient,
): Promise<boolean> {
  const sqliteTop = sqlite
    .prepare<RowRecord>(
      `SELECT id, external_key, company_name, title, score
       FROM jobs
       ORDER BY score DESC, id ASC
       LIMIT 3`,
    )
    .all();

  const { data, error } = await client
    .from("jobs")
    .select("id, external_key, company_name, title, score")
    .order("score", { ascending: false })
    .order("id", { ascending: true })
    .limit(3);
  if (error) throw new Error(`verify top jobs: ${error.message}`);

  const supabaseTop = (data ?? []) as RowRecord[];
  const matches = JSON.stringify(sqliteTop) === JSON.stringify(supabaseTop);
  console.log(`[migrate] top 3 jobs match: ${matches ? "yes" : "no"}`);
  if (!matches) {
    console.log("[migrate] SQLite top 3:", JSON.stringify(sqliteTop, null, 2));
    console.log("[migrate] Supabase top 3:", JSON.stringify(supabaseTop, null, 2));
  }
  return matches;
}

async function verifyOrphans(client: SupabaseClient): Promise<Record<string, number>> {
  const [jobIds, applicationIds, baselineIds] = await Promise.all([
    fetchSupabaseIds(client, "jobs"),
    fetchSupabaseIds(client, "applications"),
    fetchSupabaseIds(client, "baseline_snapshots"),
  ]);

  const [
    applicationsResult,
    applicationEventsResult,
    followupsResult,
    draftsResult,
    baselineJobsResult,
  ] = await Promise.all([
    client.from("applications").select("id, job_id"),
    client.from("application_events").select("application_id"),
    client.from("followups").select("job_id, application_id"),
    client.from("drafts").select("job_id, application_id"),
    client.from("baseline_jobs").select("baseline_id, job_id"),
  ]);

  if (applicationsResult.error) throw new Error(`verify applications orphans: ${applicationsResult.error.message}`);
  if (applicationEventsResult.error) throw new Error(`verify application_events orphans: ${applicationEventsResult.error.message}`);
  if (followupsResult.error) throw new Error(`verify followups orphans: ${followupsResult.error.message}`);
  if (draftsResult.error) throw new Error(`verify drafts orphans: ${draftsResult.error.message}`);
  if (baselineJobsResult.error) throw new Error(`verify baseline_jobs orphans: ${baselineJobsResult.error.message}`);

  const orphanedApplications = (applicationsResult.data ?? []).filter((row) => !jobIds.has(Number(row.job_id))).length;
  const orphanedEvents = (applicationEventsResult.data ?? []).filter((row) => !applicationIds.has(Number(row.application_id))).length;
  const orphanedFollowupJobs = (followupsResult.data ?? []).filter((row) => !jobIds.has(Number(row.job_id))).length;
  const orphanedFollowupApplications = (followupsResult.data ?? []).filter(
    (row) => row.application_id != null && !applicationIds.has(Number(row.application_id)),
  ).length;
  const orphanedDraftJobs = (draftsResult.data ?? []).filter((row) => !jobIds.has(Number(row.job_id))).length;
  const orphanedDraftApplications = (draftsResult.data ?? []).filter(
    (row) => row.application_id != null && !applicationIds.has(Number(row.application_id)),
  ).length;
  const orphanedBaselineSnapshots = (baselineJobsResult.data ?? []).filter(
    (row) => !baselineIds.has(Number(row.baseline_id)),
  ).length;
  const orphanedBaselineJobs = (baselineJobsResult.data ?? []).filter(
    (row) => !jobIds.has(Number(row.job_id)),
  ).length;

  return {
    orphanedApplications,
    orphanedEvents,
    orphanedFollowupJobs,
    orphanedFollowupApplications,
    orphanedDraftJobs,
    orphanedDraftApplications,
    orphanedBaselineSnapshots,
    orphanedBaselineJobs,
  };
}

async function collectCounts(
  sqlite: SQLiteDatabase,
  client: SupabaseClient | null,
): Promise<{ sqliteCounts: VerificationCounts; supabaseCounts: VerificationCounts }> {
  const sqliteCounts = Object.fromEntries(
    TABLES.map((table) => [table.name, getSqliteCount(sqlite, table.name)]),
  ) as VerificationCounts;

  if (DRY_RUN || !client) {
    return {
      sqliteCounts,
      supabaseCounts: Object.fromEntries(TABLES.map((table) => [table.name, 0])) as VerificationCounts,
    };
  }

  const supabaseCounts = Object.fromEntries(
    await Promise.all(TABLES.map(async (table) => [table.name, await getSupabaseCount(client, table.name)] as const)),
  ) as VerificationCounts;

  return { sqliteCounts, supabaseCounts };
}

function printCountSummary(
  sqliteCounts: VerificationCounts,
  supabaseCounts: VerificationCounts,
  failures: Record<TableName, number>,
): void {
  console.log("\n[migrate] Row Count Summary");
  console.table(
    TABLES.map((table) => ({
      table: table.name,
      sqlite: sqliteCounts[table.name],
      supabase: supabaseCounts[table.name],
      failed: failures[table.name],
      matches: sqliteCounts[table.name] === supabaseCounts[table.name],
    })),
  );
}

async function main(): Promise<void> {
  const sqlite = openSqlite(LOCAL_DB_PATH);
  const failures = Object.fromEntries(TABLES.map((table) => [table.name, 0])) as Record<TableName, number>;
  const client = DRY_RUN ? null : createSupabaseClient();

  try {
    console.log(`[migrate] SQLite source: ${LOCAL_DB_PATH}`);
    console.log(`[migrate] Mode: ${DRY_RUN ? "dry-run" : "live migration"}`);

    for (const table of TABLES) {
      const result = await migrateTable(sqlite, client, table);
      failures[table.name] = result.failed;
    }

    if (!DRY_RUN && client) {
      await resetSequences(client);
    }

    const { sqliteCounts, supabaseCounts } = await collectCounts(sqlite, client);
    printCountSummary(sqliteCounts, supabaseCounts, failures);

    if (!DRY_RUN && client) {
      await verifyTopJobs(sqlite, client);
      const orphanCounts = await verifyOrphans(client);
      console.log("\n[migrate] Orphan Check");
      console.table(orphanCounts);
    }

    console.log("\n[migrate] Failure Summary");
    console.table(failures);
  } finally {
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(`[migrate] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
