"use client";

import { useState, useEffect, useCallback } from "react";
import type { Job } from "@/lib/web/types";

export type PipelineStatus =
  | "new"
  | "shortlisted"
  | "drafted"
  | "applied"
  | "interview"
  | "rejected"
  | "archived";

export interface PipelineGroup {
  status: PipelineStatus;
  jobs: Job[];
  count: number;
}

export interface PipelineSummary {
  total: number;
  byStatus: Record<PipelineStatus, number>;
  /** applied ÷ shortlisted, as a percentage */
  conversionRate: number;
  /** interview ÷ applied, as a percentage */
  interviewRate: number;
}

export interface UsePipelineResult {
  groups: PipelineGroup[];
  summary: PipelineSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const PIPELINE_STATUSES: PipelineStatus[] = [
  "new",
  "shortlisted",
  "drafted",
  "applied",
  "interview",
  "rejected",
  "archived",
];

export function usePipeline(): UsePipelineResult {
  const [groups, setGroups] = useState<PipelineGroup[]>([]);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPipeline = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline");
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json() as { jobs?: Job[] };

      const jobsList: Job[] = data.jobs ?? [];

      const grouped: PipelineGroup[] = PIPELINE_STATUSES.map((status) => {
        const statusJobs = jobsList.filter((j) => j.status === status);
        return { status, jobs: statusJobs, count: statusJobs.length };
      });
      setGroups(grouped);

      const byStatus = Object.fromEntries(
        PIPELINE_STATUSES.map((s) => [
          s,
          grouped.find((g) => g.status === s)?.count ?? 0,
        ])
      ) as Record<PipelineStatus, number>;

      const conversionRate =
        byStatus.shortlisted > 0
          ? Math.round((byStatus.applied / byStatus.shortlisted) * 100)
          : 0;
      const interviewRate =
        byStatus.applied > 0
          ? Math.round((byStatus.interview / byStatus.applied) * 100)
          : 0;

      setSummary({
        total: jobsList.length,
        byStatus,
        conversionRate,
        interviewRate,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pipeline");
      setGroups([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  return { groups, summary, isLoading, error, refetch: fetchPipeline };
}
