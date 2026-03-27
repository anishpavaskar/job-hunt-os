"use client";

import { JobScoreBreakdown } from "@/components/jobs/JobScoreBreakdown";
import { RiskLine } from "@/components/ui/RiskLine";
import { SkillTag } from "@/components/ui/SkillTag";
import type { Job } from "@/lib/web/types";
import { cn } from "@/lib/utils";

export interface JobDetailsAction {
  key: string;
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}

function ActionBtn({
  label,
  onClick,
  variant = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "h-7 rounded-sm border px-3 font-mono text-[11px] transition-colors disabled:opacity-50",
        variant === "primary"
          ? "border-blue/30 bg-blue/6 text-blue hover:bg-blue/10"
          : variant === "danger"
            ? "border-amber/30 bg-amber/6 text-amber hover:bg-amber/10"
            : "border-edge bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}

interface JobDetailsPanelProps {
  job: Job;
  actions: JobDetailsAction[];
  actionError?: string | null;
}

export function JobDetailsPanel({ job, actions, actionError }: JobDetailsPanelProps) {
  const breakdown = job.scoreBreakdown;

  return (
    <div className="row-expand border-b border-edge bg-surface-2">
      <div className="flex min-h-0">
        <div className="flex flex-col gap-3 border-r border-edge px-5 py-4" style={{ flex: "0 0 60%" }}>
          <div>
            <p className="mb-2 font-mono text-[10px] text-fg-3 uppercase">Summary</p>
            <div className="overflow-y-auto text-[12px] leading-relaxed text-fg-2" style={{ maxHeight: 180 }}>
              {job.description ?? (
                <span className="italic text-fg-4">
                  No summary available. Open the job URL to read the full description.
                </span>
              )}
            </div>
          </div>

          {job.skills.length > 0 ? (
            <div>
              <p className="mb-2 font-mono text-[10px] text-fg-3 uppercase">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((skill, index) => (
                  <SkillTag key={skill} skill={skill} tier={index < 3 ? 1 : 3} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 px-5 py-4" style={{ flex: "0 0 40%" }}>
          <JobScoreBreakdown breakdown={breakdown} fallbackScore={job.score} isProspect={job.isProspect} />

          {job.explanation && job.explanation.length > 0 ? (
            <div>
              <p className="mb-1.5 font-mono text-[10px] text-fg-3 uppercase">Why this role</p>
              <ul className="flex flex-col gap-1">
                {job.explanation.map((item, index) => (
                  <li key={`${job.id}:explanation:${index}`} className="flex items-start gap-1.5 text-[11px] text-green">
                    <span className="mt-px shrink-0 opacity-70">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {job.risks.length > 0 ? (
            <div>
              <p className="mb-1.5 font-mono text-[10px] text-fg-3 uppercase">Risks</p>
              <div className="flex flex-col gap-1">
                {job.risks.map((risk, index) => (
                  <RiskLine key={`${job.id}:risk:${index}`} risk={risk} level="mid" />
                ))}
              </div>
            </div>
          ) : null}

        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-edge px-5 py-3">
        {actions.map((action) => (
          <ActionBtn
            key={action.key}
            label={action.label}
            onClick={action.onClick}
            variant={action.variant}
            disabled={action.disabled}
          />
        ))}
        {job.url ? (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="ml-auto flex h-7 items-center gap-1.5 rounded-sm border border-edge bg-surface px-3 font-mono text-[11px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Open job URL
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M4 2H2a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              <path d="M6 1h3m0 0v3m0-3L5 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : null}
      </div>
      {actionError ? <p className="border-t border-edge px-5 py-3 text-[12px] text-red">{actionError}</p> : null}
    </div>
  );
}
