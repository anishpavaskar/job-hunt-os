import type { ShellSummary } from "@/lib/web/types";

interface TopBarProps {
  summary: ShellSummary;
  statusLabel: string;
}

export function TopBar({ summary, statusLabel }: TopBarProps) {
  return (
    <header className="h-11 shrink-0 bg-surface border-b border-edge flex items-stretch z-50">
      {/* Wordmark — aligned with sidebar width */}
      <div className="w-60 shrink-0 flex items-center px-5 border-r border-edge">
        <span className="font-mono text-[13px] font-semibold tracking-tight text-fg leading-none">
          job-hunt
          <span className="text-blue">-os</span>
        </span>
      </div>

      {/* Status strip */}
      <div className="flex items-center px-5 gap-5 flex-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-1.5 rounded-full bg-green" />
          <span className="font-mono text-[10px] text-fg-3 uppercase tracking-widest">
            Synced {statusLabel}
          </span>
        </div>

        <div className="h-3 w-px bg-edge" />

        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-fg-3 uppercase tracking-widest">
            Tracked
          </span>
          <span className="font-mono text-[13px] font-semibold text-fg tabular-nums">
            {summary.trackedRoles.toLocaleString()}
          </span>
          <span className="font-mono text-[10px] text-fg-3">roles</span>
        </div>

        <div className="h-3 w-px bg-edge" />

        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-fg-3 uppercase tracking-widest">
            Sources
          </span>
          <span className="font-mono text-[13px] font-semibold text-fg tabular-nums">
            {summary.sourcesScanned}
          </span>
        </div>

        <div className="h-3 w-px bg-edge" />

        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-fg-3 uppercase tracking-widest">
            Followups
          </span>
          <span className="font-mono text-[13px] font-semibold text-fg tabular-nums">
            {summary.followupsDue}
          </span>
        </div>
      </div>

      {/* Avatar */}
      <div className="flex items-center px-4">
        <div className="h-6 w-6 rounded bg-surface-2 border border-edge-2 flex items-center justify-center">
          <span className="font-mono text-[9px] font-semibold text-fg-2 leading-none">
            AP
          </span>
        </div>
      </div>
    </header>
  );
}
