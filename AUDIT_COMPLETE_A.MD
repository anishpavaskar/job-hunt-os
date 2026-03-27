# PROMPT A: ARCHITECTURE TRUTH MAP

## 1. `npm run scan`

### CLI entrypoint

Reference: `package.json:9`, `src/cli.ts:21-29`, `src/cli.ts:47-49`

```json
{
  "scan": "ts-node src/cli.ts scan"
}
```

```ts
dotenv.config();

const program = new Command();

program
  .name("job-hunt-os")
  .description("CLI-first MVP for scanning, reviewing, and tracking job applications");

program.addCommand(registerScanCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(`[job-hunt-os] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

### Command registration

Reference: `src/commands/scan.ts:481-503`

```ts
export function registerScanCommand(): Command {
  return new Command("scan")
    .description("Fetch jobs from YC, Greenhouse, Lever, and selected career pages, score them, and persist them to SQLite")
    .option("--source <source>", "yc, greenhouse, lever, careers, or all", "all")
    .option("--slug-audit", "print configured slug, HTTP result, and jobs returned for Greenhouse and Lever")
    .option(
      "--score-debug <selector>",
      "print scoring internals for matching jobs; repeat or comma-separate values",
      collectListOption,
      [],
    )
    .action(async (opts: { source?: ScanSource; slugAudit?: boolean; scoreDebug?: string[] }) => {
      const source = (opts.source ?? "all") as ScanSource;
      if (!["all", "yc", "greenhouse", "lever", "careers"].includes(source)) {
        throw new Error(`Unsupported source "${opts.source}". Use yc, greenhouse, lever, careers, or all.`);
      }

      const result = await runScanCommand({ source, slugAudit: opts.slugAudit, scoreDebug: opts.scoreDebug });
      console.log(
        `Scanned ${result.activeSources} sources. ${result.upserted} upserted. ${result.newCount} new. ${result.updatedCount} updated. ${result.scored80Plus} scored 80+.`,
      );
    });
}
```

### Main call chain

```text
package.json:9
→ src/cli.ts:29
→ src/commands/scan.ts:481-503
→ src/commands/scan.ts:498
→ src/commands/scan.ts:201-470 (runScanCommand)
→ src/db/index.ts:26-29 (initDb)
→ src/db/index.ts:12-23 (getDb)
→ src/db/schema.ts:3-160 (applySchema)
→ src/commands/scan.ts:240-363 (per-provider loop)
→ src/db/repositories.ts:52-65 (createScan)
→ provider collectors / fetchers / normalizers
→ src/score/scorer.ts:329-358 (scoreOpportunity)
→ src/db/repositories.ts:82-101 (getExistingJobExternalKeys)
→ src/db/repositories.ts:103-121 (upsertJobSource)
→ src/ingest/normalize.ts:203-250 (toJobUpsertInput)
→ src/db/repositories.ts:208-291 (upsertJob)
→ src/db/repositories.ts:67-80 (completeScan)
→ return from src/commands/scan.ts:459-469
→ console.log in src/commands/scan.ts:499-500
```

### DB init and schema application

Reference: `src/db/index.ts:12-29`, `src/db/schema.ts:3-10`

```ts
export function getDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath ?? getDefaultDbPath();
  if (resolvedPath !== ":memory:") {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initDb(dbPath?: string): Database.Database {
  const instance = getDb(dbPath);
  applySchema(instance);
  return instance;
}
```

```ts
export function applySchema(db: Database.Database): void {
  migrateJobsTable(db);
  migrateApplicationsTable(db);
  ensureScansColumns(db);
  ensureJobsColumns(db);
  ensureDraftsColumns(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_sources (
      ...
```

### Provider loop and scan records

Reference: `src/commands/scan.ts:240-363`

```ts
for (const provider of activeSources) {
  const scanId = createScan(db, provider, startedAt);
  scanIds[provider] = scanId;

  try {
    if (provider === "yc") {
      const fetchCompanies = deps.fetchYcCompanies ?? deps.fetchCompanies ?? (() => fetchYcCompanies());
      const result = await collectYcOpportunities(fetchCompanies);
      groupedOpportunities.yc = result.opportunities;
      sourceCounts.yc = {
        rawCount: result.rawCount,
        validCount: result.validCount,
        totalRoles: result.opportunities.length,
        deduped: 0,
        upserted: 0,
        newCount: 0,
        scored80Plus: 0,
        roleCount: result.roleCount,
      };
      completeScan(db, scanId, result.rawCount, result.validCount, new Date().toISOString(), sourceCounts.yc);
      continue;
    }

    if (provider === "greenhouse") {
      const fetchJobs = deps.fetchGreenhouseJobs ?? (() => fetchGreenhouseJobs(
        GREENHOUSE_COMPANIES,
        globalThis.fetch,
        ...
      ));
      const result = await collectExternalOpportunities(
        "greenhouse",
        await fetchJobs(),
        new Map(GREENHOUSE_COMPANIES.map((company) => [company.slug, company.name])),
      );
      groupedOpportunities.greenhouse = result.opportunities;
      sourceCounts.greenhouse = {
        rawCount: result.rawCount,
        validCount: result.validCount,
        totalRoles: result.opportunities.length,
        deduped: 0,
        upserted: 0,
        newCount: 0,
        scored80Plus: 0,
        roleCount: result.roleCount,
      };
      completeScan(db, scanId, result.rawCount, result.validCount, new Date().toISOString(), sourceCounts.greenhouse);
      continue;
    }
```

### YC path

Reference: `src/commands/scan.ts:124-173`, `src/ingest/yc.ts:72-93`, `src/ingest/normalize.ts:165-200`, `src/ingest/normalize.ts:23-43`

```text
src/commands/scan.ts:246
→ src/commands/scan.ts:124-173 (collectYcOpportunities)
→ src/ingest/yc.ts:72-93 (fetchYcCompanies)
→ src/ingest/yc.ts:89-90 (ycCompanySchema.safeParse)
→ src/commands/scan.ts:141-144 (ycRoleSchema.safeParse for roles/jobs/openings)
→ src/ingest/normalize.ts:165-200 (normalizeRoleOpportunity) OR
→ src/ingest/normalize.ts:23-43 (normalizeCompanyFallback)
```

```ts
export async function fetchYcCompanies(cwd = process.cwd()): Promise<FetchCompaniesResult> {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`YC API responded with HTTP ${response.status} (${response.statusText})`);
  }

  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) {
    throw new Error(`Expected an array from ${API_URL}, got ${typeof raw}`);
  }

  ...

  const companies: YcCompany[] = [];
  for (const item of raw) {
    const result = ycCompanySchema.safeParse(item);
    if (result.success) companies.push(result.data);
  }

  return { rawCount: raw.length, companies };
}
```

### Greenhouse path

Reference: `src/commands/scan.ts:263-292`, `src/ingest/greenhouse.ts:117-187`, `src/commands/scan.ts:176-199`

```text
src/commands/scan.ts:264-279
→ src/ingest/greenhouse.ts:117-187 (fetchGreenhouseJobs)
→ src/ingest/greenhouse.ts:166-180 (greenhouseListResponseSchema.safeParse / greenhouseJobSchema.safeParse)
→ src/ingest/greenhouse.ts:80-99 (normalizeGreenhouseJob)
→ src/commands/scan.ts:176-199 (collectExternalOpportunities)
→ src/commands/scan.ts:82-109 (buildExternalCompany)
```

### Lever path

Reference: `src/commands/scan.ts:295-324`, `src/ingest/lever.ts:113-187`, `src/commands/scan.ts:176-199`

```text
src/commands/scan.ts:296-311
→ src/ingest/lever.ts:113-187 (fetchLeverJobs)
→ src/ingest/lever.ts:167-180 (Array check / leverPostingSchema.safeParse)
→ src/ingest/lever.ts:89-108 (normalizeLeverPosting)
→ src/commands/scan.ts:176-199 (collectExternalOpportunities)
→ src/commands/scan.ts:82-109 (buildExternalCompany)
```

### Career pages path

Reference: `src/commands/scan.ts:327-347`, `src/ingest/careers.ts:425-437`, `src/ingest/careers.ts:350-423`, `src/commands/scan.ts:176-199`

```text
src/commands/scan.ts:327-329
→ src/ingest/careers.ts:425-437 (scrapeAllCareerPages)
→ src/ingest/careers.ts:433 (scrapeCareerPage per company)
→ src/ingest/careers.ts:386-395 (JSON-LD path) OR
→ src/ingest/careers.ts:398-406 (iframe redirect detection) OR
→ src/ingest/careers.ts:408-418 (link pattern path + hydrateLinkRoles)
→ src/ingest/careers.ts:327-346 (normalizeCareerRole)
→ src/commands/scan.ts:176-199 (collectExternalOpportunities)
```

### Scoring and DB writes

Reference: `src/commands/scan.ts:366-456`, `src/score/scorer.ts:329-358`, `src/ingest/normalize.ts:203-250`, `src/db/repositories.ts:103-121`, `src/db/repositories.ts:208-291`, `src/db/repositories.ts:67-80`

```ts
const combined = uniqueByExternalKey(
  activeSources.flatMap((provider) => groupedOpportunities[provider]),
);
const existingKeys = getExistingJobExternalKeys(
  db,
  combined.map((item) => item.opportunity.externalKey),
);

const scoredItems: ScoredProviderOpportunity[] = combined.map((item) => ({
  item,
  scoring: scoreOpportunity(item.company, item.opportunity, profile),
  isNew: !existingKeys.has(item.opportunity.externalKey),
}));

const transaction = db.transaction((items: ScoredProviderOpportunity[]) => {
  for (const { item, scoring } of items) {
    const sourceId = upsertJobSource(db, {
      provider: item.provider,
      externalId: item.sourceExternalId,
      url: item.sourceUrl,
    });

    upsertJob(db, toJobUpsertInput(item.company, item.opportunity, sourceId, scanIds[item.provider] ?? 0, scoring));
  }
});

transaction(scoredItems);
```

```ts
export function scoreOpportunity(
  company: YcCompany,
  opportunity: NormalizedOpportunity,
  profile?: Profile,
): OpportunityScore {
  const breakdown = buildBreakdown(company, opportunity, profile);
  const prospectListed = Boolean(breakdown.prospect_listed);

  const reasons = [
    `role_fit:${breakdown.roleFit}`,
    `stack_fit:${breakdown.stackFit}`,
    `seniority_fit:${breakdown.seniorityFit}`,
    `freshness:${breakdown.freshness}`,
    `company_signal:${breakdown.companySignal}`,
    ...(prospectListed ? ["Prospect-curated top startup"] : []),
  ];

  const score =
    breakdown.roleFit +
    breakdown.stackFit +
    breakdown.seniorityFit +
    breakdown.freshness +
    breakdown.companySignal;
  return {
    score: clamp(score, 100),
    reasons,
    breakdown,
    explanationBullets: buildExplanationBullets(breakdown, opportunity, company, profile),
    riskBullets: buildRiskBullets(breakdown, opportunity, company),
  };
}
```

```ts
export function toJobUpsertInput(
  company: YcCompany,
  opportunity: NormalizedOpportunity,
  sourceId: number,
  scanId: number,
  scoring: {
    score: number;
    reasons: string[];
    breakdown: JobUpsertInput["scoreBreakdown"];
    explanationBullets: string[];
    riskBullets: string[];
  },
): JobUpsertInput {
  return {
    sourceId,
    scanId,
    externalKey: opportunity.externalKey,
    roleExternalId: opportunity.roleExternalId ?? null,
    roleSource: opportunity.roleSource,
    companyName: company.name,
    title: opportunity.title ?? null,
    summary: opportunity.summary,
    website: company.website,
    locations: opportunity.locations,
    remoteFlag: opportunity.remoteFlag,
    jobUrl: opportunity.jobUrl,
    postedAt: opportunity.postedAt ?? null,
    regions: company.regions,
    tags: company.tags,
    industries: company.industries,
    stage: company.stage,
    batch: company.batch,
    teamSize: company.team_size,
    seniorityHint: opportunity.seniorityHint ?? null,
    compensationMin: opportunity.compensationMin ?? null,
    compensationMax: opportunity.compensationMax ?? null,
    compensationCurrency: opportunity.compensationCurrency ?? null,
    compensationPeriod: opportunity.compensationPeriod ?? null,
    extractedSkills: opportunity.extractedSkills,
    topCompany: company.top_company,
    isHiring: company.isHiring,
    score: scoring.score,
    scoreReasons: scoring.reasons,
    scoreBreakdown: scoring.breakdown,
    explanationBullets: scoring.explanationBullets,
    riskBullets: scoring.riskBullets,
    status: "new",
  };
}
```

```ts
export function upsertJob(
  db: Database.Database,
  input: JobUpsertInput,
): number {
  db.prepare(
     `INSERT INTO jobs (
       source_id, scan_id, external_key, role_external_id, role_source, company_name, title, summary, website, locations,
       remote_flag, job_url, posted_at, regions_json, tags_json, industries_json, stage, batch, team_size,
       seniority_hint, compensation_min, compensation_max, compensation_currency, compensation_period, extracted_skills_json,
       top_company, is_hiring, score, score_reasons_json, score_breakdown_json, explanation_bullets_json, risk_bullets_json, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(external_key) DO UPDATE SET
       ...
  ).run(
    input.sourceId,
    input.scanId,
    input.externalKey,
    ...
  );
```

## 2. `npm run briefing`

### Entry and command registration

Reference: `package.json:24`, `src/cli.ts:43`, `src/commands/briefing.ts:437-496`

```json
{
  "briefing": "ts-node src/cli.ts briefing"
}
```

```ts
export function registerBriefingCommand(): Command {
  return new Command("briefing")
    .description("Send today's job hunt briefing as a styled HTML email via Gmail")
    .option("--no-scan", "Skip scanning sources before generating briefing")
    .option("--date <date>", "Override the briefing date (YYYY-MM-DD)")
    .option("--include-fallback", "include company-level fallback records in briefing new roles")
    .action(async (opts: { scan?: boolean; date?: string; includeFallback?: boolean }) => {
      if (opts.scan !== false) {
        console.log("[briefing] Scanning all sources...");
        try {
          const { runScanCommand } = await import("./scan");
          const scanResult = await runScanCommand();
          console.log(
            `[briefing] Scan done. Upserted ${scanResult.upserted} roles (${scanResult.newCount} new).`,
          );
        } catch (err) {
          console.warn(
            `[briefing] Scan failed, continuing with existing data: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      const db = initDb();
      const data = assembleBriefingData(db, opts.date, { includeFallback: opts.includeFallback });

      ...

      try {
        const messageId = await sendBriefingHtmlEmail(data);
        console.log(`\n[briefing] Email sent (message ID: ${messageId})`);
      } catch (err) {
        ...
      }
    });
}
```

### Main call chain

```text
package.json:24
→ src/cli.ts:43
→ src/commands/briefing.ts:437-496
→ src/commands/briefing.ts:447-448 (optional dynamic import("./scan") + runScanCommand())
→ src/db/index.ts:26-29 (initDb)
→ src/commands/briefing.ts:358-425 (assembleBriefingData)
→ src/commands/briefing.ts:235-306 (assembleApplyNow)
→ src/db/repositories.ts:733-990 (listNextActions) OR src/db/repositories.ts:293-347 (listJobs fallback)
→ src/commands/briefing.ts:90-195 (assembleNewRoles)
→ src/commands/briefing.ts:197-233 (assembleFollowups)
→ src/commands/briefing.ts:308-319 (assembleDrafts)
→ src/commands/briefing.ts:321-345 (assembleWeeklyFunnel on Mondays only)
→ src/integrations/gmail.ts:126-130 (sendBriefingHtmlEmail)
→ src/integrations/gmail.ts:100-114 (resolveBriefingEmailRecipient)
→ src/integrations/gmail.ts:116-124 (buildBriefingEmailSubject)
→ src/templates/briefing-email.ts:224-350 (renderBriefingEmail)
→ src/integrations/gmail.ts:69-98 (sendGmailMessage)
```

### Briefing data assembly

Reference: `src/commands/briefing.ts:358-425`

```ts
export function assembleBriefingData(
  db: Database.Database,
  dateOverride?: string,
  opts: { includeFallback?: boolean; minScore?: number } = {},
): BriefingData {
  const date = dateOverride ?? todayISO();
  const roleWindowDate = dateOverride;
  const prospectCompanies = loadProspectCompanies();
  const prospectNames = new Set(prospectCompanies.map((c) => c.name.toLowerCase()));

  let profile: Profile | null = null;
  try {
    profile = loadProfile() ?? null;
  } catch {
    console.warn("[briefing] Failed to load profile.json; stackMatch metrics will default to 0");
  }

  ...

  const sourcesScanned = countLatestScannedSources(db);

  const applyNow = assembleApplyNow(db);

  return {
    date,
    applyNow,
    newRoles: assembleNewRoles(db, prospectNames, roleWindowDate, { ...opts, profile }),
    followups: assembleFollowups(db),
    drafts: assembleDrafts(db),
    funnel: isMonday(date) ? assembleWeeklyFunnel(db) : null,
    appliedCount,
    workflowCounts: {
      saved: workflowCounts.saved ?? 0,
      drafted: workflowCounts.drafted ?? 0,
      applied: workflowCounts.applied ?? 0,
      interview: workflowCounts.interview ?? 0,
    },
    totalTracked,
    sourcesScanned,
  };
}
```

### Gmail send path

Reference: `src/integrations/gmail.ts:100-130`, `src/integrations/gmail.ts:69-98`, `src/templates/briefing-email.ts:224-350`

```ts
export async function sendBriefingHtmlEmail(data: BriefingData): Promise<string> {
  const to = await resolveBriefingEmailRecipient();
  const subject = buildBriefingEmailSubject(data);
  const html = renderBriefingEmail(data);
  return sendGmailMessage(to, subject, html);
}
```

```ts
export async function sendGmailMessage(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<string> {
  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const message = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ].join("\r\n");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeBase64Url(message),
    },
  });
```

## 3. `npm run apply`

### Entry and command registration

Reference: `package.json:21`, `src/cli.ts:40`, `src/commands/apply.ts:58-105`

```json
{
  "apply": "ts-node src/cli.ts apply"
}
```

```ts
export function registerApplyCommand(): Command {
  return new Command("apply")
    .description("Mark a job as applied and schedule a follow-up")
    .argument("<company>", "company name to search")
    .option("--followup-days <days>", "days until follow-up", "7")
    .option("--status <status>", "saved, shortlisted, drafted, applied, followup_due, replied, interview, rejected, archived")
    ...
    .action(async (query: string, opts: { ... }) => {
      const days = parseInt(opts.followupDays ?? "7", 10);
      const result = await runApplyCommand(query, Number.isFinite(days) ? days : 7, {
        ...
      });
      console.log(
        result.dueAt
          ? `Updated ${result.companyName}. Follow-up due ${result.dueAt}`
          : `Updated ${result.companyName}.`,
      );
    });
}
```

### Main call chain

```text
package.json:21
→ src/cli.ts:40
→ src/commands/apply.ts:58-105
→ src/commands/apply.ts:87 (runApplyCommand)
→ src/db/index.ts:26-29 (initDb)
→ src/db/repositories.ts:349-388 (getJobByQuery)
→ src/db/repositories.ts:1027-1095 (upsertApplication)
→ src/db/repositories.ts:992-1016 (createApplicationEvent)
→ src/db/repositories.ts:1091-1092 (UPDATE jobs.status)
→ src/commands/apply.ts:50-53 (optional createFollowup)
→ src/db/repositories.ts:1097-1115 (createFollowup)
→ src/db/repositories.ts:1111-1112 (createApplicationEvent followup_created)
```

### Exact code

Reference: `src/commands/apply.ts:12-56`

```ts
export async function runApplyCommand(
  query: string,
  followupDays: number,
  opts: {
    notes?: string;
    status?: ApplicationStatus;
    appliedUrl?: string;
    resumeVersion?: string;
    outreachDraftVersion?: string;
    responseReceived?: boolean;
    responseType?: ResponseType;
    interviewStage?: InterviewStage;
    rejectionReason?: string;
    lastContactedAt?: string | null;
  } = {},
): Promise<{ companyName: string; dueAt: string | null }> {
  const db = initDb();
  const job = getJobByQuery(db, query);
  if (!job) {
    throw new Error(`No job matching "${query}" found in SQLite. Run scan first.`);
  }

  const appliedAt = new Date().toISOString();
  const status = opts.status ?? "applied";
  const applicationId = upsertApplication(db, job.id, {
    status,
    appliedAt: status === "applied" ? appliedAt : null,
    note: opts.notes,
    appliedUrl: opts.appliedUrl,
    resumeVersion: opts.resumeVersion,
    outreachDraftVersion: opts.outreachDraftVersion,
    responseReceived: opts.responseReceived,
    responseType: opts.responseType,
    interviewStage: opts.interviewStage,
    rejectionReason: opts.rejectionReason,
    lastContactedAt: opts.lastContactedAt ?? (status === "applied" ? appliedAt : null),
  });
  let dueAt: string | null = null;
  if (status === "applied" || status === "followup_due") {
    dueAt = addDaysIso(followupDays);
    createFollowup(db, job.id, applicationId, dueAt, `Follow up with ${job.company_name}`);
  }

  return { companyName: job.title ? `${job.company_name} - ${job.title}` : job.company_name, dueAt };
}
```

## 4. Exact `NormalizedOpportunity` shape

Reference: `src/ingest/normalize.ts:5-21`

```ts
export interface NormalizedOpportunity {
  externalKey: string;
  roleExternalId?: string | null;
  roleSource: string;
  title?: string | null;
  summary: string;
  locations: string;
  remoteFlag: boolean;
  jobUrl: string;
  postedAt?: string | null;
  seniorityHint?: string | null;
  compensationMin?: number | null;
  compensationMax?: number | null;
  compensationCurrency?: string | null;
  compensationPeriod?: string | null;
  extractedSkills: string[];
}
```

### One normalized Greenhouse job

Input fixture reference: `tests/greenhouse.test.ts:16-23`  
Normalizer reference: `src/ingest/greenhouse.ts:80-99`  
Expected values reference: `tests/greenhouse.test.ts:95-112`

```ts
const SAMPLE_JOBS = {
  seniorBackend: {
    id: 10001,
    title: "Senior Backend Engineer",
    absolute_url: "https://boards.greenhouse.io/testcorp/jobs/10001",
    location: { name: "San Francisco, CA" },
    content: "<p>Date Posted: March 12, 2026. Build <strong>distributed systems</strong> using <em>Kubernetes</em> and Golang.</p>",
    departments: [{ name: "Engineering" }, { name: "Backend" }],
  },
};
```

```ts
function normalizeGreenhouseJob(
  company: GreenhouseCompany,
  job: GreenhouseJob,
): NormalizedOpportunity {
  const plainContent = stripHtml(job.content);
  const rawJob = job as unknown as Record<string, unknown>;

  return {
    externalKey: `greenhouse:${company.slug}:${job.id}`,
    roleExternalId: String(job.id),
    roleSource: "greenhouse",
    title: job.title,
    summary: plainContent,
    locations: job.location.name,
    remoteFlag: inferRemote(job.location.name),
    jobUrl: job.absolute_url,
    postedAt: extractPostedAt(rawJob, plainContent),
    seniorityHint: inferSeniority(job.title),
    extractedSkills: extractSkills(job.title, plainContent),
  };
}
```

```ts
expect(job.title).toBe("Senior Backend Engineer");
expect(job.roleSource).toBe("greenhouse");
expect(job.roleExternalId).toBe("10001");
expect(job.jobUrl).toBe("https://boards.greenhouse.io/testcorp/jobs/10001");
expect(job.locations).toBe("San Francisco, CA");
expect(job.remoteFlag).toBe(false);
expect(job.seniorityHint).toBe("Senior");
expect(job.postedAt).toBe("2026-03-12T00:00:00.000Z");
expect(job.extractedSkills).toEqual(expect.arrayContaining(["kubernetes"]));
expect(job.extractedSkills).toEqual(expect.arrayContaining(["golang"]));
```

Derived normalized object from those exact lines:

```ts
{
  externalKey: "greenhouse:testcorp:10001",
  roleExternalId: "10001",
  roleSource: "greenhouse",
  title: "Senior Backend Engineer",
  summary: "Date Posted: March 12, 2026. Build distributed systems using Kubernetes and Golang.",
  locations: "San Francisco, CA",
  remoteFlag: false,
  jobUrl: "https://boards.greenhouse.io/testcorp/jobs/10001",
  postedAt: "2026-03-12T00:00:00.000Z",
  seniorityHint: "Senior",
  extractedSkills: ["kubernetes", "golang", ...]
}
```

## 5. Exact scoring output shape for one job

Reference: `src/score/scorer.ts:273-279`, `src/db/types.ts:118-152`, `src/ingest/normalize.ts:203-250`

```ts
export interface OpportunityScore {
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
  explanationBullets: string[];
  riskBullets: string[];
}
```

```ts
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
```

### Real persisted example already in the DB

Query used:

```sql
SELECT * FROM jobs ORDER BY score DESC, updated_at DESC LIMIT 3;
```

First real role row from that output:

```text
id     source_id  scan_id  external_key                   role_external_id  role_source  company_name  title                                               summary  website                                                   locations                        remote_flag  job_url                                                   regions_json  tags_json                  industries_json  stage     batch     team_size  seniority_hint  compensation_min  compensation_max  compensation_currency  compensation_period  extracted_skills_json         top_company  is_hiring  score  score_reasons_json                                                                                                score_breakdown_json                                                                                     explanation_bullets_json                                                                                                                              risk_bullets_json                                    status  created_at           updated_at           posted_at
17434  17381      15       greenhouse:scaleai:4665557005  4665557005        greenhouse   Scale AI      Infrastructure Software Engineer, Enterprise GenAI            https://job-boards.greenhouse.io/scaleai/jobs/4665557005  San Francisco, CA; New York, NY  0            https://job-boards.greenhouse.io/scaleai/jobs/4665557005  []           ["Infrastructure","AI"]  []               External  External             ... ["Infrastructure","AI"] ... 0            1          53     ["role_fit:24","stack_fit:0","seniority_fit:7","freshness:3","company_signal:19","Prospect-curated top startup"]  {"roleFit":24,"stackFit":0,"seniorityFit":7,"freshness":3,"companySignal":19,"prospect_listed":true}     ["Strong role fit for Infrastructure Software Engineer, Enterprise GenAI","Prospect-curated top startup","Matches one of your target role families"]  ["Not clearly remote","Compensation not disclosed"]  new     2026-03-26 22:07:18  2026-03-26 23:43:39  2026-02-24T00:15:38.000Z
```

## 6. Dependency graph

Generated from local import walk across `src/**/*.ts` and `config/**/*.ts`.

```text
src/cli.ts
├─ src/commands/scan.ts
│  ├─ config/career-pages.ts
│  ├─ config/greenhouse-companies.ts
│  ├─ config/lever-companies.ts
│  ├─ src/config/profile.ts
│  ├─ src/db/index.ts
│  ├─ src/ingest/careers.ts
│  ├─ src/ingest/greenhouse.ts
│  ├─ src/ingest/lever.ts
│  ├─ src/ingest/normalize.ts
│  ├─ src/ingest/yc.ts
│  └─ src/score/scorer.ts
├─ src/commands/briefing.ts
│  ├─ src/briefing/types.ts
│  ├─ src/config/profile.ts
│  ├─ src/db/index.ts
│  ├─ src/db/repositories.ts
│  ├─ src/ingest/prospect.ts
│  └─ src/integrations/gmail.ts
├─ src/commands/apply.ts
│  ├─ src/db/index.ts
│  ├─ src/db/repositories.ts
│  └─ src/db/types.ts
├─ src/commands/draft.ts
│  ├─ config/scoring.ts
│  ├─ src/config/profile.ts
│  ├─ src/db/index.ts
│  ├─ src/db/repositories.ts
│  ├─ src/db/types.ts
│  └─ src/integrations/gmail.ts
├─ src/commands/notify.ts
│  ├─ src/commands/briefing.ts
│  ├─ src/db/index.ts
│  └─ src/integrations/gmail.ts
├─ src/commands/browse.ts
│  ├─ src/db/index.ts
│  ├─ src/db/repositories.ts
│  ├─ src/db/types.ts
│  └─ src/filter/jobs.ts
├─ src/commands/review.ts
│  ├─ src/db/index.ts
│  ├─ src/db/repositories.ts
│  ├─ src/db/types.ts
│  └─ src/filter/jobs.ts
├─ src/commands/today.ts
│  ├─ src/config/profile.ts
│  ├─ src/db/index.ts
│  ├─ src/db/repositories.ts
│  └─ src/db/types.ts
├─ src/commands/profile.ts
│  ├─ src/config/profile.ts
│  └─ src/config/types.ts
├─ src/commands/prospect-refresh.ts
│  └─ src/ingest/prospect.ts
├─ src/commands/scan-careers.ts
│  ├─ config/career-pages.ts
│  └─ src/ingest/careers.ts
├─ src/commands/import.ts
│  ├─ src/config/profile.ts
│  ├─ src/db/index.ts
│  ├─ src/db/repositories.ts
│  ├─ src/ingest/normalize.ts
│  ├─ src/ingest/yc.ts
│  └─ src/score/scorer.ts
├─ src/commands/auto-draft.ts
│  ├─ src/commands/draft.ts
│  ├─ src/db/index.ts
│  └─ src/db/repositories.ts
└─ src/commands/baseline-bootstrap.ts
   └─ src/db/index.ts

src/db/index.ts
└─ src/db/schema.ts

src/integrations/gmail.ts
├─ src/briefing/types.ts
└─ src/templates/briefing-email.ts

src/score/scorer.ts
├─ src/config/types.ts
├─ src/db/types.ts
├─ src/ingest/normalize.ts
├─ src/ingest/prospect.ts
└─ src/ingest/yc.ts
```

Cycle detection output from the local import-walk run:

```text
CYCLES
```

No circular dependencies were emitted after `CYCLES`.
