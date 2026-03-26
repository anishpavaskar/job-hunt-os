import { ReviewFilters } from "../db/types";

export function buildReviewFilters(opts: {
  query?: string;
  minScore?: string;
  status?: string;
  remote?: boolean;
  today?: boolean;
  limit?: string;
}): ReviewFilters {
  const minScore = opts.minScore ? parseInt(opts.minScore, 10) : undefined;
  const limit = opts.limit ? parseInt(opts.limit, 10) : undefined;

  return {
    query: opts.query,
    minScore: Number.isFinite(minScore) ? minScore : undefined,
    status: opts.status as ReviewFilters["status"],
    remoteOnly: opts.remote ?? false,
    todayOnly: opts.today ?? false,
    limit: Number.isFinite(limit) ? limit : undefined,
  };
}
