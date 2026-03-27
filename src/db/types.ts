export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];
export type JsonObject = Record<string, JsonValue>;

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
export type ApplicationStatus =
  | "saved"
  | "shortlisted"
  | "drafted"
  | "applied"
  | "followup_due"
  | "replied"
  | "interview"
  | "rejected"
  | "archived";
export type FollowupStatus = "pending" | "done" | "skipped";
export type ResponseType = "email" | "linkedin" | "phone" | "referral" | "other";
export type InterviewStage =
  | "recruiter_screen"
  | "hiring_manager"
  | "technical"
  | "onsite"
  | "final"
  | "offer";

export interface ApplicationRecord {
  id: number;
  job_id: number;
  applied_at: string | null;
  status: ApplicationStatus;
  notes: string | null;
  applied_url: string | null;
  resume_version: string | null;
  outreach_draft_version: string | null;
  response_received: boolean;
  response_type: ResponseType | null;
  interview_stage: InterviewStage | null;
  rejection_reason: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationEventRecord {
  id: number;
  application_id: number;
  event_type: string;
  previous_status: ApplicationStatus | null;
  next_status: ApplicationStatus | null;
  note: string | null;
  metadata_json: JsonObject;
  created_at: string;
}

export interface ScoreBreakdown {
  roleFit: number;
  stackFit: number;
  seniorityFit: number;
  freshness: number;
  companySignal: number;
  prospect_listed?: boolean;
}

export interface JobRecord {
  id: number;
  source_id: number;
  scan_id: number;
  external_key: string;
  role_external_id: string | null;
  role_source: string;
  company_name: string;
  external_id: string;
  source_url: string;
  provider?: string;
  title: string | null;
  summary: string;
  website: string;
  locations: string;
  remote_flag: boolean;
  job_url: string;
  posted_at: string | null;
  regions_json: string[];
  tags_json: string[];
  industries_json: string[];
  stage: string;
  batch: string;
  team_size: number | null;
  seniority_hint: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_currency: string | null;
  compensation_period: string | null;
  extracted_skills_json: string[];
  top_company: boolean;
  is_hiring: boolean;
  score: number;
  score_reasons_json: string[];
  score_breakdown_json: ScoreBreakdown;
  explanation_bullets_json: string[];
  risk_bullets_json: string[];
  status: JobStatus;
  created_at: string;
  updated_at: string;
  application_status?: ApplicationStatus | null;
}

export type SupabaseRow<T> = T;

export interface JobSourceInput {
  provider: string;
  externalId: string;
  url: string;
}

export interface JobUpsertInput {
  sourceId: number;
  scanId: number;
  externalKey: string;
  roleExternalId?: string | null;
  roleSource: string;
  companyName: string;
  title?: string | null;
  summary: string;
  website: string;
  locations: string;
  remoteFlag?: boolean;
  jobUrl: string;
  postedAt?: string | null;
  regions: string[];
  tags: string[];
  industries: string[];
  stage: string;
  batch: string;
  teamSize?: number;
  seniorityHint?: string | null;
  compensationMin?: number | null;
  compensationMax?: number | null;
  compensationCurrency?: string | null;
  compensationPeriod?: string | null;
  extractedSkills?: string[];
  topCompany: boolean;
  isHiring: boolean;
  score: number;
  scoreReasons: string[];
  scoreBreakdown: ScoreBreakdown;
  explanationBullets: string[];
  riskBullets: string[];
  status?: JobStatus;
}

export interface ReviewFilters {
  query?: string;
  minScore?: number;
  status?: JobStatus;
  remoteOnly?: boolean;
  todayOnly?: boolean;
  limit?: number;
}

export interface BrowseFilters {
  query?: string;
  minScore?: number;
  status?: JobStatus;
  remoteOnly?: boolean;
  source?: string;
  prospectOnly?: boolean;
  realRolesOnly?: boolean;
  postedWithinDays?: number;
  trackedWithinDays?: number;
  sort?: "score" | "posted" | "tracked" | "company";
  limit?: number;
}

export interface BrowseJobRecord extends JobRecord {
  provider: string;
}

export interface FollowupRecord {
  id: number;
  job_id: number;
  application_id: number | null;
  due_at: string;
  status: FollowupStatus;
  note: string | null;
  company_name: string;
  website: string;
  title: string | null;
}

export interface ApplicationUpdateInput {
  status: ApplicationStatus;
  note?: string;
  appliedAt?: string | null;
  appliedUrl?: string;
  resumeVersion?: string;
  outreachDraftVersion?: string;
  responseReceived?: boolean;
  responseType?: ResponseType;
  interviewStage?: InterviewStage;
  rejectionReason?: string;
  lastContactedAt?: string | null;
}

export interface FollowupUpdateInput {
  status?: FollowupStatus;
  dueAt?: string;
  note?: string;
}

export interface DraftRecord {
  id: number;
  job_id: number;
  application_id: number | null;
  variant: string;
  generated_content: string;
  edited_content: string | null;
  gmail_draft_id: string | null;
  created_at: string;
  updated_at: string;
  company_name: string;
  title: string | null;
  application_status: ApplicationStatus | null;
}

export interface DraftUpsertInput {
  jobId: number;
  applicationId?: number | null;
  variant: string;
  generatedContent: string;
  editedContent?: string | null;
  gmailDraftId?: string | null;
}

export type ActionType = "followup" | "send_draft" | "apply";

export interface NextActionRecord {
  actionType: ActionType;
  rankScore: number;
  companyName: string;
  title: string | null;
  summary: string;
  locations: string;
  remoteFlag: boolean;
  stage: string;
  batch: string;
  extractedSkills: string[];
  tags: string[];
  industries: string[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
  status: JobStatus;
  reason: string;
  whyMatch: string[];
  risk: string | null;
  nextStep: string;
  dueAt?: string | null;
  jobId: number;
  applicationId?: number | null;
  followupId?: number | null;
}

export interface ConversionStats {
  saved: number;
  applied: number;
  replied: number;
  interview: number;
}

export interface ScoreRangeStats {
  range: string;
  total: number;
  applied: number;
  replied: number;
  interview: number;
}

export interface SourceStats {
  source: string;
  total: number;
  applied: number;
  replied: number;
  interview: number;
}

export interface BaselineSnapshotRecord {
  id: number;
  label: string;
  effective_date: string;
  created_at: string;
}

export interface BaselineJobRecord {
  baseline_id: number;
  job_id: number;
  score_snapshot: number;
  status_snapshot: JobStatus;
  role_source_snapshot: string;
  posted_at_snapshot: string | null;
  discovered_at_snapshot: string;
  created_at: string;
}
