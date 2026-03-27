interface SkillTagProps {
  skill: string;
  /** tier 1 = strong match with user profile */
  tier?: 1 | 2 | 3;
}

export function SkillTag({ skill, tier = 3 }: SkillTagProps) {
  const matched = tier === 1;

  return (
    <span
      className={[
        "inline-flex items-center font-mono text-[10px] px-1.5 py-px border rounded-sm leading-none",
        matched
          ? "text-blue border-blue/30 bg-blue/6"
          : "text-fg-3 border-edge bg-surface-2",
      ].join(" ")}
    >
      {skill}
    </span>
  );
}
