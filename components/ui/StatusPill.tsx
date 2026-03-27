export type JobStatus =
  | "new"
  | "reviewed"
  | "saved"
  | "shortlisted"
  | "drafted"
  | "applied"
  | "followup_due"
  | "replied"
  | "interview"
  | "rejected"
  | "archived";

interface StatusConfig {
  label: string;
  className: string;
}

const STATUS_CONFIG: Record<JobStatus, StatusConfig> = {
  new:         { label: "New",          className: "text-fg-2 border-edge bg-surface-2" },
  reviewed:    { label: "Reviewed",     className: "text-fg-2 border-edge bg-surface-2" },
  saved:       { label: "Saved",        className: "text-blue border-blue/25 bg-blue/8" },
  shortlisted: { label: "Shortlisted",  className: "text-blue border-blue/25 bg-blue/8" },
  drafted:     { label: "Drafted",      className: "text-orange border-orange/25 bg-orange/8" },
  applied:     { label: "Applied",      className: "text-amber border-amber/25 bg-amber/8" },
  followup_due:{ label: "Follow-up",    className: "text-amber border-amber/25 bg-amber/8" },
  replied:     { label: "Replied",      className: "text-green border-green/25 bg-green/8" },
  interview:   { label: "Interview",    className: "text-green border-green/25 bg-green/8" },
  rejected:    { label: "Rejected",     className: "text-red border-red/25 bg-red/8" },
  archived:    { label: "Archived",     className: "text-fg-3 border-edge/50 bg-surface" },
};

interface StatusPillProps {
  status: JobStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={[
        "inline-flex items-center font-mono text-[10px] font-medium",
        "px-1.5 py-px border rounded-sm uppercase tracking-wide leading-none",
        config.className,
      ].join(" ")}
    >
      {config.label}
    </span>
  );
}
