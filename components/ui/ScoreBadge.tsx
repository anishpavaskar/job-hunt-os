interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const color =
    score >= 80
      ? "text-blue border-blue/25 bg-blue/8"
      : score >= 60
        ? "text-amber border-amber/25 bg-amber/8"
        : "text-fg-3 border-edge bg-surface-2";

  const sizeClass =
    size === "sm"
      ? "text-[10px] px-1 py-px min-w-[26px]"
      : size === "lg"
        ? "text-[14px] px-2.5 py-1 min-w-[42px]"
        : "text-[11px] px-1.5 py-px min-w-[34px]";

  return (
    <span
      className={[
        "inline-flex items-center justify-center font-mono font-semibold",
        "border rounded-sm tabular-nums leading-none",
        color,
        sizeClass,
      ].join(" ")}
    >
      {score}
    </span>
  );
}
