import { initDb } from "@/src/db";
import { listBrowseJobs, listPendingFollowups } from "@/src/db/repositories";
import type { ApplicationStatus, BrowseJobRecord } from "@/src/db/types";
import { toWebJob } from "@/lib/server/web-data";
import type {
  PipelineBoardData,
  PipelineCard,
  PipelineColumn,
  PipelineColumnId,
  WebJobSource,
} from "@/lib/web/types";

type ApplicationRow = {
  id: number | string;
  job_id: number | string;
  status: ApplicationStatus;
  updated_at: string;
  applied_at: string | null;
  interview_stage: string | null;
};

const COLUMN_ORDER: PipelineColumnId[] = [
  "shortlisted",
  "drafted",
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
  "archived",
];

const COLUMN_LABELS: Record<PipelineColumnId, string> = {
  shortlisted: "Shortlisted",
  drafted: "Drafted",
  applied: "Applied",
  responded: "Responded",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  archived: "Archived",
};

function mapColumn(
  status: string | null | undefined,
  interviewStage: string | null | undefined,
): PipelineColumnId | null {
  switch (status) {
    case "shortlisted":
      return "shortlisted";
    case "drafted":
      return "drafted";
    case "applied":
    case "followup_due":
      return "applied";
    case "replied":
      return "responded";
    case "interview":
      return interviewStage === "offer" ? "offer" : "interview";
    case "rejected":
      return "rejected";
    case "archived":
      return "archived";
    default:
      return null;
  }
}

function daysInStatus(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function matchesSearch(job: BrowseJobRecord, search: string): boolean {
  if (!search) return true;
  return job.company_name.toLowerCase().includes(search);
}

function buildCard(
  job: BrowseJobRecord,
  application: ApplicationRow | undefined,
  followupDue: boolean,
): PipelineCard | null {
  const column = mapColumn(application?.status ?? job.application_status ?? job.status, application?.interview_stage);
  if (!column) return null;

  return {
    ...toWebJob(job),
    column,
    applicationId: application ? Number(application.id) : null,
    interviewStage: application?.interview_stage ?? null,
    daysInStatus: daysInStatus(application?.updated_at ?? job.updated_at),
    followupDue,
  };
}

export async function getPipelineBoardData(filters: {
  search?: string;
  source?: WebJobSource | "all";
}): Promise<PipelineBoardData> {
  const db = await initDb();
  const search = (filters.search ?? "").trim().toLowerCase();
  const source = filters.source ?? "all";

  const [jobs, applicationsResponse, followups] = await Promise.all([
    listBrowseJobs(db, { limit: 5000, sort: "tracked", realRolesOnly: true }),
    db.from("applications").select("id, job_id, status, updated_at, applied_at, interview_stage"),
    listPendingFollowups(db),
  ]);

  if (applicationsResponse.error) {
    throw new Error(`pipeline applications: ${applicationsResponse.error.message}`);
  }

  const applications = (applicationsResponse.data ?? []) as ApplicationRow[];
  const applicationByJobId = new Map<number, ApplicationRow>(
    applications.map((application) => [Number(application.job_id), application]),
  );
  const dueFollowupsByJobId = new Set<number>(
    followups
      .filter((followup) => new Date(followup.due_at).getTime() <= Date.now())
      .map((followup) => followup.job_id),
  );

  const grouped = new Map<PipelineColumnId, PipelineCard[]>(COLUMN_ORDER.map((column) => [column, []]));

  for (const job of jobs) {
    if (!matchesSearch(job, search)) continue;
    const card = buildCard(job, applicationByJobId.get(job.id), dueFollowupsByJobId.has(job.id));
    if (!card) continue;
    if (source !== "all" && card.source !== source) continue;
    grouped.get(card.column)?.push(card);
  }

  const columns: PipelineColumn[] = COLUMN_ORDER.map((id) => {
    const cards = (grouped.get(id) ?? []).sort((left, right) => {
      const followupDiff = Number(right.followupDue) - Number(left.followupDue);
      if (followupDiff !== 0) return followupDiff;
      if (right.daysInStatus !== left.daysInStatus) return right.daysInStatus - left.daysInStatus;
      if (right.score !== left.score) return right.score - left.score;
      return left.company.localeCompare(right.company) || left.title.localeCompare(right.title);
    });

    return {
      id,
      label: COLUMN_LABELS[id],
      count: cards.length,
      cards,
    };
  });

  return {
    columns,
    totalCards: columns.reduce((total, column) => total + column.count, 0),
    filters: {
      search: filters.search ?? "",
      source,
    },
  };
}
