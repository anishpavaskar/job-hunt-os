# Audit: `job-hunt-os` Working Tree

Scope: current `my-service` working tree after the scan quality / score calibration pass and the in-flight briefing/email changes.

This audit is a review of the code as it exists now, not a summary of the original intent. The scan/scoring work is in solid shape overall. The briefing path is where the current correctness and product-integration risks are concentrated.

## Findings

1. High: `briefing` and `notify` no longer compose.

- [`src/commands/briefing.ts:245`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts#L245) now sends HTML email directly via [`sendBriefingHtmlEmail()` in `src/integrations/gmail.ts:95`](/Users/anishpav/Anish_Personal_projects/my-service/src/integrations/gmail.ts#L95).
- [`src/commands/notify.ts:7`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/notify.ts#L7) still depends on [`getLatestBriefingDoc()` in `src/integrations/google-docs.ts:98`](/Users/anishpav/Anish_Personal_projects/my-service/src/integrations/google-docs.ts#L98), which reads `data/briefing-docs.json`.
- The current `briefing` command no longer writes that tracking file or creates a Google Doc, so `notify` can legitimately report “No previous briefing doc found” even after a successful `briefing` run.
- This is a user-visible workflow regression, not just internal drift.

2. High: the briefing contract is only partially implemented.

- [`assembleBriefingData()` in `src/commands/briefing.ts:190`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts#L190) always returns `applyNow: []` at [`src/commands/briefing.ts:225`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts#L225).
- The shared `BriefingData` type declares a real `applyNow` section in [`src/integrations/google-docs.ts:54`](/Users/anishpav/Anish_Personal_projects/my-service/src/integrations/google-docs.ts#L54).
- The working-tree tests explicitly expect a populated, deduped apply-now section in [`tests/briefing.test.ts:292`](/Users/anishpav/Anish_Personal_projects/my-service/tests/briefing.test.ts#L292).
- This means the top-level data shape advertises a product capability that the assembler does not currently provide.

3. Medium: new-role counts will be wrong once overflow rows are emitted.

- `BriefingNewRole` already supports `kind: "overflow"` in [`src/integrations/google-docs.ts:9`](/Users/anishpav/Anish_Personal_projects/my-service/src/integrations/google-docs.ts#L9).
- The tests expect overflow rows to be excluded from summary counts in [`tests/briefing.test.ts:345`](/Users/anishpav/Anish_Personal_projects/my-service/tests/briefing.test.ts#L345).
- But `getBriefingSmsSummary()` counts `data.newRoles.length` directly at [`src/commands/briefing.ts:236`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts#L236).
- `buildBriefingEmailSubject()` does the same at [`src/integrations/gmail.ts:85`](/Users/anishpav/Anish_Personal_projects/my-service/src/integrations/gmail.ts#L85).
- The email header also prints `newRoles.length` in [`src/templates/briefing-email.ts:222`](/Users/anishpav/Anish_Personal_projects/my-service/src/templates/briefing-email.ts#L222).
- If overflow rows land, user-facing counts and subjects will overstate how many actual roles were found.

4. Medium: the “scanned X sources” metric is mislabeled.

- [`assembleBriefingData()` in `src/commands/briefing.ts:219`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts#L219) derives `sourcesScanned` from `SELECT COUNT(*) FROM job_sources`.
- The footer renders that as “scanned X sources” in [`src/templates/briefing-email.ts:255`](/Users/anishpav/Anish_Personal_projects/my-service/src/templates/briefing-email.ts#L255).
- `job_sources` is cumulative identity data for companies/providers already seen, not the number of sources scanned in the latest run and not even the number of top-level providers.
- The metric will drift upward over time and misrepresent current scan coverage.

5. Low: profile-loading failures are silently swallowed.

- [`assembleBriefingData()` catches all errors from `loadProfile()` at `src/commands/briefing.ts:199`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts#L199).
- That means a malformed `data/profile.json` degrades into `stackMatch = 0` everywhere instead of surfacing a configuration error.
- This is survivable, but it is poor debuggability for a personalization-heavy workflow.

6. Low: docs and command descriptions have drifted from the actual behavior.

- The README still says `briefing` “Generate AI-powered daily briefing” and `notify` “Send SMS notification” in [`README.md:156`](/Users/anishpav/Anish_Personal_projects/my-service/README.md#L156).
- The current code describes `briefing` as an HTML email sender in [`src/commands/briefing.ts:247`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts#L247) and `notify` as a Gmail draft creator for the latest doc in [`src/commands/notify.ts:29`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/notify.ts#L29).
- This is not a runtime bug, but it makes the product surface harder to reason about.

## Top-Down Overview

### 1. Core architecture

The repo is a local-first CLI workflow built around:

- source ingestion
- normalization
- scoring
- SQLite persistence
- daily action selection
- briefing/output integrations

The layering is still good:

- CLI orchestration in [`src/commands`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands)
- persistence in [`src/db`](/Users/anishpav/Anish_Personal_projects/my-service/src/db)
- source adapters in [`src/ingest`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest)
- ranking in [`src/score/scorer.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/score/scorer.ts)
- downstream rendering/integrations in [`src/integrations`](/Users/anishpav/Anish_Personal_projects/my-service/src/integrations) and [`src/templates`](/Users/anishpav/Anish_Personal_projects/my-service/src/templates)

That structure is coherent and still scales for this scope.

### 2. Scan and calibration pass

The recent scan/scoring work is directionally correct and fairly disciplined.

- [`scan` in `src/commands/scan.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/scan.ts) now distinguishes `upserted`, `new`, and `updated` instead of treating everything as one bucket.
- Greenhouse and Lever have explicit slug audit hooks in [`src/ingest/greenhouse.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/greenhouse.ts) and [`src/ingest/lever.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/ingest/lever.ts).
- Scorer debug is centralized through [`getOpportunityScoreDebug()` in `src/score/scorer.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/score/scorer.ts).
- The default “real roles only” behavior is correctly threaded into [`briefing`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts), [`today`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/today.ts), and [`listNextActions()` in `src/db/repositories.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/repositories.ts#L550).

The scan-side changes look focused on correctness and debuggability, which was the right bar for this pass.

### 3. Scoring

The scoring model remains simple and legible.

- role fit
- stack fit
- seniority fit
- freshness
- company signal

The new scorer debug surface is useful because it exposes:

- extracted text
- extracted skills
- matched profile signals
- final score breakdown

That makes calibration work practical without overcomplicating the production path.

The only caution here is that seniority tuning has become more opinionated and still needs explicit regression coverage around staff/principal rejection behavior.

### 4. Daily surfaces

The “today” path is in better shape than the “briefing” path.

- [`today`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/today.ts) now defaults to real roles only and keeps fallback inclusion opt-in.
- [`listNextActions()`](/Users/anishpav/Anish_Personal_projects/my-service/src/db/repositories.ts#L550) applies that filter consistently across follow-ups, drafted applications, and unapplied jobs.

That is a sensible default for a candidate-facing queue.

### 5. Briefing / outbound rendering

This is the least settled subsystem right now.

The codebase simultaneously contains:

- a Google Docs briefing model in [`src/integrations/google-docs.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/integrations/google-docs.ts)
- a new HTML email renderer in [`src/templates/briefing-email.ts`](/Users/anishpav/Anish_Personal_projects/my-service/src/templates/briefing-email.ts)
- a `briefing` command that sends Gmail HTML directly
- a `notify` command that still assumes docs are the source artifact

That split-brain state is the main architectural risk in the working tree.

## Test Posture

Coverage around the scan calibration pass is good:

- threshold behavior
- fallback exclusion
- scan counting semantics
- pipeline-level rescan behavior

The main gap is not the scan path. It is the briefing contract drift:

- the working tree contains expectations for `applyNow` and overflow behavior in [`tests/briefing.test.ts:273`](/Users/anishpav/Anish_Personal_projects/my-service/tests/briefing.test.ts#L273)
- but the production assembler does not yet implement that contract end-to-end

That mismatch is exactly the kind of thing that turns into confusing product behavior later.

## Recommended Next Steps

1. Choose one briefing artifact model and finish it.

- Either keep Google Docs as the canonical artifact and make `briefing` produce docs again.
- Or make email the canonical artifact and delete or repurpose `notify`, `briefing-docs.json`, and the doc-tracking path.

2. Finish or remove the richer briefing contract.

- If `applyNow` and overflow rows are intended to ship, implement them fully in [`assembleBriefingData()`](/Users/anishpav/Anish_Personal_projects/my-service/src/commands/briefing.ts#L190), the email renderer, and the summary helpers.
- If they are not intended to ship yet, remove the half-extended type and test expectations until the feature is ready.

3. Centralize “visible role count” logic.

- Add one helper that counts only real visible roles and reuse it for SMS summaries, email subjects, and any future headers.

4. Compute scan metrics from scans, not cumulative identities.

- `sourcesScanned` should come from the latest scan run or a clear provider count, not `job_sources`.

5. Narrow the profile error handling.

- Swallow `ENOENT` if the profile is optional.
- Surface malformed JSON and schema failures so personalization bugs are obvious.

## Bottom Line

The scan quality and score calibration work is good. It is compact, test-backed, and improves operability.

The repo’s current risk is not scan correctness. It is briefing product drift. Right now the codebase has partially overlapping Google Docs, Gmail email, and notification flows, and the shared briefing data contract is ahead of what the assembler actually produces.

If the briefing path is normalized behind one clear artifact model, the rest of the system remains in strong shape for a local-first job-search OS.
