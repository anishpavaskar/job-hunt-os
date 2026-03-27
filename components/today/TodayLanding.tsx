"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { JobDetailDrawer } from "@/components/JobDetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { RiskLine } from "@/components/ui/RiskLine";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { SkillTag } from "@/components/ui/SkillTag";
import { StatusPill } from "@/components/ui/StatusPill";
import type { BriefingDashboardData, BriefingRoleSummary } from "@/lib/web/types";

function formatPageDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string | null): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function readErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string") return error;
  }
  return "Request failed.";
}

function RoleActions({
  role,
  pending,
  error,
  onShortlist,
}: {
  role: BriefingRoleSummary;
  pending: boolean;
  error?: string;
  onShortlist: () => Promise<void>;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {role.status === "new" ? (
        <button
          type="button"
          onClick={() => {
            void onShortlist();
          }}
          disabled={pending}
          className="inline-flex h-8 items-center rounded-sm border border-edge bg-surface-2 px-3 font-mono text-[11px] text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Shortlist"}
        </button>
      ) : (
        <StatusPill status={role.status} />
      )}
      {role.url ? (
        <a
          href={role.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center rounded-sm border border-blue/30 bg-blue/10 px-3 font-mono text-[11px] text-blue transition-colors hover:bg-blue/15"
        >
          Open →
        </a>
      ) : null}
      {error ? <p className="text-[12px] text-red">{error}</p> : null}
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="p-8 md:p-10">
      <div className="h-10 w-72 animate-pulse rounded-sm bg-surface-2" />
      <div className="mt-3 h-4 w-80 animate-pulse rounded-sm bg-surface-2" />

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-sm border border-edge bg-surface p-4">
            <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-2" />
            <div className="mt-4 h-8 w-20 animate-pulse rounded-sm bg-surface-2" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-sm border border-edge bg-surface p-5">
            <div className="h-5 w-40 animate-pulse rounded-sm bg-surface-2" />
            <div className="mt-4 h-16 animate-pulse rounded-sm bg-surface-2" />
            <div className="mt-3 h-8 w-48 animate-pulse rounded-sm bg-surface-2" />
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-sm border border-edge bg-surface">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="border-b border-edge p-4 last:border-b-0">
            <div className="h-4 w-56 animate-pulse rounded-sm bg-surface-2" />
            <div className="mt-3 h-3 w-72 animate-pulse rounded-sm bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TodayLanding() {
  const [data, setData] = useState<BriefingDashboardData | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [showFunnel, setShowFunnel] = useState(false);
  const [expandedDraftId, setExpandedDraftId] = useState<number | null>(null);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async (preserveData = false) => {
    if (!preserveData) setLoading(true);
    setPageError(null);

    try {
      const response = await fetch("/api/briefing", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(payload));
      }

      const nextData = payload as BriefingDashboardData;
      setData(nextData);
      setShowFunnel((current) => current || nextData.isMonday);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load today view.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const setPending = (key: string, value: boolean) => {
    setPendingActions((current) => ({ ...current, [key]: value }));
  };

  const setActionError = (key: string, value?: string) => {
    setActionErrors((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const shortlistRole = async (role: BriefingRoleSummary) => {
    const key = `job:${role.jobId}:shortlist`;
    setPending(key, true);
    setActionError(key);

    try {
      const response = await fetch(`/api/jobs/${role.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "shortlisted" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(payload));
      }

      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          highPriorityRoles: current.highPriorityRoles.filter((item) => item.jobId !== role.jobId),
          newTodayRoles: current.newTodayRoles.map((item) =>
            item.jobId === role.jobId ? { ...item, status: "shortlisted" } : item,
          ),
        };
      });
      void loadData(true);
    } catch (error) {
      setActionError(key, error instanceof Error ? error.message : "Failed to shortlist role.");
    } finally {
      setPending(key, false);
    }
  };

  const markApplied = async (jobId: number) => {
    const key = `job:${jobId}:applied`;
    setPending(key, true);
    setActionError(key);

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(payload));
      }

      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          drafts: current.drafts.filter((draft) => draft.jobId !== jobId),
          highPriorityRoles: current.highPriorityRoles.filter((role) => role.jobId !== jobId),
          newTodayRoles: current.newTodayRoles.map((role) =>
            role.jobId === jobId ? { ...role, status: "applied" } : role,
          ),
        };
      });
      void loadData(true);
    } catch (error) {
      setActionError(key, error instanceof Error ? error.message : "Failed to mark applied.");
    } finally {
      setPending(key, false);
    }
  };

  const updateFollowup = async (followupId: number, action: "done" | "snooze") => {
    const key = `followup:${followupId}:${action}`;
    setPending(key, true);
    setActionError(key);

    try {
      const response = await fetch(`/api/followups/${followupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days: 3 }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(payload));
      }

      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          followups: action === "done"
            ? current.followups.filter((followup) => followup.followupId !== followupId)
            : current.followups.map((followup) =>
                followup.followupId === followupId
                  ? {
                      ...followup,
                      dueAt: typeof payload?.dueAt === "string" ? payload.dueAt : followup.dueAt,
                      overdue: false,
                    }
                  : followup,
              ),
        };
      });
      void loadData(true);
    } catch (error) {
      setActionError(key, error instanceof Error ? error.message : "Failed to update follow-up.");
    } finally {
      setPending(key, false);
    }
  };

  const applyOptimisticStatusChange = useCallback((jobId: string, payload: { status: string }) => {
    const numericJobId = Number.parseInt(jobId, 10);
    if (!Number.isFinite(numericJobId) || !data) return undefined;

    const snapshot = data;
    setData((current) => current ? {
      ...current,
      highPriorityRoles: current.highPriorityRoles
        .filter((role) => role.jobId !== numericJobId || payload.status === "new")
        .map((role) => role.jobId === numericJobId ? { ...role, status: payload.status as BriefingRoleSummary["status"] } : role),
      newTodayRoles: current.newTodayRoles.map((role) => (
        role.jobId === numericJobId
          ? { ...role, status: payload.status as BriefingRoleSummary["status"] }
          : role
      )),
    } : current);

    return () => setData(snapshot);
  }, [data]);

  if (isLoading && !data) {
    return <TodaySkeleton />;
  }

  if (!data) {
    return (
      <div className="p-8 md:p-10">
        <EmptyState
          message="Today view is unavailable."
          description={pageError ?? "Try reloading the page."}
          action={{ label: "Retry", onClick: () => { void loadData(false); } }}
        />
      </div>
    );
  }

  return (
    <div className="p-8 md:p-10">
      <header className="max-w-4xl">
        <p className="text-[13px] text-fg-3">What should I do right now</p>
        <h1 className="mt-2 text-balance text-[36px] font-semibold text-fg">
          {formatPageDate(data.generatedAt)}
        </h1>
        <p className="mt-3 text-pretty text-[15px] text-fg-2">
          {`${data.summary.newRoles} new roles · ${data.summary.scored60Plus} scored 60+ · ${data.summary.followupsDue} follow-ups due`}
        </p>
        {pageError ? <p className="mt-2 text-[12px] text-red">{pageError}</p> : null}
      </header>

      <section className="mt-8 grid gap-3 md:grid-cols-3">
        <div className="rounded-sm border border-edge bg-surface px-4 py-4">
          <p className="text-[12px] text-fg-3">Top score</p>
          <p className="mt-3 font-mono text-[28px] font-semibold tabular-nums text-fg">
            {data.metrics.topScore ?? "--"}
          </p>
        </div>
        <div className="rounded-sm border border-edge bg-surface px-4 py-4">
          <p className="text-[12px] text-fg-3">Applied this week</p>
          <p className="mt-3 font-mono text-[28px] font-semibold tabular-nums text-fg">
            {data.metrics.appliedThisWeek}
          </p>
        </div>
        <div className="rounded-sm border border-edge bg-surface px-4 py-4">
          <p className="text-[12px] text-fg-3">Follow-ups due</p>
          <p className="mt-3 font-mono text-[28px] font-semibold tabular-nums text-fg">
            {data.metrics.followupsDue}
          </p>
        </div>
      </section>

      {data.highPriorityRoles.length > 0 ? (
        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] text-fg-3">Don&apos;t miss these</p>
              <h2 className="mt-1 text-balance text-[24px] font-semibold text-fg">High-priority roles</h2>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {data.highPriorityRoles.map((role) => {
              const errorKey = `job:${role.jobId}:shortlist`;
              return (
                <article key={role.jobId} className="rounded-sm border border-edge bg-surface p-5">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setDrawerJobId(String(role.jobId))}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[13px] text-fg-2">{role.company}</p>
                        <h3 className="mt-1 text-balance text-[19px] font-semibold text-fg">{role.title}</h3>
                      </div>
                      <ScoreBadge score={role.score} size="lg" />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {role.skillMatches.length > 0 ? (
                        role.skillMatches.map((skill, index) => (
                          <SkillTag key={`${role.jobId}:${skill}`} skill={skill} tier={index === 0 ? 1 : 2} />
                        ))
                      ) : (
                        <SkillTag skill="General fit" tier={3} />
                      )}
                    </div>

                    <div className="mt-4">
                      <RiskLine risk={role.risk} level={role.riskLevel} />
                    </div>
                  </button>

                  <RoleActions
                    role={role}
                    pending={Boolean(pendingActions[errorKey])}
                    error={actionErrors[errorKey]}
                    onShortlist={async () => shortlistRole(role)}
                  />
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-8 rounded-sm border border-edge bg-surface">
        <div className="flex items-end justify-between gap-4 border-b border-edge px-5 py-4">
          <div>
            <p className="text-[12px] text-fg-3">Last 24 hours</p>
            <h2 className="mt-1 text-balance text-[24px] font-semibold text-fg">New today</h2>
          </div>
          <Link
            href="/roles"
            className="font-mono text-[11px] text-blue transition-colors hover:text-fg"
          >
            View all in Roles →
          </Link>
        </div>

        {data.newTodayRoles.length === 0 ? (
          <EmptyState
            message="No new 50+ roles in the last 24 hours."
            description="Run a fresh scan or review the broader roles table."
          />
        ) : (
          <div>
            {data.newTodayRoles.map((role) => {
              const errorKey = `job:${role.jobId}:shortlist`;
              return (
                <article key={role.jobId} className="border-b border-edge px-5 py-4 last:border-b-0">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => setDrawerJobId(String(role.jobId))}
                      className="min-w-0 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] text-fg-2">{role.company}</p>
                        <StatusPill status={role.status} />
                        <span className="font-mono text-[11px] text-fg-3">
                          tracked {formatShortDate(role.discoveredAt)}
                        </span>
                      </div>
                      <h3 className="mt-1 text-balance text-[17px] font-semibold text-fg">{role.title}</h3>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <ScoreBadge score={role.score} size="sm" />
                        {role.skillMatches.length > 0 ? (
                          role.skillMatches.map((skill, index) => (
                            <SkillTag key={`${role.jobId}:${skill}`} skill={skill} tier={index === 0 ? 1 : 2} />
                          ))
                        ) : (
                          <SkillTag skill="General fit" tier={3} />
                        )}
                      </div>
                      <div className="mt-3">
                        <RiskLine risk={role.risk} level={role.riskLevel} />
                      </div>
                    </button>

                    <RoleActions
                      role={role}
                      pending={Boolean(pendingActions[errorKey])}
                      error={actionErrors[errorKey]}
                      onShortlist={async () => shortlistRole(role)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-sm border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-4">
          <p className="text-[12px] text-fg-3">Pipeline hygiene</p>
          <h2 className="mt-1 text-balance text-[24px] font-semibold text-fg">Follow-ups due</h2>
        </div>

        {data.followups.length === 0 ? (
          <EmptyState
            message="No follow-ups due."
            description="Nothing needs a nudge right now."
          />
        ) : (
          <div>
            {data.followups.map((followup) => {
              const doneKey = `followup:${followup.followupId}:done`;
              const snoozeKey = `followup:${followup.followupId}:snooze`;
              return (
                <article
                  key={followup.followupId}
                  className={`border-b border-edge px-5 py-4 last:border-b-0 ${followup.overdue ? "bg-amber/6" : ""}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-balance text-[16px] font-semibold text-fg">
                        {followup.company} · {followup.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-2">
                        <span>Applied {formatShortDate(followup.appliedAt)}</span>
                        <span className="font-mono text-[11px] text-fg-3">
                          {followup.daysSinceApplied == null
                            ? "days since unavailable"
                            : `${followup.daysSinceApplied} days since`}
                        </span>
                        <span className={followup.overdue ? "font-mono text-[11px] text-amber" : "font-mono text-[11px] text-fg-3"}>
                          due {formatShortDate(followup.dueAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void updateFollowup(followup.followupId, "done");
                        }}
                        disabled={Boolean(pendingActions[doneKey])}
                        className="inline-flex h-8 items-center rounded-sm border border-edge bg-surface-2 px-3 font-mono text-[11px] text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
                      >
                        {pendingActions[doneKey] ? "Saving..." : "Mark done"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void updateFollowup(followup.followupId, "snooze");
                        }}
                        disabled={Boolean(pendingActions[snoozeKey])}
                        className="inline-flex h-8 items-center rounded-sm border border-blue/30 bg-blue/10 px-3 font-mono text-[11px] text-blue transition-colors hover:bg-blue/15 disabled:opacity-50"
                      >
                        {pendingActions[snoozeKey] ? "Saving..." : "Snooze 3 days"}
                      </button>
                    </div>
                  </div>
                  {actionErrors[doneKey] || actionErrors[snoozeKey] ? (
                    <p className="mt-2 text-[12px] text-red">
                      {actionErrors[doneKey] ?? actionErrors[snoozeKey]}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-sm border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-4">
          <p className="text-[12px] text-fg-3">Ready to ship</p>
          <h2 className="mt-1 text-balance text-[24px] font-semibold text-fg">Drafts ready to send</h2>
        </div>

        {data.drafts.length === 0 ? (
          <EmptyState
            message="No drafts are waiting."
            description="Once a draft is saved, it will show up here until you mark the role applied."
          />
        ) : (
          <div>
            {data.drafts.map((draft) => {
              const key = `job:${draft.jobId}:applied`;
              const expanded = expandedDraftId === draft.draftId;
              return (
                <article key={draft.draftId} className="border-b border-edge px-5 py-4 last:border-b-0">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-balance text-[16px] font-semibold text-fg">
                        {draft.company} · {draft.title}
                      </h3>
                      <p className="mt-2 text-pretty text-[13px] text-fg-2">{draft.preview}</p>
                      <p className="mt-2 font-mono text-[11px] text-fg-3">
                        {draft.variant} · updated {formatShortDate(draft.updatedAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedDraftId(expanded ? null : draft.draftId)}
                        className="inline-flex h-8 items-center rounded-sm border border-edge bg-surface-2 px-3 font-mono text-[11px] text-fg transition-colors hover:bg-surface-3"
                      >
                        {expanded ? "Hide draft" : "View draft"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void markApplied(draft.jobId);
                        }}
                        disabled={Boolean(pendingActions[key])}
                        className="inline-flex h-8 items-center rounded-sm border border-blue/30 bg-blue/10 px-3 font-mono text-[11px] text-blue transition-colors hover:bg-blue/15 disabled:opacity-50"
                      >
                        {pendingActions[key] ? "Saving..." : "Mark applied"}
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-4 rounded-sm border border-edge bg-surface-2 p-4">
                      <pre className="whitespace-pre-wrap text-pretty text-[13px] text-fg">{draft.content}</pre>
                    </div>
                  ) : null}
                  {actionErrors[key] ? <p className="mt-2 text-[12px] text-red">{actionErrors[key]}</p> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {!showFunnel ? (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowFunnel(true)}
            className="inline-flex h-8 items-center rounded-sm border border-edge bg-surface px-3 font-mono text-[11px] text-fg transition-colors hover:bg-surface-2"
          >
            Show weekly funnel
          </button>
        </div>
      ) : (
        <section className="mt-8 rounded-sm border border-edge bg-surface">
          <div className="flex items-end justify-between gap-4 border-b border-edge px-5 py-4">
            <div>
              <p className="text-[12px] text-fg-3">Pipeline snapshot</p>
              <h2 className="mt-1 text-balance text-[24px] font-semibold text-fg">Weekly funnel</h2>
            </div>
            {!data.isMonday ? (
              <button
                type="button"
                onClick={() => setShowFunnel(false)}
                className="font-mono text-[11px] text-fg-3 transition-colors hover:text-fg"
              >
                Hide
              </button>
            ) : null}
          </div>

          <div className="overflow-x-auto px-5 py-5">
            <div className="flex min-w-[760px] items-stretch gap-3">
              {data.funnel.stages.map((stage, index) => (
                <div key={stage.label} className="flex items-center gap-3">
                  <div className="min-w-[132px] rounded-sm border border-edge bg-surface-2 px-4 py-4">
                    <p className="text-[12px] text-fg-3">{stage.label}</p>
                    <p className="mt-2 font-mono text-[24px] font-semibold tabular-nums text-fg">{stage.count}</p>
                  </div>
                  {index < data.funnel.stages.length - 1 ? (
                    <div className="min-w-[72px]">
                      <p className="font-mono text-[11px] text-fg-3">
                        {data.funnel.stages[index + 1]?.conversionRate ?? "0%"}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
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
