import Database from "better-sqlite3";
import { TODAY_RANKING } from "../../config/scoring";
import {
  ApplicationEventRecord,
  ApplicationRecord,
  ApplicationUpdateInput,
  ApplicationStatus,
  DraftRecord,
  DraftUpsertInput,
  FollowupRecord,
  FollowupStatus,
  FollowupUpdateInput,
  JobRecord,
  JobSourceInput,
  JobStatus,
  JobUpsertInput,
  NextActionRecord,
  ScoreRangeStats,
  SourceStats,
  ConversionStats,
  ReviewFilters,
} from "./types";

function json(value: string[]): string {
  return JSON.stringify(value);
}

function jsonObject(value?: unknown): string {
  return JSON.stringify(value ?? {});
}

function maybeJobStatus(status: ApplicationStatus): JobStatus {
  switch (status) {
    case "saved":
    case "shortlisted":
    case "drafted":
    case "applied":
    case "followup_due":
    case "replied":
    case "interview":
    case "rejected":
    case "archived":
      return status;
    default:
      return "reviewed";
  }
}

export function createScan(
  db: Database.Database,
  provider: string,
  startedAt: string,
  sourceCounts?: unknown,
): number {
  const result = db
    .prepare(
      `INSERT INTO scans (provider, started_at, raw_count, valid_count, source_counts_json)
       VALUES (?, ?, 0, 0, ?)`,
    )
    .run(provider, startedAt, jsonObject(sourceCounts));
  return Number(result.lastInsertRowid);
}

export function completeScan(
  db: Database.Database,
  scanId: number,
  rawCount: number,
  validCount: number,
  completedAt: string,
  sourceCounts?: unknown,
): void {
  db.prepare(
    `UPDATE scans
     SET raw_count = ?, valid_count = ?, completed_at = ?, source_counts_json = ?
     WHERE id = ?`,
  ).run(rawCount, validCount, completedAt, jsonObject(sourceCounts), scanId);
}

export function getExistingJobExternalKeys(
  db: Database.Database,
  externalKeys: string[],
): Set<string> {
  const matches = new Set<string>();
  const uniqueKeys = [...new Set(externalKeys)];
  const chunkSize = 400;

  for (let index = 0; index < uniqueKeys.length; index += chunkSize) {
    const chunk = uniqueKeys.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = db
      .prepare(`SELECT external_key FROM jobs WHERE external_key IN (${placeholders})`)
      .all(...chunk) as Array<{ external_key: string }>;
    rows.forEach((row) => matches.add(row.external_key));
  }

  return matches;
}

export function upsertJobSource(
  db: Database.Database,
  input: JobSourceInput,
): number {
  db.prepare(
    `INSERT INTO job_sources (provider, external_id, url, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(provider, external_id)
     DO UPDATE SET url = excluded.url, updated_at = datetime('now')`,
  ).run(input.provider, input.externalId, input.url);

  const row = db
    .prepare(
      `SELECT id FROM job_sources
       WHERE provider = ? AND external_id = ?`,
    )
    .get(input.provider, input.externalId) as { id: number };
  return row.id;
}

export function upsertJob(
  db: Database.Database,
  input: JobUpsertInput,
): number {
  db.prepare(
     `INSERT INTO jobs (
       source_id, scan_id, external_key, role_external_id, role_source, company_name, title, summary, website, locations,
       remote_flag, job_url, regions_json, tags_json, industries_json, stage, batch, team_size,
       seniority_hint, compensation_min, compensation_max, compensation_currency, compensation_period, extracted_skills_json,
       top_company, is_hiring, score, score_reasons_json, score_breakdown_json, explanation_bullets_json, risk_bullets_json, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(external_key) DO UPDATE SET
       scan_id = excluded.scan_id,
       role_external_id = excluded.role_external_id,
       role_source = excluded.role_source,
       company_name = excluded.company_name,
       title = excluded.title,
       summary = excluded.summary,
       website = excluded.website,
       locations = excluded.locations,
       remote_flag = excluded.remote_flag,
       job_url = excluded.job_url,
       regions_json = excluded.regions_json,
       tags_json = excluded.tags_json,
       industries_json = excluded.industries_json,
       stage = excluded.stage,
       batch = excluded.batch,
       team_size = excluded.team_size,
       seniority_hint = excluded.seniority_hint,
       compensation_min = excluded.compensation_min,
       compensation_max = excluded.compensation_max,
       compensation_currency = excluded.compensation_currency,
       compensation_period = excluded.compensation_period,
       extracted_skills_json = excluded.extracted_skills_json,
       top_company = excluded.top_company,
       is_hiring = excluded.is_hiring,
       score = excluded.score,
       score_reasons_json = excluded.score_reasons_json,
       score_breakdown_json = excluded.score_breakdown_json,
       explanation_bullets_json = excluded.explanation_bullets_json,
       risk_bullets_json = excluded.risk_bullets_json,
       updated_at = datetime('now')`,
  ).run(
    input.sourceId,
    input.scanId,
    input.externalKey,
    input.roleExternalId ?? null,
    input.roleSource,
    input.companyName,
    input.title ?? null,
    input.summary,
    input.website,
    input.locations,
    input.remoteFlag ? 1 : 0,
    input.jobUrl,
    json(input.regions),
    json(input.tags),
    json(input.industries),
    input.stage,
    input.batch,
    input.teamSize ?? null,
    input.seniorityHint ?? null,
    input.compensationMin ?? null,
    input.compensationMax ?? null,
    input.compensationCurrency ?? null,
    input.compensationPeriod ?? null,
    json(input.extractedSkills ?? []),
    input.topCompany ? 1 : 0,
    input.isHiring ? 1 : 0,
    input.score,
    json(input.scoreReasons),
    JSON.stringify(input.scoreBreakdown),
    json(input.explanationBullets),
    json(input.riskBullets),
    input.status ?? "new",
  );

  const row = db
    .prepare(`SELECT id FROM jobs WHERE external_key = ?`)
    .get(input.externalKey) as { id: number };
  return row.id;
}

export function listJobs(
  db: Database.Database,
  filters: ReviewFilters,
): JobRecord[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.query) {
    clauses.push(
      `(company_name LIKE ? OR COALESCE(title, '') LIKE ? OR summary LIKE ? OR tags_json LIKE ? OR industries_json LIKE ?)`,
    );
    const q = `%${filters.query}%`;
    params.push(q, q, q, q, q);
  }
  if (filters.minScore != null) {
    clauses.push(`score >= ?`);
    params.push(filters.minScore);
  }
  if (filters.status) {
    clauses.push(`status = ?`);
    params.push(filters.status);
  }
  if (filters.remoteOnly) {
    clauses.push(`remote_flag = 1`);
  }
  if (filters.todayOnly) {
    clauses.push(`status IN ('new', 'reviewed', 'saved', 'shortlisted', 'drafted')`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = filters.limit ?? 20;

  return db
    .prepare(
      `SELECT jobs.*, job_sources.external_id, job_sources.url AS source_url
       FROM jobs
       JOIN job_sources ON job_sources.id = jobs.source_id
       ${where}
       ORDER BY
         CASE WHEN role_source != 'company_fallback' THEN 0 ELSE 1 END ASC,
         CASE WHEN ? = 1 THEN
           score
           + CASE WHEN remote_flag = 1 THEN 5 ELSE 0 END
           + CASE WHEN compensation_min IS NOT NULL OR compensation_max IS NOT NULL THEN 4 ELSE 0 END
           + CASE WHEN risk_bullets_json = '[]' THEN 3 ELSE 0 END
         - CASE WHEN status = 'reviewed' THEN 2 ELSE 0 END
         ELSE score END DESC,
         score DESC,
         CASE WHEN title IS NULL THEN 1 ELSE 0 END ASC,
         company_name ASC,
         title ASC
       LIMIT ?`,
    )
    .all(...params, filters.todayOnly ? 1 : 0, limit) as JobRecord[];
}

export function getJobByQuery(
  db: Database.Database,
  query: string,
): JobRecord | undefined {
  const exact = db
    .prepare(
      `SELECT jobs.*, job_sources.external_id, job_sources.url AS source_url
       FROM jobs
       JOIN job_sources ON job_sources.id = jobs.source_id
       WHERE LOWER(company_name) = LOWER(?) OR LOWER(COALESCE(title, '')) = LOWER(?)
       ORDER BY
         CASE WHEN LOWER(COALESCE(title, '')) = LOWER(?) THEN 0 ELSE 1 END,
         CASE WHEN role_source != 'company_fallback' THEN 0 ELSE 1 END ASC,
         score DESC,
         CASE WHEN title IS NULL THEN 1 ELSE 0 END ASC,
         LENGTH(company_name || ' ' || COALESCE(title, '')) ASC
       LIMIT 1`,
    )
    .get(query, query, query) as JobRecord | undefined;
  if (exact) return exact;

  const partial = db
    .prepare(
      `SELECT jobs.*, job_sources.external_id, job_sources.url AS source_url
       FROM jobs
       JOIN job_sources ON job_sources.id = jobs.source_id
       WHERE LOWER(company_name) LIKE LOWER(?)
          OR LOWER(COALESCE(title, '')) LIKE LOWER(?)
          OR LOWER(company_name || ' ' || COALESCE(title, '')) LIKE LOWER(?)
       ORDER BY
         CASE WHEN LOWER(COALESCE(title, '')) = LOWER(?) THEN 0 ELSE 1 END,
         CASE WHEN role_source != 'company_fallback' THEN 0 ELSE 1 END ASC,
         score DESC,
         CASE WHEN title IS NULL THEN 1 ELSE 0 END ASC,
         LENGTH(company_name || ' ' || COALESCE(title, '')) ASC
       LIMIT 1`,
    )
    .get(`%${query}%`, `%${query}%`, `%${query}%`, query) as JobRecord | undefined;
  return partial;
}

export function getApplicationByJobId(
  db: Database.Database,
  jobId: number,
): ApplicationRecord | undefined {
  return db
    .prepare(`SELECT * FROM applications WHERE job_id = ?`)
    .get(jobId) as ApplicationRecord | undefined;
}

export function upsertDraft(
  db: Database.Database,
  input: DraftUpsertInput,
): number {
  const existing = db
    .prepare(`SELECT id, application_id, gmail_draft_id FROM drafts WHERE job_id = ? AND variant = ?`)
    .get(input.jobId, input.variant) as { id: number; application_id: number | null; gmail_draft_id: string | null } | undefined;

  db.prepare(
    `INSERT INTO drafts (job_id, application_id, variant, generated_content, edited_content, gmail_draft_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(job_id, variant) DO UPDATE SET
       application_id = COALESCE(excluded.application_id, drafts.application_id),
       generated_content = excluded.generated_content,
       edited_content = excluded.edited_content,
       gmail_draft_id = COALESCE(excluded.gmail_draft_id, drafts.gmail_draft_id),
       updated_at = datetime('now')`,
  ).run(
    input.jobId,
    input.applicationId ?? null,
    input.variant,
    input.generatedContent,
    input.editedContent ?? null,
    input.gmailDraftId ?? null,
  );

  const row = db
    .prepare(`SELECT id FROM drafts WHERE job_id = ? AND variant = ?`)
    .get(input.jobId, input.variant) as { id: number };

  if (input.applicationId != null) {
    createApplicationEvent(
      db,
      input.applicationId,
      existing ? "draft_updated" : "draft_saved",
      null,
      null,
      undefined,
      { draftId: row.id, variant: input.variant, gmailDraftId: input.gmailDraftId ?? existing?.gmail_draft_id ?? null },
    );
  }

  return row.id;
}

export function listDrafts(
  db: Database.Database,
  query?: string,
): DraftRecord[] {
  const where = query
    ? `WHERE jobs.company_name LIKE ? OR COALESCE(jobs.title, '') LIKE ? OR drafts.variant LIKE ?`
    : "";
  const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];
  return db
    .prepare(
      `SELECT drafts.*, jobs.company_name, jobs.title, applications.status AS application_status
       FROM drafts
       JOIN jobs ON jobs.id = drafts.job_id
       LEFT JOIN applications ON applications.id = drafts.application_id
       ${where}
       ORDER BY drafts.updated_at DESC, drafts.id DESC`,
    )
    .all(...params) as DraftRecord[];
}

export function getDraftById(
  db: Database.Database,
  draftId: number,
): DraftRecord | undefined {
  return db
    .prepare(
      `SELECT drafts.*, jobs.company_name, jobs.title, applications.status AS application_status
       FROM drafts
       JOIN jobs ON jobs.id = drafts.job_id
       LEFT JOIN applications ON applications.id = drafts.application_id
       WHERE drafts.id = ?`,
    )
    .get(draftId) as DraftRecord | undefined;
}

export function listAutoDraftJobs(
  db: Database.Database,
  minScore: number,
): JobRecord[] {
  return db
    .prepare(
      `SELECT jobs.*, job_sources.external_id, job_sources.url AS source_url
       FROM jobs
       JOIN job_sources ON job_sources.id = jobs.source_id
       LEFT JOIN drafts ON drafts.job_id = jobs.id
       WHERE jobs.score >= ?
         AND jobs.status = 'new'
         AND drafts.id IS NULL
       ORDER BY
         CASE WHEN jobs.role_source != 'company_fallback' THEN 0 ELSE 1 END ASC,
         jobs.score DESC,
         jobs.company_name ASC,
         jobs.title ASC`,
    )
    .all(minScore) as JobRecord[];
}

function parseStringArray(raw: string): string[] {
  return JSON.parse(raw) as string[];
}

function parseScoreBreakdown(raw: string): NextActionRecord["scoreBreakdown"] {
  return JSON.parse(raw) as NextActionRecord["scoreBreakdown"];
}

function scoreAction(
  type: "followup" | "send_draft" | "apply",
  score: number,
  dueAt?: string | null,
): number {
  const now = Date.now();
  const dueMs = dueAt ? new Date(dueAt).getTime() : null;
  const dueInDays = dueMs != null ? (dueMs - now) / (1000 * 60 * 60 * 24) : null;

  if (type === "followup") {
    if (dueInDays == null) return score + 40;
    if (dueInDays <= 0) return score + 80;
    if (dueInDays <= 1) return score + 65;
    if (dueInDays <= 3) return score + 50;
    return score + 35;
  }

  if (type === "send_draft") {
    return score + 45;
  }

  return score + 20;
}

function buildReason(job: JobRecord, extraReason?: string): string {
  const bullets = parseStringArray(job.explanation_bullets_json);
  return extraReason ?? bullets[0] ?? `${job.score} score with solid fit signals`;
}

function buildWhyMatch(job: JobRecord): string[] {
  const bullets = parseStringArray(job.explanation_bullets_json).filter(Boolean);
  if (bullets.length > 0) {
    return bullets.slice(0, 2);
  }
  return [`${job.score} score from the current fit model`];
}

function hasMinimumApplyFit(breakdown: NextActionRecord["scoreBreakdown"]): boolean {
  return (
    breakdown.roleFit >= TODAY_RANKING.applyMinRoleFit
    && breakdown.stackFit >= TODAY_RANKING.applyMinStackFit
  );
}

function hasStrongTechnicalFit(breakdown: NextActionRecord["scoreBreakdown"]): boolean {
  return (
    breakdown.roleFit >= TODAY_RANKING.strongRoleFit
    || breakdown.stackFit >= TODAY_RANKING.strongStackFit
  );
}

function isTechnicalBullet(bullet: string): boolean {
  const normalized = bullet.toLowerCase();
  return (
    normalized.includes("role fit")
    || normalized.includes("stack aligns")
    || normalized.includes("target role")
    || normalized.includes("target role families")
  );
}

function isSoftSignalBullet(bullet: string): boolean {
  const normalized = bullet.toLowerCase();
  return (
    normalized.includes("remote")
    || normalized.includes("fresh enough")
    || normalized.includes("prospect-curated")
    || normalized.includes("company signal")
    || normalized.includes("hiring posture")
  );
}

function isSoftSignalDriven(job: JobRecord, breakdown: NextActionRecord["scoreBreakdown"]): boolean {
  if (hasStrongTechnicalFit(breakdown)) {
    return false;
  }

  const bullets = parseStringArray(job.explanation_bullets_json).filter(Boolean);
  if (bullets.length === 0) {
    return false;
  }

  return bullets.every((bullet) => isSoftSignalBullet(bullet) && !isTechnicalBullet(bullet));
}

function buildRisk(job: JobRecord): string | null {
  return parseStringArray(job.risk_bullets_json)[0] ?? null;
}

function buildNextStep(type: "followup" | "send_draft" | "apply", risk: string | null): string {
  if (type === "followup") {
    return "send the follow-up now";
  }
  if (type === "send_draft") {
    return "polish the saved draft and send the application";
  }
  if (risk?.toLowerCase().includes("compensation")) {
    return "do a quick final check, then apply today";
  }
  return "apply today while the fit is fresh";
}

function buildApplyReason(status: JobStatus, breakdown: NextActionRecord["scoreBreakdown"]): string {
  if (status === "shortlisted") {
    return "Already shortlisted and ready for a decision today";
  }
  if (status === "saved") {
    return "Already saved; worth pushing to a real apply decision";
  }
  if (breakdown.freshness >= 7) {
    return "Fresh enough to prioritize from recent hiring activity";
  }
  return "Strong unapplied match in your queue";
}

function scoreApplyAction(job: JobRecord, breakdown: NextActionRecord["scoreBreakdown"]): number {
  let rank =
    (breakdown.roleFit * TODAY_RANKING.roleFitWeight)
    + (breakdown.stackFit * TODAY_RANKING.stackFitWeight)
    + (breakdown.seniorityFit * TODAY_RANKING.seniorityFitWeight)
    + (breakdown.freshness * TODAY_RANKING.freshnessWeight)
    + (breakdown.companySignal * TODAY_RANKING.companySignalWeight)
    + TODAY_RANKING.applyBaseScore;

  if (isSoftSignalDriven(job, breakdown)) {
    rank -= TODAY_RANKING.softSignalPenalty;
  }

  return rank;
}

export function listNextActions(
  db: Database.Database,
  limit = 10,
): NextActionRecord[] {
  const dueFollowups = db
    .prepare(
      `SELECT
         followups.id AS followup_id,
         followups.application_id,
         followups.due_at,
         jobs.id AS job_id,
         jobs.company_name,
         jobs.title,
         jobs.summary,
         jobs.locations,
         jobs.remote_flag,
         jobs.stage,
         jobs.batch,
         jobs.extracted_skills_json,
         jobs.tags_json,
         jobs.industries_json,
         jobs.score,
         jobs.score_breakdown_json,
         jobs.status,
         jobs.explanation_bullets_json,
         jobs.risk_bullets_json
       FROM followups
       JOIN jobs ON jobs.id = followups.job_id
       WHERE followups.status = 'pending'
       ORDER BY followups.due_at ASC, jobs.score DESC`,
    )
    .all() as Array<{
      followup_id: number;
      application_id: number | null;
      due_at: string;
      job_id: number;
      company_name: string;
      title: string | null;
      summary: string;
      locations: string;
      remote_flag: number;
      stage: string;
      batch: string;
      extracted_skills_json: string;
      tags_json: string;
      industries_json: string;
      score: number;
      score_breakdown_json: string;
      status: JobStatus;
      explanation_bullets_json: string;
      risk_bullets_json: string;
    }>;

  const draftedApplications = db
    .prepare(
      `SELECT
         applications.id AS application_id,
         jobs.id AS job_id,
         jobs.company_name,
         jobs.title,
         jobs.summary,
         jobs.locations,
         jobs.remote_flag,
         jobs.stage,
         jobs.batch,
         jobs.extracted_skills_json,
         jobs.tags_json,
         jobs.industries_json,
         jobs.score,
         jobs.score_breakdown_json,
         jobs.status,
         jobs.explanation_bullets_json,
         jobs.risk_bullets_json,
         MAX(drafts.updated_at) AS draft_updated_at
       FROM applications
       JOIN jobs ON jobs.id = applications.job_id
       LEFT JOIN drafts ON drafts.application_id = applications.id OR drafts.job_id = jobs.id
       WHERE applications.status = 'drafted'
       GROUP BY applications.id
       ORDER BY draft_updated_at DESC, jobs.score DESC`,
    )
    .all() as Array<{
      application_id: number;
      job_id: number;
      company_name: string;
      title: string | null;
      summary: string;
      locations: string;
      remote_flag: number;
      stage: string;
      batch: string;
      extracted_skills_json: string;
      tags_json: string;
      industries_json: string;
      score: number;
      score_breakdown_json: string;
      status: JobStatus;
      explanation_bullets_json: string;
      risk_bullets_json: string;
      draft_updated_at: string | null;
    }>;

  const unappliedJobs = db
    .prepare(
      `SELECT
         jobs.id AS job_id,
         jobs.company_name,
         jobs.title,
         jobs.summary,
         jobs.locations,
         jobs.remote_flag,
         jobs.stage,
         jobs.batch,
         jobs.extracted_skills_json,
         jobs.tags_json,
         jobs.industries_json,
         jobs.score,
         jobs.score_breakdown_json,
         jobs.status,
         jobs.explanation_bullets_json,
         jobs.risk_bullets_json
       FROM jobs
       LEFT JOIN applications ON applications.job_id = jobs.id
       WHERE jobs.status IN ('new', 'reviewed', 'saved', 'shortlisted')
         AND (applications.id IS NULL OR applications.status IN ('saved', 'shortlisted'))
         AND NOT EXISTS (
           SELECT 1
           FROM followups
           WHERE followups.job_id = jobs.id AND followups.status = 'pending'
         )
       ORDER BY
         CASE WHEN jobs.role_source != 'company_fallback' THEN 0 ELSE 1 END ASC,
         jobs.score DESC,
         jobs.company_name ASC`,
    )
    .all() as Array<{
      job_id: number;
      company_name: string;
      title: string | null;
      summary: string;
      locations: string;
      remote_flag: number;
      stage: string;
      batch: string;
      extracted_skills_json: string;
      tags_json: string;
      industries_json: string;
      score: number;
      score_breakdown_json: string;
      status: JobStatus;
      explanation_bullets_json: string;
      risk_bullets_json: string;
    }>;

  const actions: NextActionRecord[] = [
    ...dueFollowups.map((row) => {
      const job = row as unknown as JobRecord;
      const risk = buildRisk(job);
      const breakdown = parseScoreBreakdown(row.score_breakdown_json);
      return {
        actionType: "followup" as const,
        rankScore: scoreAction("followup", row.score, row.due_at),
        companyName: row.company_name,
        title: row.title,
        summary: row.summary,
        locations: row.locations,
        remoteFlag: row.remote_flag === 1,
        stage: row.stage,
        batch: row.batch,
        extractedSkills: parseStringArray(row.extracted_skills_json),
        tags: parseStringArray(row.tags_json),
        industries: parseStringArray(row.industries_json),
        score: row.score,
        scoreBreakdown: breakdown,
        status: row.status,
        reason: row.due_at <= new Date().toISOString()
          ? `Follow-up overdue since ${row.due_at}`
          : `Follow-up due ${row.due_at}`,
        whyMatch: buildWhyMatch(job),
        risk,
        nextStep: buildNextStep("followup", risk),
        dueAt: row.due_at,
        jobId: row.job_id,
        applicationId: row.application_id,
        followupId: row.followup_id,
      };
    }),
    ...draftedApplications.map((row) => {
      const job = row as unknown as JobRecord;
      const risk = buildRisk(job);
      const breakdown = parseScoreBreakdown(row.score_breakdown_json);
      return {
        actionType: "send_draft" as const,
        rankScore: scoreAction("send_draft", row.score),
        companyName: row.company_name,
        title: row.title,
        summary: row.summary,
        locations: row.locations,
        remoteFlag: row.remote_flag === 1,
        stage: row.stage,
        batch: row.batch,
        extractedSkills: parseStringArray(row.extracted_skills_json),
        tags: parseStringArray(row.tags_json),
        industries: parseStringArray(row.industries_json),
        score: row.score,
        scoreBreakdown: breakdown,
        status: row.status,
        reason: "Draft is ready; this is close to submission",
        whyMatch: buildWhyMatch(job),
        risk,
        nextStep: buildNextStep("send_draft", risk),
        dueAt: null,
        jobId: row.job_id,
        applicationId: row.application_id,
      };
    }),
    ...unappliedJobs.flatMap((row) => {
      const job = row as unknown as JobRecord;
      const risk = buildRisk(job);
      const breakdown = parseScoreBreakdown(row.score_breakdown_json);
      if (!hasMinimumApplyFit(breakdown)) {
        return [];
      }
      return {
        actionType: "apply" as const,
        rankScore: scoreApplyAction(job, breakdown),
        companyName: row.company_name,
        title: row.title,
        summary: row.summary,
        locations: row.locations,
        remoteFlag: row.remote_flag === 1,
        stage: row.stage,
        batch: row.batch,
        extractedSkills: parseStringArray(row.extracted_skills_json),
        tags: parseStringArray(row.tags_json),
        industries: parseStringArray(row.industries_json),
        score: row.score,
        scoreBreakdown: breakdown,
        status: row.status,
        reason: buildApplyReason(row.status, breakdown),
        whyMatch: buildWhyMatch(job),
        risk,
        nextStep: buildNextStep("apply", risk),
        dueAt: null,
        jobId: row.job_id,
      };
    }),
  ];

  return actions
    .sort((left, right) => right.rankScore - left.rankScore || right.score - left.score || left.companyName.localeCompare(right.companyName))
    .slice(0, limit);
}

export function createApplicationEvent(
  db: Database.Database,
  applicationId: number,
  eventType: string,
  previousStatus: ApplicationStatus | null,
  nextStatus: ApplicationStatus | null,
  note?: string,
  metadata?: Record<string, unknown>,
): number {
  const result = db
    .prepare(
      `INSERT INTO application_events (
        application_id, event_type, previous_status, next_status, note, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      applicationId,
      eventType,
      previousStatus ?? null,
      nextStatus ?? null,
      note ?? null,
      JSON.stringify(metadata ?? {}),
    );
  return Number(result.lastInsertRowid);
}

export function getApplicationEvents(
  db: Database.Database,
  applicationId: number,
): ApplicationEventRecord[] {
  return db
    .prepare(`SELECT * FROM application_events WHERE application_id = ? ORDER BY id ASC`)
    .all(applicationId) as ApplicationEventRecord[];
}

export function upsertApplication(
  db: Database.Database,
  jobId: number,
  input: ApplicationUpdateInput,
): number {
  const existing = getApplicationByJobId(db, jobId);
  db.prepare(
    `INSERT INTO applications (
       job_id, applied_at, status, notes, applied_url, resume_version, outreach_draft_version,
       response_received, response_type, interview_stage, rejection_reason, last_contacted_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(job_id) DO UPDATE SET
       applied_at = COALESCE(excluded.applied_at, applications.applied_at),
       status = excluded.status,
       notes = COALESCE(excluded.notes, applications.notes),
       applied_url = COALESCE(excluded.applied_url, applications.applied_url),
       resume_version = COALESCE(excluded.resume_version, applications.resume_version),
       outreach_draft_version = COALESCE(excluded.outreach_draft_version, applications.outreach_draft_version),
       response_received = COALESCE(excluded.response_received, applications.response_received),
       response_type = COALESCE(excluded.response_type, applications.response_type),
       interview_stage = COALESCE(excluded.interview_stage, applications.interview_stage),
       rejection_reason = COALESCE(excluded.rejection_reason, applications.rejection_reason),
       last_contacted_at = COALESCE(excluded.last_contacted_at, applications.last_contacted_at),
       updated_at = datetime('now')`,
  ).run(
    jobId,
    input.appliedAt ?? null,
    input.status,
    input.note ?? null,
    input.appliedUrl ?? null,
    input.resumeVersion ?? null,
    input.outreachDraftVersion ?? null,
    input.responseReceived ? 1 : 0,
    input.responseType ?? null,
    input.interviewStage ?? null,
    input.rejectionReason ?? null,
    input.lastContactedAt ?? null,
  );

  const row = db
    .prepare(`SELECT id FROM applications WHERE job_id = ?`)
    .get(jobId) as { id: number };

  createApplicationEvent(
    db,
    row.id,
    "status_changed",
    existing?.status ?? null,
    input.status,
    input.note,
    {
      appliedAt: input.appliedAt ?? null,
      appliedUrl: input.appliedUrl ?? null,
      resumeVersion: input.resumeVersion ?? null,
      outreachDraftVersion: input.outreachDraftVersion ?? null,
      responseReceived: input.responseReceived ?? null,
      responseType: input.responseType ?? null,
      interviewStage: input.interviewStage ?? null,
      rejectionReason: input.rejectionReason ?? null,
      lastContactedAt: input.lastContactedAt ?? null,
    },
  );

  db.prepare(`UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(maybeJobStatus(input.status), jobId);

  return row.id;
}

export function createFollowup(
  db: Database.Database,
  jobId: number,
  applicationId: number | null,
  dueAt: string,
  note?: string,
  status: FollowupStatus = "pending",
): number {
  const result = db
    .prepare(
      `INSERT INTO followups (job_id, application_id, due_at, status, note, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(jobId, applicationId, dueAt, status, note ?? null);
  if (applicationId != null) {
    createApplicationEvent(db, applicationId, "followup_created", null, null, note, { dueAt, status });
  }
  return Number(result.lastInsertRowid);
}

export function listPendingFollowups(db: Database.Database): FollowupRecord[] {
  return db
    .prepare(
      `SELECT followups.*, jobs.company_name, jobs.website, jobs.title
       FROM followups
       JOIN jobs ON jobs.id = followups.job_id
       WHERE followups.status = 'pending'
       ORDER BY due_at ASC, followups.id ASC`,
    )
    .all() as FollowupRecord[];
}

export function getFollowupById(
  db: Database.Database,
  followupId: number,
): FollowupRecord | undefined {
  return db
    .prepare(
      `SELECT followups.*, jobs.company_name, jobs.website, jobs.title
       FROM followups
       JOIN jobs ON jobs.id = followups.job_id
       WHERE followups.id = ?`,
    )
    .get(followupId) as FollowupRecord | undefined;
}

export function updateFollowup(
  db: Database.Database,
  followupId: number,
  input: FollowupUpdateInput,
): void {
  const existing = getFollowupById(db, followupId);
  if (!existing) {
    throw new Error(`Follow-up ${followupId} not found.`);
  }

  db.prepare(
    `UPDATE followups
     SET due_at = COALESCE(?, due_at),
         status = COALESCE(?, status),
         note = COALESCE(?, note),
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(input.dueAt ?? null, input.status ?? null, input.note ?? null, followupId);

  if (existing.application_id != null) {
    const eventType =
      input.status === "done"
        ? "followup_done"
        : input.status === "skipped"
          ? "followup_skipped"
          : input.dueAt
            ? "followup_rescheduled"
            : "followup_updated";
    createApplicationEvent(
      db,
      existing.application_id,
      eventType,
      null,
      null,
      input.note,
      {
        previousDueAt: existing.due_at,
        nextDueAt: input.dueAt ?? existing.due_at,
        nextStatus: input.status ?? existing.status,
      },
    );
  }
}

export function getConversionStats(db: Database.Database): ConversionStats {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS saved,
         SUM(CASE WHEN status IN ('applied', 'followup_due', 'replied', 'interview', 'rejected', 'archived') THEN 1 ELSE 0 END) AS applied,
         SUM(CASE WHEN status IN ('replied', 'interview', 'rejected', 'archived') THEN 1 ELSE 0 END) AS replied,
         SUM(CASE WHEN status = 'interview' THEN 1 ELSE 0 END) AS interview
       FROM applications`,
    )
    .get() as {
      saved: number | null;
      applied: number | null;
      replied: number | null;
      interview: number | null;
    };

  return {
    saved: row.saved ?? 0,
    applied: row.applied ?? 0,
    replied: row.replied ?? 0,
    interview: row.interview ?? 0,
  };
}

export function getScoreRangeStats(db: Database.Database): ScoreRangeStats[] {
  const rows = db
    .prepare(
      `SELECT
         CASE
           WHEN jobs.score >= 85 THEN '85-100'
           WHEN jobs.score >= 70 THEN '70-84'
           WHEN jobs.score >= 55 THEN '55-69'
           ELSE '0-54'
         END AS range,
         COUNT(*) AS total,
         SUM(CASE WHEN applications.status IN ('applied', 'followup_due', 'replied', 'interview', 'rejected', 'archived') THEN 1 ELSE 0 END) AS applied,
         SUM(CASE WHEN applications.status IN ('replied', 'interview', 'rejected', 'archived') THEN 1 ELSE 0 END) AS replied,
         SUM(CASE WHEN applications.status = 'interview' THEN 1 ELSE 0 END) AS interview
       FROM jobs
       LEFT JOIN applications ON applications.job_id = jobs.id
       GROUP BY range
       ORDER BY
         CASE range
           WHEN '85-100' THEN 1
           WHEN '70-84' THEN 2
           WHEN '55-69' THEN 3
           ELSE 4
         END`,
    )
    .all() as Array<{
      range: string;
      total: number | null;
      applied: number | null;
      replied: number | null;
      interview: number | null;
    }>;

  return rows.map((row) => ({
    range: row.range,
    total: row.total ?? 0,
    applied: row.applied ?? 0,
    replied: row.replied ?? 0,
    interview: row.interview ?? 0,
  }));
}

export function getSourceStats(db: Database.Database): SourceStats[] {
  const rows = db
    .prepare(
      `SELECT
         job_sources.provider AS source,
         COUNT(*) AS total,
         SUM(CASE WHEN applications.status IN ('applied', 'followup_due', 'replied', 'interview', 'rejected', 'archived') THEN 1 ELSE 0 END) AS applied,
         SUM(CASE WHEN applications.status IN ('replied', 'interview', 'rejected', 'archived') THEN 1 ELSE 0 END) AS replied,
         SUM(CASE WHEN applications.status = 'interview' THEN 1 ELSE 0 END) AS interview
       FROM jobs
       JOIN job_sources ON job_sources.id = jobs.source_id
       LEFT JOIN applications ON applications.job_id = jobs.id
       GROUP BY job_sources.provider
       ORDER BY total DESC, source ASC`,
    )
    .all() as Array<{
      source: string;
      total: number | null;
      applied: number | null;
      replied: number | null;
      interview: number | null;
    }>;

  return rows.map((row) => ({
    source: row.source,
    total: row.total ?? 0,
    applied: row.applied ?? 0,
    replied: row.replied ?? 0,
    interview: row.interview ?? 0,
  }));
}

export function markJobStatus(
  db: Database.Database,
  jobId: number,
  status: JobStatus,
): void {
  db.prepare(`UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, jobId);
}
