"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useCallback, useEffect, useState } from "react";
import { JobDetailDrawer } from "@/components/JobDetailDrawer";
import type { Job } from "@/lib/web/types";
import { FilterBar } from "./FilterBar";
import { JobRow, COL_TEMPLATE } from "./JobRow";
import { Pagination } from "./Pagination";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── URL helpers ─────────────────────────────────────────────────────────────

function sp(params: URLSearchParams, key: string, fallback = ""): string {
  return params.get(key) ?? fallback;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RolesView() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Derived URL state
  const q      = sp(searchParams, "q");
  const score  = searchParams.get("score") ?? searchParams.get("min_score") ?? "all";
  const source = sp(searchParams, "source", "all");
  const status = sp(searchParams, "status", "all");
  const remote = searchParams.get("remote") === "1";
  const sort   = sp(searchParams, "sort",   "score");
  const page   = Math.max(1, Number(sp(searchParams, "page", "1")));

  // ─── Data state ──────────────────────────────────────────────────────────
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [total, setTotal]       = useState(0);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [drawerJobId, setDrawerJobId]       = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex]     = useState(-1);
  const [statusOverrides, setOverrides]     = useState<Record<string, string>>({});

  // ─── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page",     String(page));
    params.set("pageSize", String(PAGE_SIZE));

    if (sort === "score") params.set("sort", "score");
    else if (sort === "newest") params.set("sort", "tracked");
    else params.set("sort", "posted");

    if (q)             params.set("search",   q);
    if (score !== "all") params.set("minScore", score);
    if (source !== "all") params.set("source", source);
    if (status !== "all") params.set("status", status);
    if (remote)          params.set("remote", "1");

    fetch(`/api/jobs?${params}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<{ jobs?: Job[]; total?: number }>; })
      .then((d) => { if (!cancelled) { setJobs(d.jobs ?? []); setTotal(d.total ?? 0); setLoading(false); } })
      .catch((e: unknown) => { if (!cancelled) { setError(e instanceof Error ? e.message : "Failed"); setLoading(false); } });

    return () => { cancelled = true; };
  }, [q, score, source, status, remote, sort, page]);

  // ─── URL param writer ─────────────────────────────────────────────────────
  const setParam = useCallback(
    (updates: Record<string, string | null>, useReplace = true) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (!v || v === "all" || v === "0") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      const url = `${pathname}${qs ? `?${qs}` : ""}`;
      startTransition(() => {
        if (useReplace) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  const applyOptimisticStatusChange = useCallback(
    (jobId: string, payload: { status: string }) => {
      const previous = statusOverrides[jobId] ?? jobs.find((job) => job.id === jobId)?.status ?? null;
      setOverrides((current) => ({ ...current, [jobId]: payload.status }));

      return () => {
        setOverrides((current) => {
          const next = { ...current };
          if (previous == null) delete next[jobId];
          else next[jobId] = previous;
          return next;
        });
      };
    },
    [jobs, statusOverrides],
  );

  // ─── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, jobs.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const job = jobs[focusedIndex];
        if (job) setDrawerJobId(job.id);
      } else if (e.key === "Escape") {
        setDrawerJobId(null);
        setFocusedIndex(-1);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedIndex, jobs]);

  // ─── Active filter count ──────────────────────────────────────────────────
  const activeFilterCount = [q, score !== "all", source !== "all", status !== "all", remote]
    .filter(Boolean).length;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <FilterBar
        q={q} score={score} source={source} status={status}
        remote={remote} sort={sort} activeFilterCount={activeFilterCount}
        onQ={(v)      => setParam({ q: v,      page: null })}
        onScore={(v)  => setParam({ score: v,  page: null })}
        onSource={(v) => setParam({ source: v, page: null })}
        onStatus={(v) => setParam({ status: v, page: null })}
        onRemote={()  => setParam({ remote: remote ? null : "1", page: null })}
        onSort={(v)   => setParam({ sort: v,   page: null })}
      />

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {/* Column headers */}
        <div
          className="sticky top-0 z-10 bg-surface border-b border-edge grid"
          style={{ gridTemplateColumns: COL_TEMPLATE }}
        >
          {["Score", "Company", "Title", "Location", "Src", "Posted", "Status"].map((h) => (
            <div key={h} className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-fg-3 first:px-2 first:text-center">
              {h}
            </div>
          ))}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="flex flex-col">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-10 border-b border-edge animate-pulse"
                style={{ background: `rgba(26,26,30,${0.8 - i * 0.05})` }}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="px-5 py-10 font-mono text-[12px] text-red">
            ✗ {error}
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && jobs.length === 0 && (
          <div className="py-20 flex flex-col items-center gap-2">
            <p className="font-mono text-[11px] text-fg-3 uppercase tracking-widest">
              No roles match
            </p>
            <p className="text-[12px] text-fg-3">
              Adjust filters or check back after the next scrape.
            </p>
          </div>
        )}

        {/* Job rows */}
        {!isLoading && !error &&
          jobs.map((job, i) => (
            <JobRow
              key={job.id}
              job={job}
              isFocused={focusedIndex === i}
              statusOverride={statusOverrides[job.id]}
              onOpen={() => setDrawerJobId(job.id)}
              onFocus={() => setFocusedIndex(i)}
            />
          ))
        }
      </div>

      {/* Pagination */}
      {!isLoading && total > PAGE_SIZE && (
        <div className="shrink-0 border-t border-edge">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(p) => setParam({ page: String(p) }, false)}
          />
        </div>
      )}

      {/* Keyboard hints */}
      <div className="shrink-0 border-t border-edge bg-surface px-5 py-1.5 flex items-center gap-5 overflow-x-auto">
        {([
          ["j / k", "navigate"],
          ["↵",     "open"],
          ["esc",   "clear"],
        ] as const).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5 shrink-0">
            <kbd className="font-mono text-[9px] px-1 py-px bg-surface-2 border border-edge rounded text-fg-2 leading-none">
              {key}
            </kbd>
            <span className="font-mono text-[9px] text-fg-3">{label}</span>
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] text-fg-3 tabular-nums shrink-0">
          {total > 0 ? `${total.toLocaleString()} roles` : ""}
        </span>
      </div>

      <JobDetailDrawer
        jobId={drawerJobId}
        open={drawerJobId != null}
        onClose={() => setDrawerJobId(null)}
        onOptimisticStatusChange={applyOptimisticStatusChange}
      />
    </div>
  );
}
