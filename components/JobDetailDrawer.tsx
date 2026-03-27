"use client";

import { useEffect, useId, useRef, useState } from "react";
import { JobScoreBreakdown } from "@/components/jobs/JobScoreBreakdown";
import { RiskLine } from "@/components/ui/RiskLine";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { SkillTag } from "@/components/ui/SkillTag";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { StatusPill } from "@/components/ui/StatusPill";
import type { JobApplicationDetail, JobDetailData, WebJobStatus } from "@/lib/web/types";
import { cn } from "@/lib/utils";

interface JobMutationPayload {
  status: WebJobStatus;
  interviewStage?: string | null;
}

interface JobMutationResponse {
  ok: boolean;
  status: WebJobStatus;
  application: JobApplicationDetail | null;
  followup: JobDetailData["followup"];
}

interface JobDraftResponse {
  ok: boolean;
  status?: WebJobStatus;
  application?: JobApplicationDetail | null;
  draft: JobDetailData["draft"];
}

interface JobDetailDrawerProps {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
  onOptimisticStatusChange?: (jobId: string, payload: JobMutationPayload) => void | (() => void);
}

function readErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string") return error;
  }
  return "Request failed.";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isAppliedStage(status: WebJobStatus | null | undefined): boolean {
  return status === "applied"
    || status === "followup_due"
    || status === "replied"
    || status === "interview"
    || status === "rejected"
    || status === "archived";
}

function resolveSkipStatus(detail: JobDetailData): WebJobStatus {
  return detail.application ? "rejected" : "reviewed";
}

function DrawerSkeleton() {
  return (
    <div className="flex h-dvh w-full max-w-[480px] flex-col border-l border-edge bg-surface shadow-lg">
      <div className="border-b border-edge px-5 py-5">
        <div className="h-7 w-40 animate-pulse rounded-sm bg-surface-2" />
        <div className="mt-3 h-4 w-56 animate-pulse rounded-sm bg-surface-2" />
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="h-10 w-14 animate-pulse rounded-sm bg-surface-2" />
          <div className="h-9 w-36 animate-pulse rounded-sm bg-surface-2" />
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <section key={index} className="rounded-sm border border-edge bg-void/40 p-4">
            <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-2" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: index === 0 ? 5 : 3 }).map((__, rowIndex) => (
                <div key={rowIndex} className="h-3 animate-pulse rounded-sm bg-surface-2" />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="border-t border-edge px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-8 w-20 animate-pulse rounded-sm bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function JobDetailDrawer({
  jobId,
  open,
  onClose,
  onOptimisticStatusChange,
}: JobDetailDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const [data, setData] = useState<JobDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesMessage, setNotesMessage] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) {
        dialog.showModal();
      }
      closeButtonRef.current?.focus();
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
    lastFocusedRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!jobId || jobId === "undefined" || jobId === "null") {
      console.error("[JobDetailDrawer] invalid job id", { open, jobId });
      setPageError("Invalid job id.");
      setData(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setPageError(null);
    setActionError(null);
    setNotesMessage(null);
    setDraftMessage(null);

    const detailUrl = `/api/jobs/${jobId}`;
    console.log("[JobDetailDrawer] fetch_start", { jobId, detailUrl });

    fetch(detailUrl, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(readErrorMessage(payload));
        }
        return payload as JobDetailData;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setNotes(payload.application?.notes ?? "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[JobDetailDrawer] fetch_error", {
          jobId,
          detailUrl,
          error: error instanceof Error ? error.message : String(error),
        });
        setPageError(error instanceof Error ? error.message : "Failed to load job details.");
        setData(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, open]);

  async function runStatusUpdate(payload: JobMutationPayload, actionLabel: string) {
    if (!jobId || !data) return;

    const rollback = onOptimisticStatusChange?.(jobId, payload);
    const previousData = data;
    setPendingAction(actionLabel);
    setActionError(null);
    setNotesMessage(null);
    setDraftMessage(null);
    setData({
      ...data,
      status: payload.status,
      application: data.application
        ? {
            ...data.application,
            status: payload.status,
            notes,
            interviewStage: payload.interviewStage ?? data.application.interviewStage,
          }
        : null,
    });

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: payload.status,
          note: notes,
          interviewStage: payload.interviewStage,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(body));
      }

      const result = body as JobMutationResponse;
      setData((current) => current ? {
        ...current,
        status: result.status,
        application: result.application,
        followup: result.followup,
      } : current);
      setNotes(result.application?.notes ?? notes);
      setNotesMessage("Saved with the status update.");
    } catch (error) {
      rollback?.();
      setData(previousData);
      setActionError(error instanceof Error ? error.message : "Failed to update the job.");
    } finally {
      setPendingAction(null);
    }
  }

  async function saveNotes() {
    if (!jobId || !data?.application) return;
    setPendingAction("notes");
    setActionError(null);
    setNotesMessage(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(body));
      }

      const result = body as JobMutationResponse;
      setData((current) => current ? {
        ...current,
        application: result.application,
        followup: result.followup,
      } : current);
      setNotes(result.application?.notes ?? "");
      setNotesMessage("Notes saved.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to save notes.");
    } finally {
      setPendingAction(null);
    }
  }

  async function createDraft() {
    if (!jobId || !data) return;

    const rollback = onOptimisticStatusChange?.(jobId, { status: "drafted" });
    const previousData = data;
    setPendingAction("draft");
    setActionError(null);
    setDraftMessage(null);
    setNotesMessage(null);
    setData({
      ...data,
      status: "drafted",
      application: data.application
        ? { ...data.application, status: "drafted", notes }
        : data.application,
    });

    try {
      const response = await fetch(`/api/jobs/${jobId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", note: notes }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(body));
      }

      const result = body as JobDraftResponse;
      setData((current) => current ? {
        ...current,
        status: result.status ?? "drafted",
        application: result.application ?? current.application,
        draft: result.draft,
      } : current);
      setNotes(result.application?.notes ?? notes);
      setDraftMessage("Draft saved.");
    } catch (error) {
      rollback?.();
      setData(previousData);
      setActionError(error instanceof Error ? error.message : "Failed to create a draft.");
    } finally {
      setPendingAction(null);
    }
  }

  async function createGmailDraftFromSavedDraft() {
    if (!jobId || !data?.draft) return;
    setPendingAction("gmail");
    setActionError(null);
    setDraftMessage(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gmail" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(body));
      }

      const result = body as JobDraftResponse;
      setData((current) => current ? {
        ...current,
        draft: result.draft ?? current.draft,
      } : current);
      setDraftMessage(result.draft?.gmailDraftId ? "Gmail draft created." : "Draft synced.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to create a Gmail draft.");
    } finally {
      setPendingAction(null);
    }
  }

  async function copyDraft() {
    if (!data?.draft?.content) return;

    try {
      await navigator.clipboard.writeText(data.draft.content);
      setDraftMessage("Draft copied.");
    } catch {
      setDraftMessage("Clipboard copy failed.");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="job-detail-drawer fixed inset-0 z-40 m-0 flex size-full max-h-none max-w-none items-stretch justify-end overflow-hidden bg-transparent p-0"
    >
      {isLoading && !data ? (
        <DrawerSkeleton />
      ) : (
        <aside
          aria-busy={isLoading}
          className="drawer-enter flex h-dvh w-full max-w-[480px] flex-col border-l border-edge bg-surface shadow-lg"
        >
          <header className="border-b border-edge px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p id={titleId} className="text-balance text-[26px] font-semibold text-fg">
                  {data?.company ?? "Role details"}
                </p>
                <p className="mt-2 text-pretty text-[14px] text-fg-2">
                  {data?.title ?? "Loading role"}
                </p>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close job details"
                onClick={onClose}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-edge bg-surface-2 text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              {data ? <ScoreBadge score={data.score} size="lg" /> : <div />}
              {data?.url ? (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-blue/30 bg-blue/10 px-3 font-mono text-[11px] text-blue transition-colors hover:bg-blue/15"
                >
                  Open job URL
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M4 2H2a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    <path d="M6 1h3m0 0v3m0-3L5 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ) : null}
            </div>
          </header>

          {pageError ? (
            <div className="border-b border-edge px-5 py-4 text-[13px] text-red">{pageError}</div>
          ) : null}

          {data ? (
            <>
              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                <section className="rounded-sm border border-edge bg-void/40 p-4">
                  <JobScoreBreakdown
                    breakdown={data.scoreBreakdown}
                    fallbackScore={data.score}
                    isProspect={data.isProspect}
                  />
                </section>

                <section className="rounded-sm border border-edge bg-void/40 p-4">
                  <p className="font-mono text-[10px] uppercase text-fg-3">Details</p>
                  <div className="mt-4 grid gap-3 text-[12px] text-fg-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase text-fg-3">Location</span>
                      <span>{data.location}</span>
                      {data.remote ? (
                        <span className="inline-flex items-center rounded-sm border border-green/25 bg-green/8 px-1.5 py-px font-mono text-[10px] text-green">
                          Remote
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase text-fg-3">Source</span>
                      <SourceBadge source={data.source} />
                      <span className="font-mono text-[11px] text-fg-3">Posted {formatDate(data.postedAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase text-fg-3">Level</span>
                      <span>{data.seniorityHint ?? "Not inferred"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase text-fg-3">Comp</span>
                      <span>{data.compensation ?? "Not disclosed"}</span>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase text-fg-3">Skills</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {data.skills.length > 0 ? data.skills.map((skill, index) => (
                          <SkillTag key={skill} skill={skill} tier={index < 3 ? 1 : 3} />
                        )) : <span className="text-[12px] text-fg-3">No extracted skills.</span>}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-sm border border-edge bg-void/40 p-4">
                  <p className="font-mono text-[10px] uppercase text-fg-3">Why it fits / Risks</p>
                  <div className="mt-4 grid gap-5">
                    <div>
                      <p className="mb-2 text-[12px] font-medium text-fg">Why it fits</p>
                      {data.explanation && data.explanation.length > 0 ? (
                        <ul className="flex flex-col gap-1.5">
                          {data.explanation.map((item, index) => (
                            <li key={`${data.id}:why:${index}`} className="flex items-start gap-1.5 text-[12px] text-green">
                              <span className="mt-px shrink-0 opacity-70">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12px] text-fg-3">No explanation bullets available.</p>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-[12px] font-medium text-fg">Risks</p>
                      {data.risks.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {data.risks.map((risk, index) => (
                            <RiskLine key={`${data.id}:risk:${index}`} risk={risk} level="mid" />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-fg-3">No flagged risks.</p>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-sm border border-edge bg-void/40 p-4">
                  <p className="font-mono text-[10px] uppercase text-fg-3">Full description</p>
                  <div className="mt-4 max-h-[260px] overflow-y-auto text-pretty text-[12px] leading-relaxed text-fg-2">
                    {data.description ? data.description : (
                      <span className="italic text-fg-3">
                        No summary available. Open the job URL for the full posting.
                      </span>
                    )}
                  </div>
                </section>

                {data.draft ? (
                  <section className="rounded-sm border border-edge bg-void/40 p-4">
                    <p className="font-mono text-[10px] uppercase text-fg-3">Draft</p>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-fg-3">
                      <span>Variant {data.draft.variant}</span>
                      <span>•</span>
                      <span>Updated {formatDate(data.draft.updatedAt)}</span>
                    </div>
                    <div className="mt-4 max-h-[220px] overflow-y-auto rounded-sm border border-edge bg-surface-2 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-2">
                      {data.draft.content}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void copyDraft();
                        }}
                        className="inline-flex h-8 items-center rounded-sm border border-edge bg-surface px-3 font-mono text-[11px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        Copy to clipboard
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void createGmailDraftFromSavedDraft();
                        }}
                        disabled={pendingAction === "gmail"}
                        className="inline-flex h-8 items-center rounded-sm border border-blue/30 bg-blue/10 px-3 font-mono text-[11px] text-blue transition-colors hover:bg-blue/15 disabled:opacity-50"
                      >
                        Create Gmail draft
                      </button>
                    </div>
                    {draftMessage ? <p className="mt-3 text-[12px] text-green">{draftMessage}</p> : null}
                  </section>
                ) : null}
              </div>

              <section
                className="sticky bottom-0 border-t border-edge bg-surface/98 px-5 py-4"
                style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
              >
                <p className="font-mono text-[10px] uppercase text-fg-3">Actions</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void runStatusUpdate({ status: "shortlisted" }, "shortlist");
                    }}
                    disabled={pendingAction != null || data.status === "shortlisted"}
                    className="inline-flex h-8 items-center rounded-sm border border-blue/30 bg-blue/10 px-3 font-mono text-[11px] text-blue transition-colors hover:bg-blue/15 disabled:opacity-50"
                  >
                    Shortlist
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void createDraft();
                    }}
                    disabled={pendingAction != null}
                    className="inline-flex h-8 items-center rounded-sm border border-orange/30 bg-orange/10 px-3 font-mono text-[11px] text-orange transition-colors hover:bg-orange/15 disabled:opacity-50"
                  >
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void runStatusUpdate({ status: "applied" }, "apply");
                    }}
                    disabled={pendingAction != null || data.status === "applied"}
                    className="inline-flex h-8 items-center rounded-sm border border-green/30 bg-green/10 px-3 font-mono text-[11px] text-green transition-colors hover:bg-green/15 disabled:opacity-50"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void runStatusUpdate({ status: resolveSkipStatus(data) }, "skip");
                    }}
                    disabled={pendingAction != null}
                    className="inline-flex h-8 items-center rounded-sm border border-amber/30 bg-amber/10 px-3 font-mono text-[11px] text-amber transition-colors hover:bg-amber/15 disabled:opacity-50"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void runStatusUpdate({ status: "archived" }, "archive");
                    }}
                    disabled={pendingAction != null || data.status === "archived"}
                    className="inline-flex h-8 items-center rounded-sm border border-edge bg-surface-2 px-3 font-mono text-[11px] text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>

                {data.application ? (
                  <div className="mt-4 rounded-sm border border-edge bg-void/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase text-fg-3">Current</span>
                      <StatusPill status={data.application.status} />
                      {data.followup ? (
                        <span className={cn(
                          "font-mono text-[11px]",
                          data.followup.overdue ? "text-amber" : "text-fg-3",
                        )}>
                          Follow-up {data.followup.overdue ? "overdue" : "due"} {formatDate(data.followup.dueAt)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
                      {isAppliedStage(data.application.status) ? (
                        <span>Applied {formatDate(data.application.appliedAt)}</span>
                      ) : null}
                      {data.application.lastContactedAt ? (
                        <span>Last contact {formatDate(data.application.lastContactedAt)}</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-[12px] text-fg-3">
                    Notes will save with the first status you set.
                  </p>
                )}

                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-[12px] text-fg-3">Edit notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={4}
                    className="min-h-24 resize-y rounded-sm border border-edge bg-surface-2 px-3 py-2 text-[12px] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-blue/40"
                    placeholder="Capture context, outreach details, or follow-up notes."
                  />
                </label>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void saveNotes();
                    }}
                    disabled={!data.application || pendingAction != null}
                    className="inline-flex h-8 items-center rounded-sm border border-edge bg-surface-2 px-3 font-mono text-[11px] text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-50"
                  >
                    Save notes
                  </button>
                  {notesMessage ? <p className="text-[12px] text-green">{notesMessage}</p> : null}
                </div>

                {actionError ? <p className="mt-3 text-[12px] text-red">{actionError}</p> : null}
              </section>
            </>
          ) : null}
        </aside>
      )}
    </dialog>
  );
}
