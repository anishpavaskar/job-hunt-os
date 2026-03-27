import type { NextRequest } from "next/server";
import { getSupabase } from "@/src/db";
import { normalizeJobRow } from "@/src/db/repositories";
import { startApiRequest } from "@/lib/server/api-debug";
import type { BrowseFilters, JobStatus } from "@/src/db/types";
import { toWebJob } from "@/lib/server/web-data";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<JobStatus>([
  "new",
  "reviewed",
  "saved",
  "shortlisted",
  "drafted",
  "applied",
  "followup_due",
  "replied",
  "interview",
  "rejected",
  "archived",
]);

function parseSort(params: URLSearchParams): BrowseFilters["sort"] {
  const sort = params.get("sort");
  if (sort === "tracked" || sort === "posted" || sort === "company" || sort === "score") {
    return sort;
  }

  const sortField = params.get("sortField");
  const sortDir = params.get("sortDir");
  if (sortField === "score") return "score";
  if (sortField === "date" && sortDir === "desc") return "tracked";
  if (sortField === "date") return "posted";
  return "score";
}

function parseStatus(value: string | null): JobStatus | undefined {
  if (!value || value === "all") return undefined;
  return VALID_STATUSES.has(value as JobStatus) ? (value as JobStatus) : undefined;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeLike(value: string): string {
  return value.replace(/[,%_]/g, "");
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const logger = startApiRequest("/api/jobs", {
    rawQuery: request.nextUrl.search,
  });
  const db = getSupabase();

  const page = Math.max(1, parseNumber(params.get("page")) ?? 1);
  const pageSize = Math.min(100, Math.max(1, parseNumber(params.get("pageSize")) ?? 20));

  const filters: BrowseFilters = {
    query: params.get("search") ?? undefined,
    minScore: parseNumber(params.get("minScore")),
    source: params.get("source") && params.get("source") !== "all" ? params.get("source") ?? undefined : undefined,
    status: parseStatus(params.get("status")),
    remoteOnly: params.get("remote") === "1",
    sort: parseSort(params),
    realRolesOnly: true,
  };
  const start = (page - 1) * pageSize;

  let query = db
    .from("jobs")
    .select("*, job_sources!inner(provider, external_id, url)", { count: "exact" });

  if (filters.query) {
    const search = escapeLike(filters.query);
    if (search) {
      query = query.or(`company_name.ilike.%${search}%,title.ilike.%${search}%`);
    }
  }
  if (filters.minScore != null) {
    query = (query as any).gte("score", filters.minScore);
  }
  const maxScore = parseNumber(params.get("maxScore"));
  if (maxScore != null) {
    query = (query as any).lte("score", maxScore);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.remoteOnly) {
    query = query.eq("remote_flag", true);
  }
  if (filters.source) {
    query = query.eq("job_sources.provider", filters.source);
  }
  if (filters.realRolesOnly) {
    query = (query as any).neq("role_source", "company_fallback");
  }

  switch (filters.sort) {
    case "tracked":
      query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
      break;
    case "posted":
      query = (query as any)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .order("score", { ascending: false });
      break;
    case "company":
      query = query.order("company_name", { ascending: true }).order("score", { ascending: false });
      break;
    default:
      query = query.order("score", { ascending: false }).order("id", { ascending: false });
      break;
  }

  const { data, error, count } = await logger.query(
    "jobs_page",
    () => query.range(start, start + pageSize - 1),
  );
  if (error) {
    logger.fail(error);
    return Response.json({ error: `Failed to load jobs: ${error.message}` }, { status: 500 });
  }

  const pageItems = (data ?? []).map((row) => toWebJob(normalizeJobRow(row))).map((job) => ({
    ...job,
    description: undefined,
    explanation: undefined,
  }));

  logger.finish({
    page,
    pageSize,
    returned: pageItems.length,
    total: count ?? 0,
    sort: filters.sort,
    source: filters.source ?? "all",
    status: filters.status ?? "all",
  });

  return Response.json({
    jobs: pageItems,
    total: count ?? 0,
    page,
    pageSize,
  });
}
