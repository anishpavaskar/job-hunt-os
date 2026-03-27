import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DbClient } from "./client";
import { getOrCreateInMemoryDb, resetInMemoryDbs } from "./in-memory";

let supabase: SupabaseClient | null = null;
let connectionCheck: Promise<void> | null = null;
const isTestEnv = (): boolean => process.env.NODE_ENV === "test" || Boolean(process.env.JEST_WORKER_ID);

export function getSupabase(): SupabaseClient {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.");
  }

  supabase = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

function withPrepareShim(client: SupabaseClient): DbClient {
  const dbClient = client as unknown as DbClient;
  if (typeof dbClient.prepare !== "function") {
    dbClient.prepare = () => {
      throw new Error("prepare() is only available on the in-memory test DB client.");
    };
  }
  return dbClient;
}

async function verifyConnection(client: DbClient): Promise<void> {
  const { error } = await client.from("jobs").select("id").limit(1);
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
}

export function initDb(dbPath?: string): DbClient {
  if (isTestEnv()) {
    return getOrCreateInMemoryDb(dbPath);
  }
  const client = withPrepareShim(getSupabase());
  connectionCheck ??= verifyConnection(client);
  void connectionCheck.catch(() => {
    connectionCheck = null;
  });
  return client;
}

export async function ensureDbConnection(): Promise<void> {
  const client = initDb();
  connectionCheck ??= verifyConnection(client);
  await connectionCheck;
}

export function closeDb(): void {
  supabase = null;
  connectionCheck = null;
  resetInMemoryDbs();
}

export function resetDb(): void {
  closeDb();
}
