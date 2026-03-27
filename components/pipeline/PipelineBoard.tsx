"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import { JobDetailDrawer } from "@/components/JobDetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { PipelineBoardData, PipelineCard, PipelineColumnId, WebJobSource } from "@/lib/web/types";
import { cn } from "@/lib/utils";

const SOURCE_OPTIONS: Array<{ value: WebJobSource | "all"; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "yc", label: "YC" },
  { value: "careers", label: "Careers" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
];

function readErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string") return error;
  }
  return "Request failed.";
}

function columnEmptyLabel(column: PipelineColumnId): string {
  switch (column) {
    case "shortlisted":
      return "No shortlisted roles yet.";
    case "drafted":
      return "No drafts waiting in pipeline.";
    case "applied":
      return "No applications in flight.";
    case "responded":
      return "No responses yet.";
    case "interview":
      return "No interviews scheduled.";
    case "offer":
      return "Offer tracking will land here.";
    case "rejected":
      return "No rejections tracked.";
    case "archived":
      return "Nothing archived.";
  }
}

function mapColumn(
  status: string,
  interviewStage?: string | null,
): PipelineColumnId | null {
  switch (status) {
    case "shortlisted":
      return "shortlisted";
    case "drafted":
      return "drafted";
    case "applied":
    case "followup_due":
      return "applied";
    case "replied":
      return "responded";
    case "interview":
      return interviewStage === "offer" ? "offer" : "interview";
    case "rejected":
      return "rejected";
    case "archived":
      return "archived";
    default:
      return null;
  }
}

function applyOptimisticBoardUpdate(
  board: PipelineBoardData,
  jobId: string,
  payload: { status: string; interviewStage?: string | null },
): PipelineBoardData {
  const nextColumnId = mapColumn(payload.status, payload.interviewStage);
  if (!nextColumnId) return board;

  const targetCard = board.columns
    .flatMap((column) => column.cards)
    .find((candidate) => candidate.id === jobId);
  if (!targetCard) return board;

  const columnsWithoutCard = board.columns.map((column) => {
    return {
      ...column,
      cards: column.cards.filter((candidate) => candidate.id !== jobId),
    };
  });

  const updatedCard: PipelineCard = {
    ...targetCard,
    status: payload.status as PipelineCard["status"],
    column: nextColumnId,
    interviewStage: payload.interviewStage ?? targetCard.interviewStage,
    daysInStatus: 0,
    followupDue: payload.status === "followup_due",
  };

  const nextColumns = columnsWithoutCard.map((column) => (
    column.id === nextColumnId
      ? { ...column, cards: [updatedCard, ...column.cards] }
      : column
  )).map((column) => ({
    ...column,
    count: column.cards.length,
  }));

  return {
    ...board,
    columns: nextColumns,
    totalCards: nextColumns.reduce((sum, column) => sum + column.cards.length, 0),
  };
}

function PipelineSkeleton() {
  return (
    <div className="p-8 md:p-10">
      <div className="h-10 w-52 animate-pulse rounded-sm bg-surface-2" />
      <div className="mt-3 h-4 w-72 animate-pulse rounded-sm bg-surface-2" />

      <div className="mt-8 rounded-sm border border-edge bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <div className="h-10 animate-pulse rounded-sm bg-surface-2" />
          <div className="h-10 animate-pulse rounded-sm bg-surface-2" />
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <div className="grid auto-cols-[280px] grid-flow-col gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="rounded-sm border border-edge bg-surface">
              <div className="border-b border-edge px-4 py-3">
                <div className="h-4 w-28 animate-pulse rounded-sm bg-surface-2" />
              </div>
              <div className="space-y-3 p-3">
                {Array.from({ length: 3 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="rounded-sm border border-edge bg-void p-3">
                    <div className="h-4 w-32 animate-pulse rounded-sm bg-surface-2" />
                    <div className="mt-2 h-3 w-40 animate-pulse rounded-sm bg-surface-2" />
                    <div className="mt-4 h-3 w-24 animate-pulse rounded-sm bg-surface-2" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PipelineBoard() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<WebJobSource | "all">("all");
  const deferredSearch = useDeferredValue(search);

  const [data, setData] = useState<PipelineBoardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setPageError(null);

      try {
        const params = new URLSearchParams();
        if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
        if (source !== "all") params.set("source", source);

        const response = await fetch(`/api/pipeline?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(readErrorMessage(payload));
        }

        if (!cancelled) {
          setData(payload as PipelineBoardData);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load pipeline.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [deferredSearch, source]);

  function applyOptimisticStatusChange(
    jobId: string,
    payload: { status: string; interviewStage?: string | null },
  ) {
    if (!data) return undefined;
    const snapshot = data;
    setData((current) => current ? applyOptimisticBoardUpdate(current, jobId, payload) : current);
    return () => setData(snapshot);
  }

  if (isLoading && !data) {
    return <PipelineSkeleton />;
  }

  if (!data) {
    return (
      <div className="p-8 md:p-10">
        <EmptyState
          message="Pipeline is unavailable."
          description={pageError ?? "Try reloading the board."}
          action={{ label: "Retry", onClick: () => window.location.reload() }}
        />
      </div>
    );
  }

  return (
    <div className="p-8 md:p-10">
      <header className="max-w-4xl">
        <p className="text-[13px] text-fg-3">Application tracking</p>
        <h1 className="mt-2 text-balance text-[28px] font-semibold text-fg">Pipeline</h1>
        <p className="mt-2 max-w-2xl text-pretty text-[14px] text-fg-2">
          Keep active applications moving without adding drag-and-drop ceremony.
        </p>
        {pageError ? <p className="mt-2 text-[12px] text-red">{pageError}</p> : null}
      </header>

      <section className="mt-8 rounded-sm border border-edge bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="flex flex-col gap-2">
            <span className="text-[12px] text-fg-3">Search by company</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Company name"
              className="h-10 rounded-sm border border-edge bg-surface-2 px-3 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-blue/40"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[12px] text-fg-3">Source</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as WebJobSource | "all")}
              className="h-10 rounded-sm border border-edge bg-surface-2 px-3 text-[13px] text-fg outline-none transition-colors focus:border-blue/40"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {data.totalCards === 0 ? (
        <div className="mt-8 rounded-sm border border-edge bg-surface px-6 py-10 text-center">
          <p className="text-[16px] font-medium text-fg">
            No applications yet. Head to Roles to find your first opportunity.
          </p>
          <p className="mt-2 text-pretty text-[13px] text-fg-2">
            Once you shortlist, draft, or apply, those roles will appear here.
          </p>
          <Link
            href="/roles?min_score=60&status=new"
            className="mt-5 inline-flex h-8 items-center rounded-sm border border-blue/30 bg-blue/10 px-3 font-mono text-[11px] text-blue transition-colors hover:bg-blue/15"
          >
            Find roles →
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <div className="grid auto-cols-[292px] grid-flow-col gap-4 pb-2">
            {data.columns.map((column) => (
              <section key={column.id} className="flex min-h-[520px] flex-col rounded-sm border border-edge bg-surface">
                <header className="border-b border-edge px-4 py-3">
                  <h2 className="text-[15px] font-semibold text-fg">
                    {column.label} <span className="font-mono text-[13px] text-fg-3">({column.count})</span>
                  </h2>
                </header>

                <div className="flex flex-1 flex-col gap-3 p-3">
                  {column.cards.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-edge bg-void/50 px-3 py-6 text-center text-[13px] text-fg-3">
                      {columnEmptyLabel(column.id)}
                    </div>
                  ) : (
                    column.cards.map((card) => {
                      return (
                        <article key={card.id} className="overflow-hidden rounded-sm border border-edge bg-void">
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            onClick={() => setDrawerJobId(card.id)}
                            className={cn(
                              "w-full px-3 py-3 text-left transition-colors",
                              "hover:bg-surface-2/60",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-semibold text-fg">{card.company}</p>
                                <p className="mt-1 truncate text-[12px] text-fg-2">{card.title}</p>
                              </div>
                              <ScoreBadge score={card.score} size="sm" />
                            </div>

                            <div className="mt-3 flex items-center gap-2 text-[11px] text-fg-3">
                              <span className="font-mono tabular-nums">{card.daysInStatus}d in status</span>
                              {card.followupDue ? (
                                <span className="inline-flex items-center gap-1 font-mono text-amber">
                                  <span className="size-2 rounded-full bg-amber" />
                                  Follow-up due
                                </span>
                              ) : null}
                            </div>
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      <JobDetailDrawer
        jobId={drawerJobId}
        open={drawerJobId != null}
        onClose={() => setDrawerJobId(null)}
        onOptimisticStatusChange={applyOptimisticStatusChange}
      />
    </div>
  );
}
