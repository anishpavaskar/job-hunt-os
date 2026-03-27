export type JobSource =
  | "yc"
  | "greenhouse"
  | "lever"
  | "careers"
  | "linkedin"
  | "indeed";

interface SourceConfig {
  label: string;
  className: string;
}

const SOURCE_CONFIG: Record<JobSource, SourceConfig> = {
  yc:         { label: "YC",      className: "text-orange border-orange/25 bg-orange/8" },
  greenhouse: { label: "GH",      className: "text-green border-green/25 bg-green/8" },
  lever:      { label: "LVR",     className: "text-blue border-blue/25 bg-blue/8" },
  careers:    { label: "Careers", className: "text-fg-2 border-edge bg-surface-2" },
  linkedin:   { label: "LI",      className: "text-blue border-blue/25 bg-blue/8" },
  indeed:     { label: "Indeed",  className: "text-amber border-amber/25 bg-amber/8" },
};

interface SourceBadgeProps {
  source: JobSource;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const config = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.careers;

  return (
    <span
      className={[
        "inline-flex items-center font-mono text-[10px] font-semibold",
        "px-1.5 py-px border rounded-sm uppercase tracking-wider leading-none",
        config.className,
      ].join(" ")}
    >
      {config.label}
    </span>
  );
}
