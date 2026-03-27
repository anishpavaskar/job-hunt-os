"use client";

import { useState, useEffect, useRef } from "react";

// ─── Option definitions ──────────────────────────────────────────────────────

const SCORE_OPTS = [
  { value: "all", label: "All" },
  { value: "80",  label: "80+" },
  { value: "60",  label: "60+" },
  { value: "40",  label: "40+" },
];

const SOURCE_OPTS = [
  { value: "all",        label: "All"     },
  { value: "yc",         label: "YC"      },
  { value: "greenhouse", label: "GH"      },
  { value: "lever",      label: "LVR"     },
  { value: "careers",    label: "Careers" },
];

const STATUS_OPTS = [
  { value: "all",         label: "All"   },
  { value: "new",         label: "New"   },
  { value: "shortlisted", label: "SL"    },
  { value: "applied",     label: "Applied"},
];

const SORT_OPTS = [
  { value: "score",  label: "Score"  },
  { value: "newest", label: "Newest" },
  { value: "date",   label: "Posted" },
];

// ─── Segmented button group ───────────────────────────────────────────────────

function SegGroup({
  opts,
  value,
  onChange,
}: {
  opts: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex border border-edge rounded-sm overflow-hidden shrink-0">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={[
            "h-7 px-2.5 font-mono text-[11px] transition-colors border-r border-edge last:border-r-0",
            value === o.value
              ? "bg-blue/10 text-blue"
              : "text-fg-3 hover:text-fg hover:bg-surface-2",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FilterBarProps {
  q: string;
  score: string;
  source: string;
  status: string;
  remote: boolean;
  sort: string;
  activeFilterCount: number;
  onQ: (v: string) => void;
  onScore: (v: string) => void;
  onSource: (v: string) => void;
  onStatus: (v: string) => void;
  onRemote: () => void;
  onSort: (v: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FilterBar({
  q, score, source, status, remote, sort,
  activeFilterCount,
  onQ, onScore, onSource, onStatus, onRemote, onSort,
}: FilterBarProps) {
  const [localQ, setLocalQ] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external → local when URL changes (e.g. page load)
  useEffect(() => { setLocalQ(q); }, [q]);

  function handleQChange(val: string) {
    setLocalQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onQ(val), 300);
  }

  return (
    <div className="shrink-0 bg-surface border-b border-edge px-4 py-2 flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex items-center">
        <svg
          className="absolute left-2.5 text-fg-3 pointer-events-none"
          width="12" height="12" viewBox="0 0 12 12" fill="none"
        >
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8.5 8.5L10.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <input
          value={localQ}
          onChange={(e) => handleQChange(e.target.value)}
          placeholder="Search roles…"
          className="h-7 w-52 bg-surface-2 border border-edge rounded-sm pl-7 pr-3 font-mono text-[12px] text-fg placeholder:text-fg-3 focus:border-blue/40 focus:outline-none transition-colors"
        />
        {localQ && (
          <button
            onClick={() => { setLocalQ(""); onQ(""); }}
            className="absolute right-2 text-fg-3 hover:text-fg transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="h-4 w-px bg-edge shrink-0" />

      {/* Score */}
      <SegGroup opts={SCORE_OPTS} value={score} onChange={onScore} />

      {/* Source */}
      <SegGroup opts={SOURCE_OPTS} value={source} onChange={onSource} />

      {/* Status */}
      <SegGroup opts={STATUS_OPTS} value={status} onChange={onStatus} />

      {/* Remote toggle */}
      <button
        onClick={onRemote}
        className={[
          "h-7 px-3 font-mono text-[11px] border rounded-sm transition-colors shrink-0",
          remote
            ? "bg-green/10 text-green border-green/30"
            : "text-fg-3 border-edge hover:text-fg hover:bg-surface-2",
        ].join(" ")}
      >
        Remote
      </button>

      {/* Sort — pushed to right */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {activeFilterCount > 0 && (
          <span className="font-mono text-[10px] text-blue bg-blue/8 border border-blue/20 rounded-sm px-1.5 py-px leading-none">
            {activeFilterCount} active
          </span>
        )}
        <div className="h-4 w-px bg-edge" />
        <span className="font-mono text-[10px] text-fg-3 uppercase tracking-wider">Sort</span>
        <SegGroup opts={SORT_OPTS} value={sort} onChange={onSort} />
      </div>
    </div>
  );
}
