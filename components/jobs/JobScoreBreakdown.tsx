"use client";

import type { ScoreBreakdown } from "@/lib/web/types";
import { cn } from "@/lib/utils";

const DIMS: Array<{ key: keyof ScoreBreakdown; label: string; max: number }> = [
  { key: "roleFit", label: "Role", max: 25 },
  { key: "stackFit", label: "Stack", max: 30 },
  { key: "seniorityFit", label: "Level", max: 15 },
  { key: "freshness", label: "Fresh", max: 10 },
  { key: "companySignal", label: "Signal", max: 20 },
];

function getScoreTone(ratio: number) {
  if (ratio >= 0.8) return { bar: "bg-green", text: "text-green" };
  if (ratio >= 0.55) return { bar: "bg-amber", text: "text-amber" };
  if (ratio >= 0.3) return { bar: "bg-orange", text: "text-orange" };
  return { bar: "bg-red", text: "text-red" };
}

function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const ratio = Math.max(0, Math.min(value / max, 1));
  const tone = getScoreTone(ratio);

  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-11 shrink-0 font-mono text-[10px]", tone.text)}>{label}</span>
      <div className="relative h-px flex-1 bg-edge-2">
        <div
          className={cn("absolute inset-y-0 left-0 opacity-80", tone.bar)}
          style={{ width: `${ratio * 100}%`, height: "3px", top: "-1px" }}
        />
      </div>
      <span className={cn("w-6 shrink-0 text-right font-mono text-[10px] tabular-nums", tone.text)}>{value}</span>
    </div>
  );
}

export function JobScoreBreakdown({
  breakdown,
  fallbackScore,
  isProspect,
}: {
  breakdown?: ScoreBreakdown;
  fallbackScore?: number;
  isProspect?: boolean;
}) {
  return (
    <div>
      <p className="mb-2.5 font-mono text-[10px] text-fg-3 uppercase">Score breakdown</p>
      <div className="flex flex-col gap-2">
        {(breakdown ? DIMS.map((dimension) => (
          <ScoreBar
            key={dimension.key}
            label={dimension.label}
            value={breakdown[dimension.key]}
            max={dimension.max}
          />
        )) : DIMS.map((dimension) => (
          <ScoreBar key={dimension.key} label={dimension.label} value={fallbackScore ?? 0} />
        )))}
      </div>

      {isProspect ? (
        <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-sm border border-orange/25 bg-orange/8 px-2 py-1 font-mono text-[10px] text-orange">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden>
            <circle cx="4" cy="4" r="3" />
          </svg>
          Prospect listed
        </span>
      ) : null}
    </div>
  );
}
