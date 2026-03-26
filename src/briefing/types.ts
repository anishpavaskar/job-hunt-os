export interface BriefingNewRole {
  kind?: "role" | "overflow";
  rank: number | null;
  score: number | null;
  company: string;
  role: string;
  location: string;
  whyItFits: string;
  topRisk: string | null;
  applyLink: string | null;
  isProspect: boolean;
  remoteFlag: boolean;
  extractedSkills: string[];
  stackMatch: number;
  applicationStatus: string | null;
}

export interface BriefingApplyNowRole {
  rank: number;
  score: number;
  company: string;
  role: string;
  location: string;
  whyNow: string;
  topRisk: string | null;
  applyLink: string;
}

export interface BriefingFollowup {
  company: string;
  role: string | null;
  dueDate: string;
  lastAction: string;
  notes: string | null;
  appliedDate: string | null;
}

export interface BriefingDraft {
  company: string;
  role: string | null;
  draftVariant: string;
  createdDate: string;
}

export interface BriefingFunnel {
  totalTracked: number;
  appliedThisWeek: number;
  responsesReceived: number;
  interviewsScheduled: number;
  applyToResponseRate: string;
  responseToInterviewRate: string;
}

export interface BriefingData {
  date: string;
  applyNow: BriefingApplyNowRole[];
  newRoles: BriefingNewRole[];
  followups: BriefingFollowup[];
  drafts: BriefingDraft[];
  funnel: BriefingFunnel | null;
  appliedCount: number;
  workflowCounts: {
    saved: number;
    drafted: number;
    applied: number;
    interview: number;
  };
  totalTracked: number;
  sourcesScanned: number;
}

export function countVisibleNewRoles(roles: BriefingNewRole[]): number {
  return roles.filter((role) => role.kind !== "overflow").length;
}
