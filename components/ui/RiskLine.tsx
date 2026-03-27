interface RiskLineProps {
  risk: string;
  level?: "high" | "mid" | "low";
}

export function RiskLine({ risk, level = "mid" }: RiskLineProps) {
  const colorClass =
    level === "high"
      ? "text-red"
      : level === "mid"
        ? "text-amber"
        : "text-fg-3";

  return (
    <p
      className={[
        "flex items-start gap-1 font-mono text-[11px] leading-tight",
        colorClass,
      ].join(" ")}
    >
      <span className="opacity-60 mt-px shrink-0">⚠</span>
      <span>{risk}</span>
    </p>
  );
}
