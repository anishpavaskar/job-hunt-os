import path from "path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")] });

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local/.env");
  process.exit(1);
}

const supabaseUrl = url;
const supabaseServiceKey = serviceKey;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PAGE_SIZE = 1000;

async function timeQuery<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    console.log(`[supabase-test] ${label}`, { durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.error(`[supabase-test] ${label} failed`, {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function fetchAllPages(
  table: string,
  columns: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`${table} page ${from}-${from + PAGE_SIZE - 1}: ${error.message}`);
    }
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function main() {
  console.log("[supabase-test] connection_start", {
    urlHost: new URL(supabaseUrl).host,
    envSource: "Loaded from .env.local first, then .env fallback",
  });

  const countResponse = await timeQuery("count_jobs", async () =>
    supabase.from("jobs").select("id", { count: "exact", head: true }),
  );
  if (countResponse.error) throw new Error(`count_jobs: ${countResponse.error.message}`);
  console.log("[supabase-test] jobs_count", { count: countResponse.count ?? 0 });

  const roleSourceRows = await timeQuery("role_source_counts", async () =>
    fetchAllPages("jobs", "role_source"),
  );
  const roleSourceCounts = new Map<string, number>();
  for (const row of roleSourceRows) {
    const key = String((row as { role_source?: string }).role_source ?? "null");
    roleSourceCounts.set(key, (roleSourceCounts.get(key) ?? 0) + 1);
  }
  console.log("[supabase-test] role_source_counts_result", Object.fromEntries(
    [...roleSourceCounts.entries()].sort((left, right) => right[1] - left[1]),
  ));

  const topScoreResponse = await timeQuery("top_scored_job", async () =>
    supabase
      .from("jobs")
      .select("*")
      .order("score", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (topScoreResponse.error) throw new Error(`top_scored_job: ${topScoreResponse.error.message}`);
  console.log("[supabase-test] top_scored_job_result", topScoreResponse.data);

  const detailProbeResponse = await timeQuery("detail_probe", async () =>
    supabase
      .from("jobs")
      .select("id, company_name, title")
      .limit(1)
      .maybeSingle(),
  );
  if (detailProbeResponse.error) throw new Error(`detail_probe: ${detailProbeResponse.error.message}`);
  console.log("[supabase-test] detail_probe_result", detailProbeResponse.data);

  const providerRows = await timeQuery("provider_counts", async () =>
    fetchAllPages("job_sources", "provider"),
  );
  const providerCounts = new Map<string, number>();
  for (const row of providerRows) {
    const key = String((row as { provider?: string }).provider ?? "null");
    providerCounts.set(key, (providerCounts.get(key) ?? 0) + 1);
  }
  console.log("[supabase-test] provider_counts_result", Object.fromEntries(
    [...providerCounts.entries()].sort((left, right) => right[1] - left[1]),
  ));

  console.log("[supabase-test] connection_ok");
}

void main().catch((error) => {
  console.error("[supabase-test] fatal", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
