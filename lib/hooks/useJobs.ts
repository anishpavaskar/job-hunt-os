"use client";

import { useState, useEffect, useCallback } from "react";
import type { Job } from "@/lib/web/types";

export type JobSortField = "score" | "tracked" | "posted" | "company" | "title" | "status";
export type SortDirection = "asc" | "desc";

export interface JobFilters {
  status?: string;
  source?: string;
  minScore?: number;
  maxScore?: number;
  search?: string;
  tags?: string[];
  remote?: boolean;
}

export interface ScoreBreakdown {
  roleFit: number;
  stackFit: number;
  seniorityFit: number;
  freshness: number;
  companySignal: number;
}

export interface UseJobsResult {
  jobs: Job[];
  total: number;
  isLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  filters: JobFilters;
  setPage: (page: number) => void;
  setFilters: (filters: JobFilters) => void;
  setSort: (field: JobSortField, direction: SortDirection) => void;
  refetch: () => void;
}

const PAGE_SIZE = 50;

export function useJobs(initialFilters: JobFilters = {}): UseJobsResult {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFiltersState] = useState<JobFilters>(initialFilters);
  const [sort, setSortState] = useState<{
    field: JobSortField;
    direction: SortDirection;
  }>({ field: "score", direction: "desc" });

  const buildQuery = useCallback((): string => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    params.set("sort", sort.field);
    if (filters.status) params.set("status", filters.status);
    if (filters.source) params.set("source", filters.source);
    if (filters.minScore != null) params.set("minScore", String(filters.minScore));
    if (filters.maxScore != null) params.set("maxScore", String(filters.maxScore));
    if (filters.search) params.set("search", filters.search);
    if (filters.tags?.length) params.set("tags", filters.tags.join(","));
    return params.toString();
  }, [page, filters, sort]);

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs?${buildQuery()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json() as { jobs?: Job[]; total?: number };
      setJobs(data.jobs ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch jobs");
      setJobs([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const setFilters = useCallback((next: JobFilters) => {
    setFiltersState(next);
    setPage(1);
  }, []);

  const setSort = useCallback((field: JobSortField, direction: SortDirection) => {
    setSortState({ field, direction });
    setPage(1);
  }, []);

  return {
    jobs,
    total,
    isLoading,
    error,
    page,
    pageSize: PAGE_SIZE,
    filters,
    setPage,
    setFilters,
    setSort,
    refetch: fetchJobs,
  };
}
