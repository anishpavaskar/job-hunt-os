import path from "path";
import { DbClient, DbError, DbQueryBuilder, DbResponse, PreparedStatement } from "./client";

type RowRecord = Record<string, any>;
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

const TABLE_NAMES: TableName[] = [
  "job_sources",
  "scans",
  "jobs",
  "applications",
  "application_events",
  "followups",
  "drafts",
  "baseline_snapshots",
  "baseline_jobs",
];

const TABLE_COLUMNS: Record<TableName, string[]> = {
  job_sources: ["id", "provider", "external_id", "url", "created_at", "updated_at"],
  scans: ["id", "provider", "started_at", "completed_at", "raw_count", "valid_count", "source_counts_json"],
  jobs: [
    "id",
    "source_id",
    "scan_id",
    "external_key",
    "role_external_id",
    "role_source",
    "company_name",
    "title",
    "summary",
    "website",
    "locations",
    "remote_flag",
    "job_url",
    "posted_at",
    "regions_json",
    "tags_json",
    "industries_json",
    "stage",
    "batch",
    "team_size",
    "seniority_hint",
    "compensation_min",
    "compensation_max",
    "compensation_currency",
    "compensation_period",
    "extracted_skills_json",
    "top_company",
    "is_hiring",
    "score",
    "score_reasons_json",
    "score_breakdown_json",
    "explanation_bullets_json",
    "risk_bullets_json",
    "status",
    "created_at",
    "updated_at",
  ],
  applications: [
    "id",
    "job_id",
    "applied_at",
    "status",
    "notes",
    "applied_url",
    "resume_version",
    "outreach_draft_version",
    "response_received",
    "response_type",
    "interview_stage",
    "rejection_reason",
    "last_contacted_at",
    "created_at",
    "updated_at",
  ],
  application_events: [
    "id",
    "application_id",
    "event_type",
    "previous_status",
    "next_status",
    "note",
    "metadata_json",
    "created_at",
  ],
  followups: ["id", "job_id", "application_id", "due_at", "status", "note", "created_at", "updated_at"],
  drafts: [
    "id",
    "job_id",
    "application_id",
    "variant",
    "generated_content",
    "edited_content",
    "gmail_draft_id",
    "created_at",
    "updated_at",
  ],
  baseline_snapshots: ["id", "label", "effective_date", "created_at"],
  baseline_jobs: [
    "baseline_id",
    "job_id",
    "score_snapshot",
    "status_snapshot",
    "role_source_snapshot",
    "posted_at_snapshot",
    "discovered_at_snapshot",
    "created_at",
  ],
};

function nowIso(): string {
  return new Date().toISOString();
}

function cloneRow<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

class InMemoryPreparedStatement<T = Record<string, unknown>> implements PreparedStatement<T> {
  constructor(
    private readonly db: InMemoryDbClient,
    private readonly sql: string,
  ) {}

  get(...params: unknown[]): T | undefined {
    return this.exec(params)[0] as T | undefined;
  }

  all(...params: unknown[]): T[] {
    return this.exec(params) as T[];
  }

  run(...params: unknown[]): { changes: number } {
    return { changes: this.runMutation(params) };
  }

  private exec(params: unknown[]): RowRecord[] {
    const compact = this.sql.replace(/\s+/g, " ").trim();

    let match = compact.match(/SELECT name FROM sqlite_master WHERE type = 'table' AND name = '([^']+)'/i);
    if (match) {
      const table = match[1] as TableName;
      return this.db.hasTable(table) ? [{ name: table }] : [];
    }

    match = compact.match(/PRAGMA table_info\(([^)]+)\)/i);
    if (match) {
      const table = match[1] as TableName;
      return (TABLE_COLUMNS[table] ?? []).map((name, index) => ({ cid: index, name }));
    }

    match = compact.match(/SELECT (.+) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (\w+) (ASC|DESC))?(?: LIMIT (\d+))?$/i);
    if (match) {
      const [, columnsClause, tableName, whereClause, orderColumn, orderDirection, limitValue] = match;
      let rows = this.db.getRows(tableName as TableName);
      if (whereClause) {
        rows = rows.filter((row) => this.matchesWhere(row, whereClause, params));
      }
      if (orderColumn) {
        rows = rows.slice().sort((left, right) => {
          const leftValue = left[orderColumn];
          const rightValue = right[orderColumn];
          if (leftValue === rightValue) return 0;
          if (leftValue == null) return 1;
          if (rightValue == null) return -1;
          return leftValue > rightValue ? 1 : -1;
        });
        if ((orderDirection ?? "ASC").toUpperCase() === "DESC") {
          rows.reverse();
        }
      }
      if (limitValue) {
        rows = rows.slice(0, Number(limitValue));
      }

      if (columnsClause.trim() === "*") {
        return rows.map((row) => cloneRow(row));
      }

      const columns = columnsClause.split(",").map((column) => column.trim());
      return rows.map((row) => {
        const output: RowRecord = {};
        for (const column of columns) {
          output[column] = cloneRow(row[column]);
        }
        return output;
      });
    }

    throw new Error(`Unsupported prepare().get/all SQL: ${compact}`);
  }

  private runMutation(params: unknown[]): number {
    const compact = this.sql.replace(/\s+/g, " ").trim();
    const match = compact.match(/UPDATE jobs SET created_at = (.+), updated_at = (.+?)(?: WHERE id = (.+))?$/i);
    if (!match) {
      throw new Error(`Unsupported prepare().run SQL: ${compact}`);
    }

    const createdToken = match[1].trim();
    const updatedToken = match[2].trim();
    const idToken = match[3]?.trim();

    const createdAt = createdToken === "?" ? params[0] : parseLiteral(createdToken);
    const updatedAt = updatedToken === "?" ? params[createdToken === "?" ? 1 : 0] : parseLiteral(updatedToken);
    const idValue = idToken
      ? (idToken === "?" ? params[createdToken === "?" && updatedToken === "?" ? 2 : params.length - 1] : parseLiteral(idToken))
      : null;

    let changes = 0;
    this.db.mutateRows("jobs", (row) => {
      if (idValue != null && row.id !== Number(idValue)) return row;
      changes += 1;
      return { ...row, created_at: createdAt, updated_at: updatedAt };
    });
    return changes;
  }

  private matchesWhere(row: RowRecord, whereClause: string, params: unknown[]): boolean {
    const trimmed = whereClause.trim();
    const eqMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (!eqMatch) {
      throw new Error(`Unsupported WHERE clause in prepare(): ${whereClause}`);
    }
    const [, column, rawValue] = eqMatch;
    const value = rawValue.trim() === "?" ? params[0] : parseLiteral(rawValue);
    return row[column] === value;
  }
}

type Filter = { type: "eq" | "in" | "not"; column: string; value: unknown; operator?: string };
type Order = { column: string; ascending: boolean };

class InMemoryQueryBuilder<T = Record<string, unknown>> implements DbQueryBuilder<T> {
  private action: "select" | "insert" | "upsert" | "update" | "delete" | null = null;
  private selectColumns = "*";
  private selectOptions: { count?: "exact"; head?: boolean } | undefined;
  private payload: RowRecord[] = [];
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private onConflict: string | undefined;

  constructor(
    private readonly db: InMemoryDbClient,
    private readonly table: TableName,
  ) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): DbQueryBuilder<T> {
    if (this.action == null || this.action === "select") {
      this.action = "select";
    }
    this.selectColumns = columns;
    this.selectOptions = options;
    return this;
  }

  insert(values: RowRecord | RowRecord[]): DbQueryBuilder<T> {
    this.action = "insert";
    this.payload = ensureArray(values) as RowRecord[];
    if (!Array.isArray(values)) this.payload = [values];
    return this;
  }

  upsert(values: RowRecord | RowRecord[], options?: { onConflict?: string }): DbQueryBuilder<T> {
    this.action = "upsert";
    this.payload = ensureArray(values) as RowRecord[];
    if (!Array.isArray(values)) this.payload = [values];
    this.onConflict = options?.onConflict;
    return this;
  }

  update(values: RowRecord): DbQueryBuilder<T> {
    this.action = "update";
    this.payload = [values];
    return this;
  }

  delete(): DbQueryBuilder<T> {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown): DbQueryBuilder<T> {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  in(column: string, values: unknown[]): DbQueryBuilder<T> {
    this.filters.push({ type: "in", column, value: values });
    return this;
  }

  not(column: string, operator: string, value: unknown): DbQueryBuilder<T> {
    this.filters.push({ type: "not", column, value, operator });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): DbQueryBuilder<T> {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): DbQueryBuilder<T> {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): DbQueryBuilder<T> {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): Promise<DbResponse<any>> {
    return this.executeSingle(false);
  }

  maybeSingle(): Promise<DbResponse<any>> {
    return this.executeSingle(true);
  }

  then<TResult1 = DbResponse<T[] | T | null>, TResult2 = never>(
    onfulfilled?: ((value: DbResponse<T[] | T | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async executeSingle(maybe: boolean): Promise<DbResponse<any>> {
    const result = await this.execute();
    if (result.error) return result as DbResponse<T>;
    const rows = Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data];
    if (rows.length === 0) {
      return maybe ? { data: null, error: null } : { data: null, error: { message: "No rows found" } };
    }
    if (rows.length > 1) {
      return { data: null, error: { message: "Multiple rows found" } };
    }
    return { data: rows[0] as T, error: null };
  }

  private async execute(): Promise<DbResponse<any>> {
    switch (this.action) {
      case "select":
        return this.executeSelect();
      case "insert":
        return this.executeInsert();
      case "upsert":
        return this.executeUpsert();
      case "update":
        return this.executeUpdate();
      case "delete":
        return this.executeDelete();
      default:
        return { data: null, error: { message: "No query action configured" } };
    }
  }

  private executeSelect(): DbResponse<any> {
    let rows = this.db.getRows(this.table).filter((row) => this.matchesFilters(row));
    rows = rows.map((row) => this.attachJoins(row));
    rows = this.applyOrder(rows);
    rows = this.applyRange(rows);

    const count = this.selectOptions?.count === "exact" ? rows.length : null;
    if (this.selectOptions?.head) {
      return { data: null, error: null, count };
    }

    const projected = rows.map((row) => this.projectRow(row));
    return { data: projected, error: null, count };
  }

  private executeInsert(): DbResponse<any> {
    const inserted = this.payload.map((row) => this.db.insertRow(this.table, row));
    return this.returnMutation(inserted);
  }

  private executeUpsert(): DbResponse<any> {
    const upserted = this.payload.map((row) => this.db.upsertRow(this.table, row, this.onConflict));
    return this.returnMutation(upserted);
  }

  private executeUpdate(): DbResponse<any> {
    const updated = this.db.updateRows(this.table, this.filters, this.payload[0] ?? {});
    return this.returnMutation(updated);
  }

  private executeDelete(): DbResponse<any> {
    const deleted = this.db.deleteRows(this.table, this.filters);
    return { data: deleted, error: null };
  }

  private returnMutation(rows: RowRecord[]): DbResponse<any> {
    if (this.selectColumns === "*" || this.selectColumns == null) {
      return { data: rows.map((row) => cloneRow(row)), error: null };
    }
    return {
      data: rows.map((row) => this.projectRow(row)),
      error: null,
    };
  }

  private projectRow(row: RowRecord): RowRecord {
    if (this.selectColumns === "*" || this.selectColumns.trim() === "*") {
      return cloneRow(row);
    }

    const result: RowRecord = {};
    for (const part of this.selectColumns.split(",").map((value) => value.trim()).filter(Boolean)) {
      if (part === "*") {
        Object.assign(result, cloneRow(row));
        continue;
      }
      if (part.includes("!inner")) {
        const joinName = part.split("!inner")[0].trim();
        result[joinName] = cloneRow(row[joinName]);
        continue;
      }
      result[part] = cloneRow(row[part]);
    }
    return result;
  }

  private matchesFilters(row: RowRecord): boolean {
    return this.filters.every((filter) => {
      if (filter.type === "eq") return row[filter.column] === filter.value;
      if (filter.type === "in") return (filter.value as unknown[]).includes(row[filter.column]);
      if (filter.type === "not") {
        if (filter.operator === "is" && filter.value == null) {
          return row[filter.column] != null;
        }
        return row[filter.column] !== filter.value;
      }
      return true;
    });
  }

  private applyOrder(rows: RowRecord[]): RowRecord[] {
    if (this.orders.length === 0) return rows.slice();
    return rows.slice().sort((left, right) => {
      for (const order of this.orders) {
        const leftValue = left[order.column];
        const rightValue = right[order.column];
        if (leftValue === rightValue) continue;
        if (leftValue == null) return 1;
        if (rightValue == null) return -1;
        const cmp = leftValue > rightValue ? 1 : -1;
        return order.ascending ? cmp : -cmp;
      }
      return 0;
    });
  }

  private applyRange(rows: RowRecord[]): RowRecord[] {
    let out = rows;
    if (this.rangeFrom != null && this.rangeTo != null) {
      out = out.slice(this.rangeFrom, this.rangeTo + 1);
    }
    if (this.limitCount != null) {
      out = out.slice(0, this.limitCount);
    }
    return out;
  }

  private attachJoins(row: RowRecord): RowRecord {
    const next = cloneRow(row);
    if (this.selectColumns.includes("job_sources!inner")) {
      next.job_sources = this.db.findById("job_sources", row.source_id);
    }
    if (this.selectColumns.includes("jobs!inner")) {
      next.jobs = this.db.findById("jobs", row.job_id);
    }
    if (this.selectColumns.includes("applications(") || this.selectColumns.includes("applications!inner")) {
      next.applications = row.application_id != null ? this.db.findById("applications", row.application_id) : null;
    }
    return next;
  }
}

export class InMemoryDbClient implements DbClient {
  private readonly tables: Record<TableName, RowRecord[]> = {
    job_sources: [],
    scans: [],
    jobs: [],
    applications: [],
    application_events: [],
    followups: [],
    drafts: [],
    baseline_snapshots: [],
    baseline_jobs: [],
  };

  private readonly sequences: Partial<Record<TableName, number>> = {
    job_sources: 1,
    scans: 1,
    jobs: 1,
    applications: 1,
    application_events: 1,
    followups: 1,
    drafts: 1,
    baseline_snapshots: 1,
  };

  from<T = Record<string, unknown>>(table: string): DbQueryBuilder<T> {
    return new InMemoryQueryBuilder<T>(this, table as TableName);
  }

  async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<DbResponse<T>> {
    if (fn === "reset_table_sequence") {
      const table = args?.p_table_name as TableName;
      const column = (args?.p_column_name as string | undefined) ?? "id";
      const maxValue = this.tables[table].reduce((max, row) => Math.max(max, Number(row[column] ?? 0)), 0);
      if (table in this.sequences) {
        this.sequences[table] = maxValue + 1;
      }
      return { data: (maxValue + 1) as T, error: null };
    }
    return { data: null as T, error: { message: `Unsupported RPC ${fn}` } };
  }

  prepare<T = Record<string, unknown>>(sql: string): PreparedStatement<T> {
    return new InMemoryPreparedStatement<T>(this, sql);
  }

  hasTable(table: TableName): boolean {
    return table in this.tables;
  }

  getRows(table: TableName): RowRecord[] {
    return this.tables[table].map((row) => cloneRow(row));
  }

  findById(table: TableName, id: number): RowRecord | null {
    const row = this.tables[table].find((candidate) => Number(candidate.id) === Number(id));
    return row ? cloneRow(row) : null;
  }

  insertRow(table: TableName, row: RowRecord): RowRecord {
    const next = this.applyDefaults(table, row, false);
    this.tables[table].push(next);
    return cloneRow(next);
  }

  upsertRow(table: TableName, row: RowRecord, onConflict?: string): RowRecord {
    const conflictColumns = (onConflict ?? "id").split(",").map((column) => column.trim()).filter(Boolean);
    const existing = this.tables[table].find((candidate) =>
      conflictColumns.every((column) => candidate[column] === row[column]),
    );
    if (!existing) {
      return this.insertRow(table, row);
    }
    const merged = this.applyDefaults(table, { ...existing, ...cloneRow(row) }, true);
    Object.assign(existing, merged);
    return cloneRow(existing);
  }

  updateRows(table: TableName, filters: Filter[], patch: RowRecord): RowRecord[] {
    const updated: RowRecord[] = [];
    this.tables[table] = this.tables[table].map((row) => {
      const matches = filters.every((filter) =>
        filter.type === "eq"
          ? row[filter.column] === filter.value
          : filter.type === "in"
            ? (filter.value as unknown[]).includes(row[filter.column])
            : filter.operator === "is" && filter.value == null
              ? row[filter.column] != null
              : row[filter.column] !== filter.value,
      );
      if (!matches) return row;
      const next = this.applyDefaults(table, { ...row, ...cloneRow(patch) }, true);
      updated.push(cloneRow(next));
      return next;
    });
    return updated;
  }

  deleteRows(table: TableName, filters: Filter[]): RowRecord[] {
    const deleted: RowRecord[] = [];
    this.tables[table] = this.tables[table].filter((row) => {
      const matches = filters.every((filter) =>
        filter.type === "eq"
          ? row[filter.column] === filter.value
          : filter.type === "in"
            ? (filter.value as unknown[]).includes(row[filter.column])
            : filter.operator === "is" && filter.value == null
              ? row[filter.column] != null
              : row[filter.column] !== filter.value,
      );
      if (matches) {
        deleted.push(cloneRow(row));
        return false;
      }
      return true;
    });
    return deleted;
  }

  mutateRows(table: TableName, mutator: (row: RowRecord) => RowRecord): void {
    this.tables[table] = this.tables[table].map((row) => this.applyDefaults(table, mutator(cloneRow(row)), true));
  }

  private applyDefaults(table: TableName, input: RowRecord, isUpdate: boolean): RowRecord {
    const row = cloneRow(input);
    const timestamp = nowIso();

    if (TABLE_COLUMNS[table].includes("id") && row.id == null && table in this.sequences) {
      row.id = this.sequences[table]!;
      this.sequences[table] = this.sequences[table]! + 1;
    } else if ("id" in row && table in this.sequences) {
      this.sequences[table] = Math.max(this.sequences[table] ?? 1, Number(row.id) + 1);
    }

    if (TABLE_COLUMNS[table].includes("created_at") && row.created_at == null) {
      row.created_at = timestamp;
    }
    if (TABLE_COLUMNS[table].includes("updated_at")) {
      row.updated_at = row.updated_at ?? timestamp;
      if (isUpdate) row.updated_at = row.updated_at ?? timestamp;
    }

    if (table === "job_sources") {
      row.created_at = row.created_at ?? timestamp;
      row.updated_at = row.updated_at ?? timestamp;
    }
    if (table === "scans") {
      row.raw_count = row.raw_count ?? 0;
      row.valid_count = row.valid_count ?? 0;
      row.source_counts_json = row.source_counts_json ?? {};
    }
    if (table === "jobs") {
      row.role_source = row.role_source ?? "company_fallback";
      row.remote_flag = Boolean(row.remote_flag ?? false);
      row.regions_json = row.regions_json ?? [];
      row.tags_json = row.tags_json ?? [];
      row.industries_json = row.industries_json ?? [];
      row.extracted_skills_json = row.extracted_skills_json ?? [];
      row.top_company = Boolean(row.top_company ?? false);
      row.is_hiring = Boolean(row.is_hiring ?? false);
      row.score_reasons_json = row.score_reasons_json ?? [];
      row.score_breakdown_json = row.score_breakdown_json ?? {};
      row.explanation_bullets_json = row.explanation_bullets_json ?? [];
      row.risk_bullets_json = row.risk_bullets_json ?? [];
      row.status = row.status ?? "new";
      row.job_url = row.job_url ?? "";
    }
    if (table === "applications") {
      row.response_received = Boolean(row.response_received ?? false);
    }
    if (table === "application_events") {
      row.metadata_json = row.metadata_json ?? {};
      row.created_at = row.created_at ?? timestamp;
    }
    if (table === "followups") {
      row.status = row.status ?? "pending";
      row.created_at = row.created_at ?? timestamp;
      row.updated_at = row.updated_at ?? timestamp;
    }
    if (table === "drafts") {
      row.variant = row.variant ?? "default";
      row.created_at = row.created_at ?? timestamp;
      row.updated_at = row.updated_at ?? timestamp;
    }
    if (table === "baseline_snapshots") {
      row.created_at = row.created_at ?? timestamp;
    }
    if (table === "baseline_jobs") {
      row.created_at = row.created_at ?? timestamp;
    }

    return row;
  }
}

const testClients = new Map<string, InMemoryDbClient>();

function normalizeKey(dbPath?: string): string {
  const candidate = dbPath ?? path.resolve(process.cwd(), "data", "job_hunt.db");
  return path.resolve(candidate);
}

export function getOrCreateInMemoryDb(dbPath?: string): InMemoryDbClient {
  if (!dbPath && testClients.size === 1) {
    return [...testClients.values()][0];
  }
  const key = normalizeKey(dbPath);
  const existing = testClients.get(key);
  if (existing) return existing;
  const client = new InMemoryDbClient();
  testClients.set(key, client);
  return client;
}

export function resetInMemoryDbs(): void {
  testClients.clear();
}
