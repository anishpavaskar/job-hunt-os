export type DbError = { message: string };

export type DbResponse<T = any> = {
  data: T;
  error: DbError | null;
  count?: number | null;
};

export interface PreparedStatement<T = Record<string, unknown>> {
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
  run(...params: unknown[]): { changes: number };
}

export interface DbQueryBuilder<T = any> extends PromiseLike<DbResponse<any>> {
  select(columns?: string, options?: { count?: "exact"; head?: boolean }): DbQueryBuilder<T>;
  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): DbQueryBuilder<T>;
  upsert(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: { onConflict?: string },
  ): DbQueryBuilder<T>;
  update(values: Record<string, unknown>): DbQueryBuilder<T>;
  delete(): DbQueryBuilder<T>;
  eq(column: string, value: unknown): DbQueryBuilder<T>;
  in(column: string, values: unknown[]): DbQueryBuilder<T>;
  not(column: string, operator: string, value: unknown): DbQueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): DbQueryBuilder<T>;
  limit(count: number): DbQueryBuilder<T>;
  range(from: number, to: number): DbQueryBuilder<T>;
  single(): Promise<DbResponse<any>>;
  maybeSingle(): Promise<DbResponse<any>>;
}

export interface DbClient {
  from<T = any>(table: string): DbQueryBuilder<T>;
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<DbResponse<T>>;
  prepare<T = Record<string, unknown>>(sql: string): PreparedStatement<T>;
}
