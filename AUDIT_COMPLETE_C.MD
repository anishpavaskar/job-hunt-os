# PROMPT C: SCORING DEEP DIVE

## Code used

### Profile

Reference: `data/profile.json:3-62`

```json
{
  "target_roles": [
    "Software Engineer",
    "Backend Engineer",
    "Platform Engineer",
    "Infrastructure Engineer",
    "Cloud Engineer",
    "DevOps Engineer"
  ],
  "skills_tier1": [
    "Python",
    "TypeScript",
    "Go",
    "Kubernetes",
    "Docker",
    "AWS",
    "PostgreSQL",
    "Node.js"
  ],
  "skills_tier2": [
    "FastAPI",
    "Terraform",
    "JavaScript",
    "Java",
    "C++",
    "Helm",
    "Redis",
    "MongoDB",
    "React",
    "Jenkins",
    "Prometheus",
    "Grafana",
    "SQL",
    "Bash",
    "DynamoDB",
    "S3",
    "Lambda"
  ],
  "domains": [
    "Backend Engineering",
    "Cloud Infrastructure",
    "DevOps",
    "AI/ML",
    "Healthcare"
  ],
  "practices": [
    "CI/CD",
    "Microservices",
    "Distributed Systems",
    "Observability",
    "Infrastructure as Code"
  ],
  "years_of_experience": 3,
  "location": "Milpitas, CA",
  "preferences": {
    "remote": true,
    "hybrid": true,
    "healthcare": true,
    "early_stage": true,
    "relocation": true
  }
}
```

### Scoring code

Reference: `config/scoring.ts:81-117`, `src/score/scorer.ts:86-148`, `src/score/scorer.ts:150-182`, `src/score/scorer.ts:184-238`, `src/score/scorer.ts:329-358`

```ts
export const SCORING_WEIGHTS = {
  roleFit: 25,
  stackFit: 30,
  seniorityFit: 15,
  freshness: 10,
  companySignal: 20,
  prospectBoost: 8,
} as const;

export const ROLE_KEYWORDS = {
  platform: ["platform", "infrastructure", "infra", "developer platform"],
  backend: ["backend", "software engineer", "swe", "api", "distributed systems", "microservices", "services"],
  devops: ["devops", "sre", "reliability", "kubernetes", "cloud"],
  data: ["data", "pipeline", "analytics", "etl"],
  ai: ["ai", "machine learning", "ml", "llm", "rag"],
} as const;

export const SENIORITY_KEYWORDS = {
  junior: ["junior", "entry", "new grad", "associate"],
  mid: ["mid", "intermediate", "software engineer"],
  senior: ["senior", "staff", "lead", "principal"],
} as const;
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

## Assumed object for the manual walk-through

The prompt gave `Recent batch: false` but not a literal `batch` string or `isHiring`. The scorer requires both. For the manual calculation below, the object is:

```ts
const company: YcCompany = {
  name: "Anthropic",
  slug: "anthropic",
  small_logo_thumb_url: "",
  website: "https://anthropic.com",
  all_locations: "San Francisco, CA",
  long_description: "",
  one_liner: "",
  team_size: 500,
  industry: "AI",
  subindustry: "Infrastructure",
  tags: ["AI", "Infrastructure"],
  top_company: true,
  isHiring: true,
  batch: "Winter 2024",
  status: "Active",
  industries: ["AI"],
  regions: ["United States of America"],
  stage: "Growth",
  url: "https://www.ycombinator.com/companies/anthropic",
};

const opportunity: NormalizedOpportunity = {
  externalKey: "greenhouse:anthropic:manual-example",
  roleExternalId: "manual-example",
  roleSource: "greenhouse",
  title: "Software Engineer, Infrastructure",
  summary: "Build and maintain the infrastructure powering Claude. Work with Kubernetes, Python, and distributed systems at scale.",
  locations: "San Francisco, CA",
  remoteFlag: false,
  jobUrl: "https://job-boards.greenhouse.io/anthropic/jobs/example",
  seniorityHint: "mid",
  extractedSkills: ["Kubernetes", "Python", "distributed systems"],
};
```

## 1. `roleFit`

Reference: `src/score/scorer.ts:124-148`

```ts
function scoreRoleFit(opportunity: NormalizedOpportunity, profile?: Profile): number {
  const text = normalizeText(opportunity.title, opportunity.summary);
  let score = 0;
  const profileCorpus = normalizeText(
    ...(profile?.skills_tier1 ?? []),
    ...(profile?.skills_tier2 ?? []),
    ...(profile?.domains ?? []),
  );

  for (const keywords of Object.values(ROLE_KEYWORDS)) {
    const hits = matchCount(text, keywords);
    if (hits > 0 && keywords.some((keyword) => containsCI(profileCorpus, keyword))) {
      score += hits * 4;
    }
  }

  if (profile?.target_roles?.length) {
    const targetRoleHits = profile.target_roles.filter((role) => containsCI(text, role)).length;
    score += targetRoleHits * 8;
  }

  if (profile?.preferences?.healthcare && containsCI(text, "health")) score += 3;
  if (profile?.preferences?.remote && opportunity.remoteFlag) score += 2;
  return clamp(score, SCORING_WEIGHTS.roleFit);
}
```

Manual matches against:

```text
text =
"software engineer, infrastructure build and maintain the infrastructure powering claude. work with kubernetes, python, and distributed systems at scale."
```

Platform keyword group:

- `"platform"` → no
- `"infrastructure"` → yes
- `"infra"` → yes (`containsCI()` is substring-based)
- `"developer platform"` → no

`hits = 2`, profile corpus contains `"Cloud Infrastructure"` / `"Infrastructure Engineer"` ⇒ group qualifies.

Points: `2 * 4 = 8`

Backend keyword group:

- `"backend"` → no
- `"software engineer"` → yes
- `"swe"` → no
- `"api"` → no
- `"distributed systems"` → yes
- `"microservices"` → no
- `"services"` → no

`hits = 2`, profile corpus contains `"Backend Engineering"` ⇒ group qualifies.

Points: `2 * 4 = 8`

DevOps keyword group:

- `"devops"` → no
- `"sre"` → no
- `"reliability"` → no
- `"kubernetes"` → yes
- `"cloud"` → no

`hits = 1`, profile corpus contains `"Kubernetes"` / `"DevOps"` ⇒ group qualifies.

Points: `1 * 4 = 4`

Data group: no hits  
AI group: no hits from title+summary as written

Target role exact-substring hits:

- `"Software Engineer"` → yes
- `"Backend Engineer"` → no
- `"Platform Engineer"` → no
- `"Infrastructure Engineer"` → no
- `"Cloud Engineer"` → no
- `"DevOps Engineer"` → no

Points: `1 * 8 = 8`

Preference adders:

- healthcare → no
- remote → no (`remoteFlag` is false)

Raw subtotal:

```text
8 + 8 + 4 + 8 = 28
```

Clamp at `SCORING_WEIGHTS.roleFit = 25`

```text
roleFit = 25
```

## 2. `stackFit`

Reference: `src/score/scorer.ts:108-122`

```ts
function scoreStackFit(company: YcCompany, opportunity: NormalizedOpportunity, profile?: Profile): number {
  const text = buildOpportunityText(company, opportunity).toLowerCase();
  const tier1 = profile?.skills_tier1 ?? TIER1_TAGS;
  const tier2 = profile?.skills_tier2 ?? TIER2_TAGS;
  const domains = profile?.domains ?? [];
  const practices = profile?.practices ?? [];

  const tier1Score = matchCount(text, tier1) * 4;
  const tier2Score = matchCount(text, tier2) * 2;
  const domainScore = matchCount(text, domains) * 3;
  const practiceScore = matchCount(text, practices) * 3;
  const resumeScore = matchCount(text, RESUME_KEYWORDS) * 2;

  return clamp(tier1Score + tier2Score + domainScore + practiceScore + resumeScore, SCORING_WEIGHTS.stackFit);
}
```

`buildOpportunityText()` includes:

Reference: `src/score/scorer.ts:51-60`

```ts
return collapseWhitespace(
  opportunity.title,
  opportunity.summary,
  company.one_liner,
  company.long_description,
  company.tags.join(" "),
  company.industries.join(" "),
);
```

So the effective text includes:

```text
"Software Engineer, Infrastructure Build and maintain the infrastructure powering Claude. Work with Kubernetes, Python, and distributed systems at scale.  AI Infrastructure AI"
```

Tier 1 profile skills:

- Python → yes → `+4`
- TypeScript → no
- Go → no
- Kubernetes → yes → `+4`
- Docker → no
- AWS → no
- PostgreSQL → no
- Node.js → no

Tier 1 subtotal: `8`

Tier 2 profile skills:

- none of `FastAPI`, `Terraform`, `JavaScript`, `Java`, `C++`, `Helm`, `Redis`, `MongoDB`, `React`, `Jenkins`, `Prometheus`, `Grafana`, `SQL`, `Bash`, `DynamoDB`, `S3`, `Lambda` appear

Tier 2 subtotal: `0`

Domains:

- `Backend Engineering` → no exact substring
- `Cloud Infrastructure` → no exact substring
- `DevOps` → no exact substring
- `AI/ML` → no exact substring
- `Healthcare` → no

Domain subtotal: `0`

Practices:

- `CI/CD` → no
- `Microservices` → no
- `Distributed Systems` → yes → `+3`
- `Observability` → no
- `Infrastructure as Code` → no

Practice subtotal: `3`

Resume keywords:

- `golang` → no
- `python` → yes → `+2`
- `kubernetes` → yes → `+2`
- `helm` → no
- `microservice` → no
- `ci/cd` → no
- `pipeline` → no
- `observability` → no
- `distributed` → yes → `+2`
- `terraform` → no
- `docker` → no
- `rag` → no
- `llm` → no

Resume subtotal: `6`

Raw subtotal:

```text
8 + 0 + 0 + 3 + 6 = 17
```

Clamp at `SCORING_WEIGHTS.stackFit = 30`

```text
stackFit = 17
```

## 3. `seniorityFit`

Reference: `src/score/scorer.ts:150-182`

```ts
function inferProfileSeniority(profile?: Profile): "junior" | "mid" | "senior" {
  const years = profile?.years_of_experience;
  if (typeof years !== "number") {
    return "mid";
  }
  if (years >= 5) return "senior";
  if (years >= 2) return "mid";
  return "junior";
}

function scoreSeniorityFit(opportunity: NormalizedOpportunity, profile?: Profile): number {
  if (!opportunity.seniorityHint) return Math.floor(SCORING_WEIGHTS.seniorityFit / 2);
  const seniorityText = opportunity.seniorityHint.toLowerCase();
  const target = inferProfileSeniority(profile);

  ...

  if (SENIORITY_KEYWORDS[target].some((keyword) => seniorityText.includes(keyword))) {
    return SCORING_WEIGHTS.seniorityFit;
  }
```

Profile years of experience:

```text
3 years_of_experience → target = "mid"
```

Opportunity seniority:

```text
seniorityHint = "mid"
```

`SENIORITY_KEYWORDS.mid = ["mid", "intermediate", "software engineer"]`

`"mid".includes("mid")` ⇒ yes

```text
seniorityFit = 15
```

## 4. `freshness`

Reference: `src/score/scorer.ts:86-91`

```ts
function scoreFreshness(company: YcCompany): number {
  let score = 0;
  if (RECENT_BATCHES.includes(company.batch)) score += 7;
  if (company.isHiring) score += 3;
  return clamp(score, SCORING_WEIGHTS.freshness);
}
```

Assumed company fields:

```text
batch = "Winter 2024"   // not in RECENT_BATCHES
isHiring = true
```

Calculation:

- recent batch bonus → `0`
- `isHiring` bonus → `+3`

```text
freshness = 3
```

## 5. `companySignal`

Reference: `src/score/scorer.ts:62-83`, `src/score/scorer.ts:93-106`, `src/score/scorer.ts:220-238`

```ts
function scoreLocation(company: YcCompany): number {
  const locationParts = company.all_locations.split(",").map((p) => p.trim());
  const isBayArea = locationParts.some((part) =>
    BAY_AREA_CITIES.some((city) => containsCI(part, city)),
  );
  if (isBayArea) return 8;

  const isUS = company.regions.some(
    (r) => r.toLowerCase() === "united states of america" || r.toLowerCase() === "america",
  );
  return isUS ? 4 : 0;
}

function scoreProfileLocation(company: YcCompany, profile?: Profile): number {
  if (!profile?.location) return 0;
  const candidateLocation = profile.location.toLowerCase();
  const companyLocation = `${company.all_locations} ${company.regions.join(" ")}`.toLowerCase();

  if (companyLocation.includes(candidateLocation)) return 4;
  if (profile.preferences?.relocation) return 3;
  if (profile.preferences?.hybrid && scoreLocation(company) > 0) return 2;
  return 0;
}

function scoreCompanySignal(company: YcCompany, opportunity: NormalizedOpportunity): number {
  let score = 0;
  if (company.top_company) score += 8;
  if (company.stage === "Growth") score += 5;
  else if (company.stage === "Early" && (company.team_size ?? 0) <= 50) score += 3;
  if (opportunity.remoteFlag) score += 4;
  if ((opportunity.compensationMin ?? opportunity.compensationMax) != null) score += 3;
  score += scoreLocation(company);
  ...
  return clamp(score, SCORING_WEIGHTS.companySignal);
}

function buildBreakdown(
  company: YcCompany,
  opportunity: NormalizedOpportunity,
  profile?: Profile,
): ScoreBreakdown {
  const prospectListed = isProspectCompany(company.name);
  return {
    ...
    companySignal: clamp(
      scoreCompanySignal(company, opportunity)
        + scoreProfileLocation(company, profile)
        + (prospectListed ? SCORING_WEIGHTS.prospectBoost : 0),
      SCORING_WEIGHTS.companySignal,
    ),
    prospect_listed: prospectListed,
  };
}
```

Step-by-step:

Base `scoreCompanySignal(company, opportunity)`:

- `company.top_company === true` → `+8`
- `company.stage === "Growth"` → `+5`
- `opportunity.remoteFlag === false` → `+0`
- compensation missing → `+0`
- `scoreLocation(company)`:
  - `all_locations = "San Francisco, CA"` contains a Bay Area city
  - location score = `+8`
- healthcare tag/industry match → `0`

Raw company-signal subtotal:

```text
8 + 5 + 0 + 0 + 8 + 0 = 21
```

Internal clamp in `scoreCompanySignal()`:

```text
scoreCompanySignal(...) = clamp(21, 20) = 20
```

Profile-location adjustment:

- exact profile location match (`Milpitas, CA`) → no
- `profile.preferences.relocation === true` → `+3`

Prospect boost:

- prompt says Prospect-listed = true
- `SCORING_WEIGHTS.prospectBoost = 8`

Final pre-clamp:

```text
20 + 3 + 8 = 31
```

Final clamp in `buildBreakdown()`:

```text
companySignal = clamp(31, 20) = 20
prospect_listed = true
```

## 6. Total score

There is no weighted sum in the current implementation. The score is a plain additive sum:

Reference: `src/score/scorer.ts:346-353`

```ts
const score =
  breakdown.roleFit +
  breakdown.stackFit +
  breakdown.seniorityFit +
  breakdown.freshness +
  breakdown.companySignal;
return {
  score: clamp(score, 100),
  ...
}
```

Manual total:

```text
roleFit      25
stackFit     17
seniorityFit 15
freshness     3
companySignal 20
----------------
total        80
```

```text
final score = 80
```

## 7. `explanation_bullets`

Reference: `src/score/scorer.ts:184-201`

```ts
function buildExplanationBullets(
  breakdown: ScoreBreakdown,
  opportunity: NormalizedOpportunity,
  company: YcCompany,
  profile?: Profile,
): string[] {
  const bullets: string[] = [];
  if (breakdown.roleFit >= 12 && opportunity.title) bullets.push(`Strong role fit for ${opportunity.title}`);
  if (breakdown.stackFit >= 18) bullets.push("Stack aligns well with your core skills");
  if (breakdown.companySignal >= 12 && company.top_company) bullets.push("Strong company signal from YC and hiring posture");
  if (breakdown.prospect_listed) bullets.push("Prospect-curated top startup");
  if (breakdown.freshness >= 7) bullets.push(`Fresh enough to prioritize from ${company.batch}`);
  if (opportunity.remoteFlag) bullets.push("Remote-friendly role");
  if (profile?.target_roles?.some((role) => containsCI(opportunity.title ?? "", role))) {
    bullets.push("Matches one of your target role families");
  }
  return bullets.slice(0, 3);
}
```

Triggered bullets in order:

1. `roleFit >= 12` and title exists  
   → `"Strong role fit for Software Engineer, Infrastructure"`
2. `stackFit >= 18`  
   → no (`17`)
3. `companySignal >= 12` and `top_company`  
   → `"Strong company signal from YC and hiring posture"`
4. `prospect_listed`  
   → `"Prospect-curated top startup"`
5. `freshness >= 7`  
   → no (`3`)
6. `remoteFlag`  
   → no
7. title contains one of target roles (`Software Engineer`)  
   → `"Matches one of your target role families"`

After `slice(0, 3)`:

```json
[
  "Strong role fit for Software Engineer, Infrastructure",
  "Strong company signal from YC and hiring posture",
  "Prospect-curated top startup"
]
```

## 8. `risk_bullets`

Reference: `src/score/scorer.ts:203-218`

```ts
function buildRiskBullets(
  breakdown: ScoreBreakdown,
  opportunity: NormalizedOpportunity,
  company: YcCompany,
): string[] {
  const risks: string[] = [];
  const seniorityText = opportunity.seniorityHint?.toLowerCase() ?? "";
  if (["staff", "principal", "director"].some((keyword) => seniorityText.includes(keyword)) && breakdown.seniorityFit <= 4) {
    risks.push("Likely too senior for your current target level");
  }
  if (breakdown.seniorityFit <= 6) risks.push("Seniority fit is uncertain");
  if (!opportunity.remoteFlag) risks.push("Not clearly remote");
  if ((opportunity.compensationMin ?? opportunity.compensationMax) == null) risks.push("Compensation not disclosed");
  if (!RECENT_BATCHES.includes(company.batch)) risks.push(`Older batch (${company.batch}) may be lower-priority`);
  return risks.slice(0, 2);
}
```

Triggered risks:

- staff/principal/director too-senior rule → no
- `seniorityFit <= 6` → no
- `!remoteFlag` → `"Not clearly remote"`
- compensation missing → `"Compensation not disclosed"`
- batch not recent → `"Older batch (Winter 2024) may be lower-priority"`

After `slice(0, 2)`:

```json
[
  "Not clearly remote",
  "Compensation not disclosed"
]
```

## 9. `score_reasons_json`

Reference: `src/score/scorer.ts:337-344`

```json
[
  "role_fit:25",
  "stack_fit:17",
  "seniority_fit:15",
  "freshness:3",
  "company_signal:20",
  "Prospect-curated top startup"
]
```

## 10. `score_breakdown_json`

Reference: `src/db/types.ts:62-69`, `src/score/scorer.ts:225-238`

```json
{
  "roleFit": 25,
  "stackFit": 17,
  "seniorityFit": 15,
  "freshness": 3,
  "companySignal": 20,
  "prospect_listed": true
}
```
