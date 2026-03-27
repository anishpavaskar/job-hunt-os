# PROMPT B: SOURCE-BY-SOURCE DEEP DIVE

## YC

### 1. Code paths

- `src/ingest/yc.ts`
- `src/ingest/normalize.ts`
- `src/commands/scan.ts`

### 2. Fetched URL

Reference: `src/ingest/yc.ts:65-73`

```ts
const API_URL = "https://yc-oss.github.io/api/companies/hiring.json";

export async function fetchYcCompanies(cwd = process.cwd()): Promise<FetchCompaniesResult> {
  const response = await fetch(API_URL);
```

### 3. Raw response sample

Sample from the real cached file `data/yc_hiring_raw.json`:

```json
{
  "id": 5,
  "name": "CircuitHub",
  "slug": "circuithub",
  "small_logo_thumb_url": "https://bookface-images.s3.amazonaws.com/small_logos/5967d06c7b101af8570dc47b6eea5cd8567dd32b.png",
  "website": "https://circuithub.com",
  "all_locations": "London, England, United Kingdom",
  "long_description": "CircuitHub offers on-demand electronics manufacturing powered by our factory-scale robotics platform, The Grid.",
  "one_liner": "On-Demand Electronics Manufacturing",
  "team_size": 58,
  "industry": "Industrials",
  "subindustry": "Industrials -> Manufacturing and Robotics",
  "tags": ["Hard Tech", "Hardware", "Robotics", "Manufacturing", "Automation"],
  "top_company": false,
  "isHiring": true,
  "batch": "Winter 2012",
  "status": "Active",
  "industries": ["Industrials", "Manufacturing and Robotics"],
  "regions": ["United Kingdom", "Europe", "Remote", "Partly Remote"],
  "stage": "Early",
  "url": "https://www.ycombinator.com/companies/circuithub"
}
```

### 4. Raw → `NormalizedOpportunity`

#### Company fallback mapping

Reference: `src/ingest/normalize.ts:23-43`

```ts
export function normalizeCompanyFallback(
  company: YcCompany,
): NormalizedOpportunity {
  return {
    externalKey: `company:${company.slug}`,
    roleExternalId: null,
    roleSource: "company_fallback",
    title: null,
    summary: company.one_liner || company.long_description || "",
    locations: company.all_locations,
    remoteFlag: company.regions.some((region) => /remote/i.test(region)),
    jobUrl: company.url,
    postedAt: null,
    extractedSkills: extractSkills(
      company.one_liner,
      company.long_description,
      company.tags.join(" "),
      company.industries.join(" "),
    ),
  };
}
```

| Raw field | Normalized field |
| --- | --- |
| `company.slug` | `externalKey = company:${slug}` |
| none | `roleExternalId = null` |
| constant | `roleSource = "company_fallback"` |
| none | `title = null` |
| `company.one_liner || company.long_description || ""` | `summary` |
| `company.all_locations` | `locations` |
| `company.regions.some(/remote/i)` | `remoteFlag` |
| `company.url` | `jobUrl` |
| constant | `postedAt = null` |
| `company.one_liner`, `company.long_description`, `company.tags`, `company.industries` | `extractedSkills` |

#### YC role mapping when a role exists

Reference: `src/ingest/normalize.ts:165-200`

```ts
export function normalizeRoleOpportunity(
  company: YcCompany,
  role: YcRole,
  index: number,
): NormalizedOpportunity {
  const rawRole = role as unknown as Record<string, unknown>;
  const roleId = role.id != null ? String(role.id) : null;
  const title = firstDefinedString(role.title) ?? `Role ${index + 1}`;
  const jobUrl = firstDefinedString(role.apply_url, role.job_url, role.url, company.url) ?? company.url;
  const remoteFlag = Boolean(role.remote ?? role.remote_ok ?? role.remote_allowed)
    || /remote/i.test(normalizeLocation(role.locations, role.location ?? company.all_locations));

  return {
    externalKey: `role:${company.slug}:${roleId ?? `${title}:${jobUrl}`}`,
    roleExternalId: roleId,
    roleSource: "role",
    title,
    summary: firstDefinedString(role.description, company.one_liner, company.long_description) ?? "",
    locations: normalizeLocation(role.locations, role.location ?? company.all_locations),
    remoteFlag,
    jobUrl,
    postedAt: extractPostedAt(rawRole, role.description, company.one_liner, company.long_description),
    seniorityHint: firstDefinedString(role.seniority_hint, role.seniority, role.level, role.experience),
    compensationMin: firstDefinedNumber(role.compensation_min, role.salary_min, role.min_salary),
    compensationMax: firstDefinedNumber(role.compensation_max, role.salary_max, role.max_salary),
    compensationCurrency: firstDefinedString(role.compensation_currency),
    compensationPeriod: firstDefinedString(role.compensation_period),
    extractedSkills: extractSkills(
      title,
      role.description,
      company.one_liner,
      company.long_description,
      company.tags.join(" "),
      company.industries.join(" "),
    ),
  };
}
```

### 5. Validation

Reference: `src/ingest/yc.ts:5-31`, `src/ingest/yc.ts:35-61`

```ts
export const ycCompanySchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    small_logo_thumb_url: z.string(),
    website: z.string(),
    all_locations: z.string().default(""),
    long_description: z.string().default(""),
    one_liner: z.string().default(""),
    team_size: z.number().optional(),
    industry: z.string(),
    subindustry: z.string(),
    tags: z.array(z.string()).default([]),
    top_company: z.boolean(),
    isHiring: z.boolean(),
    batch: z.string(),
    status: z.string(),
    industries: z.array(z.string()).default([]),
    regions: z.array(z.string()).default([]),
    stage: z.string(),
    url: z.string(),
    api: z.string().optional(),
    roles: z.array(z.unknown()).optional(),
    jobs: z.array(z.unknown()).optional(),
    openings: z.array(z.unknown()).optional(),
  })
  .passthrough();
```

```ts
export const ycRoleSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    locations: z.union([z.string(), z.array(z.string())]).optional(),
    remote: z.boolean().optional(),
    remote_ok: z.boolean().optional(),
    remote_allowed: z.boolean().optional(),
    url: z.string().optional(),
    job_url: z.string().optional(),
    apply_url: z.string().optional(),
    salary_min: z.number().optional(),
    salary_max: z.number().optional(),
    min_salary: z.number().optional(),
    max_salary: z.number().optional(),
    compensation_min: z.number().optional(),
    compensation_max: z.number().optional(),
    compensation_currency: z.string().optional(),
    compensation_period: z.string().optional(),
    seniority: z.string().optional(),
    seniority_hint: z.string().optional(),
    level: z.string().optional(),
    experience: z.string().optional(),
  })
  .passthrough();
```

### 6. Fetch failure behavior

Reference: `src/ingest/yc.ts:72-80`, `src/commands/scan.ts:348-363`

```ts
const response = await fetch(API_URL);
if (!response.ok) {
  throw new Error(`YC API responded with HTTP ${response.status} (${response.statusText})`);
}

const raw: unknown = await response.json();
if (!Array.isArray(raw)) {
  throw new Error(`Expected an array from ${API_URL}, got ${typeof raw}`);
}
```

```ts
    } catch (error) {
      const warning = `[scan] ${provider} failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(warning);
      sourceCounts[provider] = {
        rawCount: 0,
        validCount: 0,
        totalRoles: 0,
        deduped: 0,
        upserted: 0,
        newCount: 0,
        scored80Plus: 0,
        roleCount: 0,
        failed: true,
      };
      completeScan(db, scanId, 0, 0, new Date().toISOString(), sourceCounts[provider]);
    }
```

### 7. Single invalid job behavior

Reference: `src/commands/scan.ts:136-145`

```ts
const candidateRoles = [
  ...(Array.isArray(company.roles) ? company.roles : []),
  ...(Array.isArray(company.jobs) ? company.jobs : []),
  ...(Array.isArray(company.openings) ? company.openings : []),
]
  .map((role) => ycRoleSchema.safeParse(role))
  .filter((result) => result.success)
  .map((result) => result.data)
  .filter((role) => role.title || role.description || role.url || role.job_url || role.apply_url);
```

Invalid roles are filtered out before normalization; the company still continues through scan.

### 8. Wired into `npm run scan`?

Yes. Reference: `src/commands/scan.ts:245-260`

### 9. Configured companies count

No static company list. `YC` fetches the public dataset URL at runtime.

### 10. Tests

No dedicated `tests/yc.test.ts` file exists. Current coverage is indirect:

- `tests/scan.test.ts:26-138` feeds mocked YC company payloads into `runScanCommand`.
- `tests/pipeline.integration.test.ts` exercises the full multi-source pipeline with YC included.

---

## Greenhouse

### 1. Code paths

- `src/ingest/greenhouse.ts`
- `config/greenhouse-companies.ts`
- `src/commands/scan.ts`

### 2. Fetched URL

Reference: `src/ingest/greenhouse.ts:33`, `src/ingest/greenhouse.ts:141`

```ts
const BOARDS_API = "https://boards-api.greenhouse.io/v1/boards";
...
const url = `${BOARDS_API}/${company.slug}/jobs`;
```

### 3. Raw response sample

Reference: `tests/greenhouse.test.ts:16-23`, `tests/greenhouse.test.ts:65-72`

```json
{
  "jobs": [
    {
      "id": 10001,
      "title": "Senior Backend Engineer",
      "absolute_url": "https://boards.greenhouse.io/testcorp/jobs/10001",
      "location": { "name": "San Francisco, CA" },
      "content": "<p>Date Posted: March 12, 2026. Build <strong>distributed systems</strong> using <em>Kubernetes</em> and Golang.</p>",
      "departments": [{ "name": "Engineering" }, { "name": "Backend" }]
    }
  ]
}
```

### 4. Raw → `NormalizedOpportunity`

Reference: `src/ingest/greenhouse.ts:80-99`

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

| Raw field | Normalized field |
| --- | --- |
| `company.slug` + `job.id` | `externalKey = greenhouse:${slug}:${id}` |
| `job.id` | `roleExternalId = String(job.id)` |
| constant | `roleSource = "greenhouse"` |
| `job.title` | `title` |
| `stripHtml(job.content)` | `summary` |
| `job.location.name` | `locations` |
| `inferRemote(job.location.name)` | `remoteFlag` |
| `job.absolute_url` | `jobUrl` |
| `extractPostedAt(rawJob, plainContent)` | `postedAt` |
| `inferSeniority(job.title)` | `seniorityHint` |
| `extractSkills(job.title, plainContent)` | `extractedSkills` |

### 5. Validation

Reference: `src/ingest/greenhouse.ts:8-27`

```ts
const greenhouseDepartmentSchema = z.object({
  name: z.string(),
}).passthrough();

const greenhouseLocationSchema = z.object({
  name: z.string(),
}).passthrough();

const greenhouseJobSchema = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  location: greenhouseLocationSchema,
  content: z.string().default(""),
  departments: z.array(greenhouseDepartmentSchema).default([]),
}).passthrough();

const greenhouseListResponseSchema = z.object({
  jobs: z.array(z.unknown()),
});
```

### 6. Fetch failure behavior

Reference: `src/ingest/greenhouse.ts:142-170`

```ts
try {
  response = await fetchFn(url);
} catch (err) {
  console.warn(`[greenhouse] Failed to fetch ${company.name} (${url}): ${err}`);
  reportAudit("network_error", 0);
  continue;
}

if (!response.ok) {
  console.warn(`[greenhouse] HTTP ${response.status} for ${company.name} (${url})`);
  reportAudit(`HTTP ${response.status}`, 0);
  continue;
}

let payload: unknown;
try {
  payload = await response.json();
} catch {
  console.warn(`[greenhouse] Invalid JSON from ${company.name}`);
  reportAudit(`HTTP ${response.status} invalid_json`, 0);
  continue;
}

const listResult = greenhouseListResponseSchema.safeParse(payload);
if (!listResult.success) {
  console.warn(`[greenhouse] Unexpected response shape for ${company.name}`);
  reportAudit(`HTTP ${response.status} invalid_shape`, 0);
  continue;
}
```

### 7. Single invalid job behavior

Reference: `src/ingest/greenhouse.ts:173-181`

```ts
for (const rawJob of listResult.data.jobs) {
  const jobResult = greenhouseJobSchema.safeParse(rawJob);
  if (!jobResult.success) {
    console.warn(`[greenhouse] Skipping invalid job from ${company.name}: ${jobResult.error.message}`);
    continue;
  }
  allJobs.push(normalizeGreenhouseJob(company, jobResult.data));
  jobsReturned += 1;
}
```

### 8. Wired into `npm run scan`?

Yes. Reference: `src/commands/scan.ts:263-292`

### 9. Configured companies count and list

Reference: `config/greenhouse-companies.ts:6-23`

Count: `16`

```ts
export const GREENHOUSE_COMPANIES: GreenhouseCompany[] = [
  { slug: "anthropic", name: "Anthropic" },
  { slug: "andurilindustries", name: "Anduril" },
  { slug: "asana", name: "Asana" },
  { slug: "brex", name: "Brex" },
  { slug: "cockroachlabs", name: "Cockroach Labs" },
  { slug: "cloudflare", name: "Cloudflare" },
  { slug: "coinbase", name: "Coinbase" },
  { slug: "databricks", name: "Databricks" },
  { slug: "datadog", name: "Datadog" },
  { slug: "figma", name: "Figma" },
  { slug: "nuro", name: "Nuro" },
  { slug: "roblox", name: "Roblox" },
  { slug: "samsara", name: "Samsara" },
  { slug: "scaleai", name: "Scale AI" },
  { slug: "stripe", name: "Stripe" },
  { slug: "vercel", name: "Vercel" },
];
```

### 10. Tests

Reference: `tests/greenhouse.test.ts:62-181`

Coverage in that file:

- multiple-company normalization
- role field normalization
- `postedAt` extraction from content text
- remote inference
- seniority inference
- skill extraction
- invalid-job skipping
- HTTP failure handling
- network failure handling

---

## Lever

### 1. Code paths

- `src/ingest/lever.ts`
- `config/lever-companies.ts`
- `src/commands/scan.ts`

### 2. Fetched URL

Reference: `src/ingest/lever.ts:33`, `src/ingest/lever.ts:142`

```ts
const LEVER_API = "https://api.lever.co/v0/postings";
...
const url = `${LEVER_API}/${company.slug}`;
```

### 3. Raw response sample

Reference: `tests/lever.test.ts:12-29`, `tests/lever.test.ts:83-90`

```json
[
  {
    "id": "abc-123-def",
    "text": "Senior Backend Engineer",
    "hostedUrl": "https://jobs.lever.co/testcorp/abc-123-def",
    "applyUrl": "https://jobs.lever.co/testcorp/abc-123-def/apply",
    "createdAt": "2026-03-08T00:00:00.000Z",
    "categories": {
      "team": "Engineering",
      "department": "Platform",
      "location": "San Francisco, CA",
      "commitment": "Full-time",
      "allLocations": ["San Francisco, CA"]
    },
    "descriptionPlain": "Build distributed systems using Kubernetes and Golang. Own backend microservices and CI/CD pipelines.",
    "lists": [
      { "text": "Requirements", "content": "<li>5+ years experience</li>" }
    ]
  }
]
```

### 4. Raw → `NormalizedOpportunity`

Reference: `src/ingest/lever.ts:89-108`

```ts
function normalizeLeverPosting(
  company: LeverCompany,
  posting: LeverPosting,
): NormalizedOpportunity {
  const cats = posting.categories;
  const rawPosting = posting as unknown as Record<string, unknown>;

  return {
    externalKey: `lever:${company.slug}:${posting.id}`,
    roleExternalId: posting.id,
    roleSource: "lever",
    title: posting.text,
    summary: posting.descriptionPlain,
    locations: buildLocation(cats.location, cats.allLocations),
    remoteFlag: inferRemote(cats.location, cats.allLocations, cats.commitment),
    jobUrl: posting.hostedUrl,
    postedAt: extractPostedAt(rawPosting, posting.descriptionPlain),
    seniorityHint: inferSeniority(posting.text, cats.commitment),
    extractedSkills: extractSkills(posting.text, posting.descriptionPlain),
  };
}
```

| Raw field | Normalized field |
| --- | --- |
| `company.slug` + `posting.id` | `externalKey = lever:${slug}:${id}` |
| `posting.id` | `roleExternalId` |
| constant | `roleSource = "lever"` |
| `posting.text` | `title` |
| `posting.descriptionPlain` | `summary` |
| `buildLocation(cats.location, cats.allLocations)` | `locations` |
| `inferRemote(cats.location, cats.allLocations, cats.commitment)` | `remoteFlag` |
| `posting.hostedUrl` | `jobUrl` |
| `extractPostedAt(rawPosting, posting.descriptionPlain)` | `postedAt` |
| `inferSeniority(posting.text, cats.commitment)` | `seniorityHint` |
| `extractSkills(posting.text, posting.descriptionPlain)` | `extractedSkills` |

### 5. Validation

Reference: `src/ingest/lever.ts:8-27`

```ts
const leverCategoriesSchema = z.object({
  team: z.string().optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  commitment: z.string().optional(),
  allLocations: z.array(z.string()).optional(),
}).passthrough();

const leverPostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string().optional(),
  categories: leverCategoriesSchema.default({}),
  descriptionPlain: z.string().default(""),
  lists: z.array(z.object({
    text: z.string(),
    content: z.string(),
  }).passthrough()).default([]),
}).passthrough();
```

### 6. Fetch failure behavior

Reference: `src/ingest/lever.ts:143-170`

```ts
try {
  response = await fetchFn(url);
} catch (err) {
  console.warn(`[lever] Failed to fetch ${company.name} (${url}): ${err}`);
  reportAudit("network_error", 0);
  continue;
}

if (!response.ok) {
  console.warn(`[lever] HTTP ${response.status} for ${company.name} (${url})`);
  reportAudit(`HTTP ${response.status}`, 0);
  continue;
}

let payload: unknown;
try {
  payload = await response.json();
} catch {
  console.warn(`[lever] Invalid JSON from ${company.name}`);
  reportAudit(`HTTP ${response.status} invalid_json`, 0);
  continue;
}

if (!Array.isArray(payload)) {
  console.warn(`[lever] Expected array from ${company.name}, got ${typeof payload}`);
  reportAudit(`HTTP ${response.status} invalid_shape`, 0);
  continue;
}
```

### 7. Single invalid job behavior

Reference: `src/ingest/lever.ts:173-181`

```ts
for (const rawPosting of payload) {
  const result = leverPostingSchema.safeParse(rawPosting);
  if (!result.success) {
    console.warn(`[lever] Skipping invalid posting from ${company.name}: ${result.error.message}`);
    continue;
  }
  allJobs.push(normalizeLeverPosting(company, result.data));
  jobsReturned += 1;
}
```

### 8. Wired into `npm run scan`?

Yes. Reference: `src/commands/scan.ts:295-324`

### 9. Configured companies count and list

Reference: `config/lever-companies.ts:6-8`

Count: `1`

```ts
export const LEVER_COMPANIES: LeverCompany[] = [
  { slug: "netflix", name: "Netflix" },
];
```

### 10. Tests

Reference: `tests/lever.test.ts:80-248`

Coverage in that file:

- multi-company normalization
- location building from `allLocations`
- remote inference
- seniority inference
- `postedAt` extraction from `createdAt`
- invalid posting skipping
- non-array response handling
- HTTP/network error handling

---

## Prospect

### 1. Code paths

- `src/ingest/prospect.ts`
- `data/prospect-companies.json`
- `src/score/scorer.ts`
- `src/commands/briefing.ts`
- `src/commands/prospect-refresh.ts`

### 2. Fetched URL

Reference: `src/ingest/prospect.ts:130`

```ts
const response = await fetch("https://www.joinprospect.com/explore");
```

### 3. Raw response sample

Reference: `tests/prospect.test.ts:56-64`

```html
<a href="/companies/abnormal-security">
  Abnormal Security Abnormal Security's AI-native platform protects inboxes. Industry Cybersecurity Learn more
</a>
<a href="/companies/anthropic">
  Anthropic Anthropic's AI models power enterprise workflows. Industry AI Learn more
</a>
```

### 4. Raw → `NormalizedOpportunity`

There is no `NormalizedOpportunity` mapping for Prospect in the current codebase.

Prospect is used as:

- a persisted company list in `data/prospect-companies.json`
- a fuzzy matcher in `src/ingest/prospect.ts:47-68`
- a scoring/briefing signal in:
  - `src/score/scorer.ts:225-238`
  - `src/commands/briefing.ts:138`, `src/commands/briefing.ts:365-366`

### 5. Validation

Reference: `src/ingest/prospect.ts:26-44`, `src/ingest/prospect.ts:95-118`

```ts
export function loadProspectCompanies(cwd = process.cwd()): ProspectCompany[] {
  const filePath = getProspectCompaniesPath(cwd);
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is ProspectCompany => {
      return Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as ProspectCompany).name === "string" &&
          typeof (item as ProspectCompany).industry === "string" &&
          typeof (item as ProspectCompany).prospect_url === "string",
      );
    });
  } catch {
    return [];
  }
}
```

```ts
export function parseProspectCompaniesFromHtml(html: string): ProspectCompany[] {
  const companies: ProspectCompany[] = [];
  const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  ...
  return dedupeCompanies(companies);
}
```

### 6. Fetch failure behavior

Reference: `src/ingest/prospect.ts:129-158`

```ts
try {
  const response = await fetch("https://www.joinprospect.com/explore");
  if (!response.ok) {
    return {
      updated: false,
      count: existing.length,
      warning: `Prospect responded with HTTP ${response.status}. Keeping existing prospect-companies.json.`,
    };
  }
  ...
} catch (error) {
  return {
    updated: false,
    count: existing.length,
    warning: `Failed to refresh Prospect companies: ${error instanceof Error ? error.message : String(error)}. Keeping existing prospect-companies.json.`,
  };
}
```

### 7. Single invalid job behavior

Not applicable. Prospect is not iterating job records.

### 8. Wired into `npm run scan`?

Not as a provider. It is wired into scoring and briefing, and it has a standalone refresh command.

Reference:

- scoring: `src/score/scorer.ts:225-238`
- briefing: `src/commands/briefing.ts:138`, `src/commands/briefing.ts:365-366`
- refresh command: `src/commands/prospect-refresh.ts:4-16`

### 9. Configured companies count and list

Count from `data/prospect-companies.json`: `42`

```text
Anthropic
Anduril
Abnormal Security
Abridge
Addepar
Airwallex
Figma
Scale AI
Ramp
Stripe
Vercel
Brex
Datadog
Notion
Cloudflare
Anysphere
Applied Intuition
Apollo.io
Anrok
Antithesis
11x
6sense
AI2 Incubator
AVAIO Digital
Acorns
Agree
Airbyte
Airtable
Alation
Alembic
Aleph
Algolia
Alkira
AlphaSense
Altruist
Ambience Healthcare
Ambient.ai
Ampere Computing
Arc Technologies
Aidoc
Andalusia Labs
AppZen
```

### 10. Tests

Reference: `tests/prospect.test.ts:13-128`

Coverage in that file:

- fuzzy company-name normalization/matching
- HTML parsing from `/explore`
- score boost and score reason effect

---

## Career pages

### 1. Code paths

- `src/ingest/careers.ts`
- `config/career-pages.ts`
- `src/commands/scan.ts`
- `src/commands/scan-careers.ts`

### 2. Fetched URL(s)

Reference: `src/ingest/careers.ts:350-360`, `config/career-pages.ts:9-10`

```ts
export const CAREER_PAGES: CareerPage[] = [
  { name: "Microsoft", slug: "microsoft", careersUrl: "https://careers.microsoft.com/professionals/us/en/l-bayarea", selector: "auto" },
];
```

```ts
response = await fetchFn(company.careersUrl, { signal: controller.signal });
```

Detail pages are then fetched through `hydrateLinkRole()`:

Reference: `src/ingest/careers.ts:273-309`

```ts
response = await fetchFn(role.url);
```

### 3. Raw response sample

#### Careers list page

Reference: `tests/careers.test.ts:125-135`

```html
<!DOCTYPE html>
<html>
<head><title>Microsoft Careers</title></head>
<body>
  <div class="jobs">
    <a href="https://apply.careers.microsoft.com/careers/job/1970393556852850?hl=en" aria-label="See details">See details</a>
  </div>
</body>
</html>
```

#### Detail page JSON-LD

Reference: `tests/careers.test.ts:137-164`

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Software Engineer II - M365 Copilot App",
  "datePosted": "2026-03-25T20:50:07",
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Mountain View",
      "addressRegion": "CA",
      "addressCountry": "US"
    }
  },
  "description": "Build AI-powered product experiences with TypeScript and distributed systems.",
  "url": "https://apply.careers.microsoft.com/careers/job/1970393556852850?hl=en"
}
</script>
```

### 4. Raw → `NormalizedOpportunity`

Reference: `src/ingest/careers.ts:327-346`

```ts
function normalizeCareerRole(
  company: CareerPage,
  role: RawExtractedRole,
): NormalizedOpportunity {
  const locationText = role.location ?? "";

  return {
    externalKey: `careers:${company.slug}:${role.url}`,
    roleExternalId: role.url,
    roleSource: "careers",
    title: role.title,
    summary: role.description ?? "",
    locations: locationText,
    remoteFlag: inferRemote(locationText) || inferRemote(role.title),
    jobUrl: role.url,
    postedAt: role.postedAt ?? null,
    seniorityHint: inferSeniority(role.title),
    extractedSkills: extractSkills(role.title, role.description),
  };
}
```

| Raw field | Normalized field |
| --- | --- |
| `company.slug` + `role.url` | `externalKey = careers:${slug}:${url}` |
| `role.url` | `roleExternalId` |
| constant | `roleSource = "careers"` |
| `role.title` | `title` |
| `role.description ?? ""` | `summary` |
| `role.location ?? ""` | `locations` |
| `inferRemote(location) || inferRemote(title)` | `remoteFlag` |
| `role.url` | `jobUrl` |
| `role.postedAt ?? null` | `postedAt` |
| `inferSeniority(role.title)` | `seniorityHint` |
| `extractSkills(role.title, role.description)` | `extractedSkills` |

### 5. Validation

There is no Zod schema. Validation is structural extraction:

- JSON-LD parsing in `extractJsonLd()`
- link filtering in `isPlausibleRoleTitle()`
- URL dedupe in `deduplicateRoles()`
- posted date extraction in `extractPostedAtFromHtml()`

References:

- `src/ingest/careers.ts:101-141`
- `src/ingest/careers.ts:209-217`
- `src/ingest/careers.ts:88-97`
- `src/ingest/careers.ts:255-271`

### 6. Fetch failure behavior

Reference: `src/ingest/careers.ts:356-384`

```ts
try {
  response = await fetchFn(company.careersUrl, { signal: controller.signal });
} catch (err) {
  clearTimeout(timeout);
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("abort")) {
    console.warn(`[careers] Timeout fetching ${company.name} (${company.careersUrl})`);
  } else {
    console.warn(`[careers] Failed to fetch ${company.name}: ${msg}`);
  }
  return empty;
}
...
if (!response.ok) {
  console.warn(`[careers] HTTP ${response.status} for ${company.name} (${company.careersUrl})`);
  return empty;
}
...
try {
  html = await response.text();
} catch {
  console.warn(`[careers] Could not read body from ${company.name}`);
  return empty;
}
```

### 7. Single invalid job behavior

There is no per-job schema parse; invalid extractions are filtered by extractor logic. If no valid roles remain:

Reference: `src/ingest/careers.ts:421-422`

```ts
console.warn(`[careers] No roles found on ${company.name} (${company.careersUrl})`);
return { ...empty, strategy: "none" };
```

### 8. Wired into `npm run scan`?

Yes. Reference: `src/commands/scan.ts:327-347`

It also has its own standalone command in `src/commands/scan-careers.ts`.

### 9. Configured companies count and list

Reference: `config/career-pages.ts:9-10`

Count: `1`

```ts
export const CAREER_PAGES: CareerPage[] = [
  { name: "Microsoft", slug: "microsoft", careersUrl: "https://careers.microsoft.com/professionals/us/en/l-bayarea", selector: "auto" },
];
```

### 10. Tests

Reference: `tests/careers.test.ts:186-391`

Coverage in that file:

- JSON-LD extraction
- `@graph` extraction
- link-pattern extraction
- dedupe/filtering
- Microsoft generic-link hydration
- embedded Greenhouse/Lever detection
- HTTP/network/timeout/no-role handling
- multi-page scrape with rate limiting
