import { BrowseFilters, ReviewFilters } from "../db/types";

function parseIntOption(value?: string): number | undefined {
  const parsed = value ? parseInt(value, 10) : undefined;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildReviewFilters(opts: {
  query?: string;
  minScore?: string;
  status?: string;
  remote?: boolean;
  today?: boolean;
  limit?: string;
}): ReviewFilters {
  return {
    query: opts.query,
    minScore: parseIntOption(opts.minScore),
    status: opts.status as ReviewFilters["status"],
    remoteOnly: opts.remote ?? false,
    todayOnly: opts.today ?? false,
    limit: parseIntOption(opts.limit),
  };
}

export function buildBrowseFilters(opts: {
  query?: string;
  minScore?: string;
  status?: string;
  remote?: boolean;
  source?: string;
  prospect?: boolean;
  realRoles?: boolean;
  postedWithinDays?: string;
  trackedWithinDays?: string;
  sort?: string;
  limit?: string;
}): BrowseFilters {
  const source = opts.source && opts.source !== "all" ? opts.source : undefined;
  const sort = opts.sort ?? "score";
  const browseSort: NonNullable<BrowseFilters["sort"]> = new Set<string>(["score", "posted", "tracked", "company"]).has(sort)
    ? sort as NonNullable<BrowseFilters["sort"]>
    : "score";

  return {
    query: opts.query,
    minScore: parseIntOption(opts.minScore),
    status: opts.status as BrowseFilters["status"],
    remoteOnly: opts.remote ?? false,
    source,
    prospectOnly: opts.prospect ?? false,
    realRolesOnly: opts.realRoles ?? false,
    postedWithinDays: parseIntOption(opts.postedWithinDays),
    trackedWithinDays: parseIntOption(opts.trackedWithinDays),
    sort: browseSort,
    limit: parseIntOption(opts.limit),
  };
}
