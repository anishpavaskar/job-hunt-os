"use client";

import { useEffect, useState } from "react";
import type { AnalyticsOverviewData, AnalyticsScoreBucket } from "@/lib/web/types";

export const dynamic = "force-dynamic";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDays(value: number | null): string {
  if (value == null) return "—";
  if (value < 1) return `${value.toFixed(1)}d`;
  return `${value.toFixed(1)}d`;
}

function histogramBarClass(bucket: AnalyticsScoreBucket): string {
  switch (bucket.color) {
    case "green":
      return "border-green/35 bg-green/15";
    case "amber":
      return "border-amber/35 bg-amber/15";
    default:
      return "border-edge-2 bg-surface-2";
  }
}

function AnalyticsSkeleton() {
  return (
    <div className="p-8 md:p-10">
      <div className="h-3 w-28 animate-pulse rounded-sm bg-surface-2" />
      <div className="mt-3 h-10 w-44 animate-pulse rounded-sm bg-surface-2" />
      <div className="mt-3 h-4 w-80 animate-pulse rounded-sm bg-surface-2" />

      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-sm border border-edge bg-surface px-4 py-4">
            <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-2" />
            <div className="mt-3 h-8 w-20 animate-pulse rounded-sm bg-surface-2" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-sm border border-edge bg-surface p-5">
          <div className="h-4 w-36 animate-pulse rounded-sm bg-surface-2" />
          <div className="mt-6 flex h-48 items-end gap-3">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="flex flex-1 flex-col gap-2">
                <div className="h-24 animate-pulse rounded-sm bg-surface-2" />
                <div className="h-3 animate-pulse rounded-sm bg-surface-2" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-sm border border-edge bg-surface p-5">
          <div className="h-4 w-32 animate-pulse rounded-sm bg-surface-2" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-sm bg-surface-2" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/jobs/stats", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
          throw new Error(message);
        }

        if (!cancelled) {
          setData(payload as AnalyticsOverviewData);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load analytics.");
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
  }, []);

  if (isLoading && !data) {
    return <AnalyticsSkeleton />;
  }

  if (!data) {
    return (
      <div className="p-8 md:p-10">
        <header className="max-w-4xl">
          <p className="font-mono text-[11px] uppercase text-fg-3">Stats and funnel</p>
          <h1 className="mt-2 text-[28px] font-semibold text-fg">Analytics</h1>
          <p className="mt-2 text-[14px] text-red">{error ?? "Analytics are unavailable right now."}</p>
        </header>
      </div>
    );
  }

  const notEnoughData = data.summary.applicationsSent < 5;
  const histogramMax = Math.max(1, ...data.scoreDistribution.map((bucket) => bucket.count));
  const timelineMax = Math.max(1, ...data.timeline.map((point) => point.count));
  const funnelMax = Math.max(1, data.funnel[0]?.count ?? 1);

  return (
    <div className="p-8 md:p-10">
      <header className="max-w-4xl">
        <p className="font-mono text-[11px] uppercase text-fg-3">Stats and funnel</p>
        <h1 className="mt-2 text-balance text-[28px] font-semibold text-fg">Analytics</h1>
        <p className="mt-2 max-w-2xl text-pretty text-[14px] text-fg-2">
          Performance across role quality, source mix, and application progression.
        </p>
        {error ? <p className="mt-2 text-[12px] text-red">{error}</p> : null}
      </header>

      {notEnoughData ? (
        <section className="mt-6 rounded-sm border border-amber/25 bg-amber/8 px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-amber">Low sample size</p>
          <p className="mt-2 text-[14px] text-fg">
            Analytics become meaningful after you&apos;ve applied to a few roles. Keep going!
          </p>
        </section>
      ) : null}

      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-sm border border-edge bg-surface px-4 py-4">
          <p className="font-mono text-[10px] uppercase text-fg-3">Total roles tracked</p>
          <p className="mt-3 text-[28px] font-semibold tabular-nums text-fg">{data.summary.totalRolesTracked}</p>
        </article>
        <article className="rounded-sm border border-edge bg-surface px-4 py-4">
          <p className="font-mono text-[10px] uppercase text-fg-3">Roles scored 70+</p>
          <p className="mt-3 text-[28px] font-semibold tabular-nums text-fg">{data.summary.rolesScored70Plus}</p>
        </article>
        <article className="rounded-sm border border-edge bg-surface px-4 py-4">
          <p className="font-mono text-[10px] uppercase text-fg-3">Applications sent</p>
          <p className="mt-3 text-[28px] font-semibold tabular-nums text-fg">{data.summary.applicationsSent}</p>
        </article>
        <article className="rounded-sm border border-edge bg-surface px-4 py-4">
          <p className="font-mono text-[10px] uppercase text-fg-3">Response rate</p>
          <p className="mt-3 text-[28px] font-semibold tabular-nums text-fg">{formatPercent(data.summary.responseRate)}</p>
          <p className="mt-1 text-[12px] text-fg-3">
            {data.summary.responsesReceived} responses from {data.summary.applicationsSent} applications
          </p>
        </article>
        <article className="rounded-sm border border-edge bg-surface px-4 py-4">
          <p className="font-mono text-[10px] uppercase text-fg-3">Average days to response</p>
          <p className="mt-3 text-[28px] font-semibold tabular-nums text-fg">{formatDays(data.summary.averageDaysToResponse)}</p>
        </article>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="rounded-sm border border-edge bg-surface p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase text-fg-3">Score distribution</p>
              <h2 className="mt-1 text-[18px] font-semibold text-fg">All tracked role scores</h2>
            </div>
            <p className="text-[12px] text-fg-3">10-point buckets</p>
          </div>

          <div className="mt-6 flex h-56 items-end gap-2">
            {data.scoreDistribution.map((bucket) => {
              const height = bucket.count === 0 ? 8 : Math.max(14, (bucket.count / histogramMax) * 100);
              return (
                <div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="font-mono text-[10px] tabular-nums text-fg-3">{bucket.count}</span>
                  <div className="flex h-40 w-full items-end rounded-sm border border-edge bg-void/60 p-1">
                    <div
                      className={`w-full rounded-[2px] border ${histogramBarClass(bucket)}`}
                      style={{ height: `${height}%` }}
                      aria-label={`${bucket.label} score bucket with ${bucket.count} roles`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-fg-3">{bucket.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-sm border border-edge bg-surface p-5">
          <p className="font-mono text-[10px] uppercase text-fg-3">Funnel</p>
          <h2 className="mt-1 text-[18px] font-semibold text-fg">How roles move forward</h2>

          <div className="mt-5 space-y-3">
            {data.funnel.map((stage) => {
              const width = stage.count === 0 ? 10 : Math.max(18, (stage.count / funnelMax) * 100);
              return (
                <div key={stage.key}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium text-fg">{stage.label}</p>
                    <div className="text-right">
                      <p className="font-mono text-[12px] tabular-nums text-fg">{stage.count}</p>
                      <p className="text-[11px] text-fg-3">
                        {stage.conversionFromPrevious == null ? "Start of funnel" : `${formatPercent(stage.conversionFromPrevious)} from previous`}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-sm border border-edge bg-void/60 p-1">
                    <div
                      className="flex h-11 items-center justify-between rounded-[2px] border border-blue/30 bg-blue/10 px-3"
                      style={{ width: `${width}%` }}
                    >
                      <span className="font-mono text-[11px] uppercase tracking-wide text-blue">{stage.label}</span>
                      <span className="font-mono text-[12px] tabular-nums text-fg">{stage.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-sm border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-4">
          <p className="font-mono text-[10px] uppercase text-fg-3">Source breakdown</p>
          <h2 className="mt-1 text-[18px] font-semibold text-fg">Where roles and applications come from</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-edge text-left font-mono text-[10px] uppercase text-fg-3">
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Roles</th>
                <th className="px-5 py-3">Avg score</th>
                <th className="px-5 py-3">Roles 60+</th>
                <th className="px-5 py-3">Applied from source</th>
              </tr>
            </thead>
            <tbody>
              {data.sourceBreakdown.map((row) => (
                <tr key={row.source} className="border-b border-edge last:border-b-0">
                  <td className="px-5 py-3 text-[13px] text-fg">{row.label}</td>
                  <td className="px-5 py-3 font-mono text-[12px] tabular-nums text-fg-2">{row.roles}</td>
                  <td className="px-5 py-3 font-mono text-[12px] tabular-nums text-fg-2">{row.averageScore.toFixed(1)}</td>
                  <td className="px-5 py-3 font-mono text-[12px] tabular-nums text-fg-2">{row.roles60Plus}</td>
                  <td className="px-5 py-3 font-mono text-[12px] tabular-nums text-fg-2">{row.appliedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-sm border border-edge bg-surface p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase text-fg-3">Timeline</p>
            <h2 className="mt-1 text-[18px] font-semibold text-fg">Roles discovered over the last 30 days</h2>
          </div>
          <p className="text-[12px] text-fg-3">Daily count</p>
        </div>

        <div className="mt-6 flex h-36 items-end gap-1">
          {data.timeline.map((point, index) => {
            const height = point.count === 0 ? 6 : Math.max(10, (point.count / timelineMax) * 100);
            return (
              <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-24 w-full items-end rounded-sm bg-void/50 p-px">
                  <div
                    className="w-full rounded-[2px] bg-blue/55"
                    style={{ height: `${height}%` }}
                    aria-label={`${point.date} discovered ${point.count} roles`}
                  />
                </div>
                <span className="h-3 text-center font-mono text-[9px] text-fg-3">
                  {index % 5 === 0 || index === data.timeline.length - 1
                    ? new Date(`${point.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : ""}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
