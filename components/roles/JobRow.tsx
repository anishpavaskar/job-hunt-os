"use client";

import type { Job } from "@/lib/web/types";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { StatusPill } from "@/components/ui/StatusPill";
import { SourceBadge } from "@/components/ui/SourceBadge";
import type { JobStatus } from "@/components/ui/StatusPill";
import type { JobSource } from "@/components/ui/SourceBadge";

// ─── Shared column template (must match header) ───────────────────────────────
export const COL_TEMPLATE = "56px 176px 1fr 140px 64px 88px 100px";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatRelDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return "today";
  if (d < 2)  return "1d ago";
  if (d < 7)  return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5)  return `${w}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

const VALID_STATUSES = new Set<string>([
  "new", "reviewed", "saved", "shortlisted", "drafted", "applied", "followup_due", "replied", "interview", "rejected", "archived",
]);
const VALID_SOURCES = new Set<string>([
  "yc", "greenhouse", "lever", "careers", "linkedin", "indeed",
]);

// ─── Props ───────────────────────────────────────────────────────────────────

interface JobRowProps {
  job: Job;
  isFocused: boolean;
  statusOverride?: string;
  onOpen: () => void;
  onFocus: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function JobRow({
  job,
  isFocused,
  statusOverride,
  onOpen,
  onFocus,
}: JobRowProps) {
  const effectiveStatus = statusOverride ?? job.status;
  const validStatus = VALID_STATUSES.has(effectiveStatus)
    ? (effectiveStatus as JobStatus)
    : "new";
  const validSource = VALID_SOURCES.has(job.source)
    ? (job.source as JobSource)
    : "careers";

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => { onFocus(); onOpen(); }}
      onMouseEnter={onFocus}
      className={[
        "grid w-full border-b border-edge text-left transition-colors duration-75",
        isFocused ? "bg-surface-2 ring-inset ring-1 ring-blue/15" : "hover:bg-surface-2/50",
      ].join(" ")}
      style={{ gridTemplateColumns: COL_TEMPLATE }}
    >
      <div className="flex h-10 shrink-0 items-center justify-center px-2">
        <ScoreBadge score={job.score} size="sm" />
      </div>

      <div className="flex h-10 min-w-0 items-center px-3">
        <span className="truncate text-[13px] font-medium text-fg">{job.company}</span>
      </div>

      <div className="flex h-10 min-w-0 items-center px-3">
        <span className="truncate text-[13px] text-fg-2">{job.title}</span>
      </div>

      <div className="flex h-10 min-w-0 items-center px-3">
        <span className="truncate font-mono text-[11px] text-fg-3">{job.location}</span>
      </div>

      <div className="flex h-10 items-center px-3">
        <SourceBadge source={validSource} />
      </div>

      <div className="flex h-10 items-center px-3">
        <span className="font-mono text-[11px] text-fg-3 tabular-nums">
          {formatRelDate(job.postedAt)}
        </span>
      </div>

      <div className="flex h-10 items-center px-3">
        <StatusPill status={validStatus} />
      </div>
    </button>
  );
}
