export type WebJobStatus =
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

export type WebJobSource =
  | "yc"
  | "greenhouse"
  | "lever"
  | "careers"
  | "linkedin"
  | "indeed";

export type AnalyticsSourceKey =
  | "yc"
  | "greenhouse"
  | "lever"
  | "careers"
  | "manual";

export interface ScoreBreakdown {
  roleFit: number;
  stackFit: number;
  seniorityFit: number;
  freshness: number;
  companySignal: number;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  source: WebJobSource;
  score: number;
  status: WebJobStatus;
  skills: string[];
  risks: string[];
  postedAt: string;
  updatedAt: string;
  url?: string;
  description?: string;
  scoreBreakdown?: ScoreBreakdown;
  explanation?: string[];
  isProspect?: boolean;
}

export interface JobApplicationDetail {
  id: number;
  status: WebJobStatus;
  appliedAt: string | null;
  notes: string | null;
  interviewStage: string | null;
  lastContactedAt: string | null;
}

export interface JobFollowupDetail {
  id: number;
  dueAt: string;
  note: string | null;
  overdue: boolean;
}

export interface JobDraftDetail {
  id: number;
  variant: string;
  content: string;
  updatedAt: string;
  gmailDraftId: string | null;
}

export interface JobDetailData extends Job {
  remote: boolean;
  seniorityHint: string | null;
  compensation: string | null;
  sourceUrl: string | null;
  application: JobApplicationDetail | null;
  followup: JobFollowupDetail | null;
  draft: JobDraftDetail | null;
}

export interface ShellSummary {
  trackedRoles: number;
  sourcesScanned: number;
  followupsDue: number;
  draftsPending: number;
  latestCompletedAt: string | null;
}

export interface TodayAction {
  id: string;
  actionType: "followup" | "send_draft" | "apply";
  company: string;
  title: string;
  score: number;
  reason: string;
  nextStep: string;
  dueAt: string | null;
  location: string;
  status: WebJobStatus;
  skills: string[];
  risk: string | null;
  whyMatch: string[];
  url?: string;
}

export interface PipelineStage {
  status: WebJobStatus;
  label: string;
  count: number;
}

export interface BriefingRoleSummary {
  jobId: number;
  company: string;
  title: string;
  score: number;
  status: WebJobStatus;
  url: string | null;
  skillMatches: string[];
  risk: string;
  riskLevel: "mid" | "low";
  discoveredAt: string;
}

export interface BriefingFollowupSummary {
  followupId: number;
  jobId: number;
  company: string;
  title: string;
  dueAt: string;
  appliedAt: string | null;
  daysSinceApplied: number | null;
  overdue: boolean;
}

export interface BriefingDraftSummary {
  draftId: number;
  jobId: number;
  company: string;
  title: string;
  preview: string;
  content: string;
  variant: string;
  updatedAt: string;
}

export interface BriefingFunnelStage {
  label: string;
  count: number;
  conversionRate: string | null;
}

export interface BriefingDashboardData {
  generatedAt: string;
  isMonday: boolean;
  summary: {
    newRoles: number;
    scored60Plus: number;
    followupsDue: number;
  };
  metrics: {
    topScore: number | null;
    appliedThisWeek: number;
    followupsDue: number;
  };
  highPriorityRoles: BriefingRoleSummary[];
  newTodayRoles: BriefingRoleSummary[];
  followups: BriefingFollowupSummary[];
  drafts: BriefingDraftSummary[];
  funnel: {
    stages: BriefingFunnelStage[];
  };
}

export type PipelineColumnId =
  | "shortlisted"
  | "drafted"
  | "applied"
  | "responded"
  | "interview"
  | "offer"
  | "rejected"
  | "archived";

export interface PipelineCard extends Job {
  column: PipelineColumnId;
  applicationId: number | null;
  interviewStage: string | null;
  daysInStatus: number;
  followupDue: boolean;
}

export interface PipelineColumn {
  id: PipelineColumnId;
  label: string;
  count: number;
  cards: PipelineCard[];
}

export interface PipelineBoardData {
  columns: PipelineColumn[];
  totalCards: number;
  filters: {
    search: string;
    source: WebJobSource | "all";
  };
}

export interface AnalyticsMetricSummary {
  totalRolesTracked: number;
  rolesScored70Plus: number;
  applicationsSent: number;
  responsesReceived: number;
  responseRate: number;
  averageDaysToResponse: number | null;
}

export interface AnalyticsScoreBucket {
  label: string;
  rangeStart: number;
  rangeEnd: number;
  count: number;
  color: "gray" | "amber" | "green";
}

export interface AnalyticsSourceRow {
  source: AnalyticsSourceKey;
  label: string;
  roles: number;
  averageScore: number;
  roles60Plus: number;
  appliedCount: number;
}

export interface AnalyticsFunnelStage {
  key: "new" | "shortlisted" | "drafted" | "applied" | "responded" | "interview";
  label: string;
  count: number;
  conversionFromPrevious: number | null;
}

export interface AnalyticsTimelinePoint {
  date: string;
  count: number;
}

export interface AnalyticsOverviewData {
  summary: AnalyticsMetricSummary;
  scoreDistribution: AnalyticsScoreBucket[];
  sourceBreakdown: AnalyticsSourceRow[];
  funnel: AnalyticsFunnelStage[];
  timeline: AnalyticsTimelinePoint[];
}
