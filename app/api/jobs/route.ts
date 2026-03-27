import type { NextRequest } from "next/server";
import { initDb } from "@/src/db";
import { listBrowseJobs } from "@/src/db/repositories";
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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const db = await initDb();

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
    limit: 5000,
  };

  const jobs = await listBrowseJobs(db, filters);
  const total = jobs.length;
  const start = (page - 1) * pageSize;
  const pageItems = jobs.slice(start, start + pageSize).map(toWebJob);

  return Response.json({
    jobs: pageItems,
    total,
    page,
    pageSize,
  });
}
