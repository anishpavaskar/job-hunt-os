import fs from "fs";
import os from "os";
import path from "path";
import { runApplyCommand } from "../src/commands/apply";
import { assembleBriefingData } from "../src/commands/briefing";
import { runScanCommand } from "../src/commands/scan";
import { closeDb, initDb, resetDb } from "../src/db";
import { listJobs, listPendingFollowups } from "../src/db/repositories";
import { fetchGreenhouseJobs } from "../src/ingest/greenhouse";
import { fetchLeverJobs } from "../src/ingest/lever";
import { fetchYcCompanies, type YcCompany } from "../src/ingest/yc";

function mockJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}

describe("[integration] pipeline end-to-end", () => {
  let tmpDir: string;
  let previousCwd: string;
  let previousFetch: typeof global.fetch | undefined;

  beforeEach(() => {
    previousCwd = process.cwd();
    previousFetch = global.fetch;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-pipeline-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);

    const repoRoot = path.resolve(__dirname, "..");
    const realProfilePath = path.join(repoRoot, "data", "profile.json");
    const realProspectPath = path.join(repoRoot, "data", "prospect-companies.json");
    fs.copyFileSync(realProfilePath, path.join(tmpDir, "data", "profile.json"));
    fs.copyFileSync(realProspectPath, path.join(tmpDir, "data", "prospect-companies.json"));

    resetDb();
    initDb(path.join(tmpDir, "data", "job_hunt.db"));
  });

  afterEach(() => {
    process.chdir(previousCwd);
    global.fetch = previousFetch as typeof global.fetch;
    closeDb();
    resetDb();
  });

  test("scans all sources, scores and dedupes jobs, assembles briefing data, and reflects apply follow-ups", async () => {
    const ycCompanies: YcCompany[] = [
      {
        name: "Figma",
        slug: "figma",
        small_logo_thumb_url: "",
        website: "https://figma.com",
        all_locations: "San Francisco, CA",
        long_description: "Build collaborative software with backend systems, platform tooling, observability, and TypeScript services.",
        one_liner: "Collaborative design software with backend infrastructure",
        team_size: 500,
        industry: "Software",
        subindustry: "Collaboration",
        tags: ["Software", "TypeScript", "Backend", "Observability"],
        top_company: true,
        isHiring: true,
        batch: "Winter 2025",
        status: "Active",
        industries: ["Software"],
        regions: ["United States of America"],
        stage: "Growth",
        url: "https://www.ycombinator.com/companies/figma",
      },
      {
        name: "Scale AI",
        slug: "scale-ai",
        small_logo_thumb_url: "",
        website: "https://scale.com",
        all_locations: "San Francisco, CA",
        long_description: "AI platform with Python, Go, cloud infrastructure, Kubernetes, and distributed systems work.",
        one_liner: "AI infrastructure platform",
        team_size: 900,
        industry: "AI",
        subindustry: "Infrastructure",
        tags: ["AI", "Go", "Kubernetes", "AWS"],
        top_company: true,
        isHiring: true,
        batch: "Winter 2025",
        status: "Active",
        industries: ["AI"],
        regions: ["United States of America"],
        stage: "Growth",
        url: "https://www.ycombinator.com/companies/scale-ai",
      },
      {
        name: "Ramp",
        slug: "ramp",
        small_logo_thumb_url: "",
        website: "https://ramp.com",
        all_locations: "New York, NY",
        long_description: "Fintech backend platform using Node.js, PostgreSQL, AWS, and distributed systems.",
        one_liner: "Finance automation software",
        team_size: 700,
        industry: "Fintech",
        subindustry: "Payments",
        tags: ["Fintech", "Backend", "AWS", "PostgreSQL"],
        top_company: true,
        isHiring: true,
        batch: "Winter 2025",
        status: "Active",
        industries: ["Fintech"],
        regions: ["United States of America", "Remote"],
        stage: "Growth",
        url: "https://www.ycombinator.com/companies/ramp",
      },
      {
        name: "Abridge",
        slug: "abridge",
        small_logo_thumb_url: "",
        website: "https://abridge.com",
        all_locations: "Remote",
        long_description: "Healthcare AI infrastructure with Python services, cloud systems, and observability.",
        one_liner: "Healthcare AI platform",
        team_size: 250,
        industry: "AI",
        subindustry: "Healthcare",
        tags: ["Healthcare", "AI", "Python", "Observability"],
        top_company: true,
        isHiring: true,
        batch: "Winter 2025",
        status: "Active",
        industries: ["Healthcare", "AI"],
        regions: ["Remote", "United States of America"],
        stage: "Growth",
        url: "https://www.ycombinator.com/companies/abridge",
      },
      {
        name: "InfraGraph",
        slug: "infragraph",
        small_logo_thumb_url: "",
        website: "https://infragraph.dev",
        all_locations: "Remote",
        long_description: "Cloud infrastructure startup building Kubernetes, Terraform, CI/CD, and observability tooling.",
        one_liner: "Infrastructure as code platform",
        team_size: 35,
        industry: "Software",
        subindustry: "Infrastructure",
        tags: ["Infrastructure", "Terraform", "Kubernetes", "CI/CD"],
        top_company: false,
        isHiring: true,
        batch: "Winter 2025",
        status: "Active",
        industries: ["Infrastructure"],
        regions: ["Remote"],
        stage: "Early",
        url: "https://www.ycombinator.com/companies/infragraph",
      },
    ];

    const greenhousePayload = {
      jobs: [
        {
          id: 101,
          title: "Software Engineer II",
          absolute_url: "https://boards.greenhouse.io/anthropic/jobs/101",
          location: { name: "San Francisco, CA" },
          content: "<p>Build backend systems with Python, Go, AWS, Kubernetes, and observability for frontier AI products.</p>",
          departments: [{ name: "Engineering" }],
        },
        {
          id: 102,
          title: "Platform Engineer",
          absolute_url: "https://boards.greenhouse.io/anthropic/jobs/102",
          location: { name: "Remote" },
          content: "<p>Own platform infrastructure, Terraform, CI/CD, Docker, and Kubernetes.</p>",
          departments: [{ name: "Platform" }],
        },
        {
          id: 103,
          title: "Backend Engineer",
          absolute_url: "https://boards.greenhouse.io/anthropic/jobs/103",
          location: { name: "San Francisco, CA" },
          content: "<p>Build TypeScript and Python services with PostgreSQL and distributed systems.</p>",
          departments: [{ name: "Backend" }],
        },
      ],
    };

    const leverPayload = [
      {
        id: "201",
        text: "Platform Engineer",
        hostedUrl: "https://jobs.lever.co/cloudflare/201",
        categories: {
          team: "Platform",
          location: "Remote",
          allLocations: ["Remote", "San Francisco, CA"],
          commitment: "Full-time",
        },
        descriptionPlain: "Run cloud infrastructure, Kubernetes, Docker, AWS, and observability systems at scale.",
        lists: [],
      },
      {
        id: "202",
        text: "Software Engineer",
        hostedUrl: "https://jobs.lever.co/cloudflare/202",
        categories: {
          team: "Infrastructure",
          location: "San Francisco, CA",
          commitment: "Full-time",
        },
        descriptionPlain: "Build backend and developer platform systems using Go, TypeScript, PostgreSQL, and CI/CD.",
        lists: [],
      },
    ];

    const fetchMock = jest.fn(async (url: string) => {
      if (url === "https://yc-oss.github.io/api/companies/hiring.json") {
        return mockJsonResponse(ycCompanies);
      }
      if (url === "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs") {
        return mockJsonResponse(greenhousePayload);
      }
      if (url === "https://api.lever.co/v0/postings/cloudflare") {
        return mockJsonResponse(leverPayload);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    global.fetch = fetchMock as typeof global.fetch;

    const result = await runScanCommand(
      {},
      {
        fetchCompanies: () => fetchYcCompanies(process.cwd()),
        fetchGreenhouseJobs: () => fetchGreenhouseJobs([{ slug: "anthropic", name: "Anthropic" }], fetchMock as typeof global.fetch),
        fetchLeverJobs: () => fetchLeverJobs([{ slug: "cloudflare", name: "Cloudflare" }], fetchMock as typeof global.fetch),
      },
    );

    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const jobs = listJobs(db, { limit: 20 });
    db.prepare(`UPDATE jobs SET created_at = ?, updated_at = ?`).run("2026-03-26T10:00:00.000Z", "2026-03-26T10:00:00.000Z");

    expect(result.activeSources).toBe(3);
    expect(jobs).toHaveLength(10);
    for (const job of jobs) {
      expect(job.score).toBeGreaterThan(0);
      expect(job.score_reasons_json).not.toBe("[]");
      expect(JSON.parse(job.score_reasons_json).length).toBeGreaterThan(0);
    }

    const prospectCompanies = new Set(["Anthropic", "Cloudflare"]);
    const prospectJobs = jobs.filter((job) => prospectCompanies.has(job.company_name));
    expect(prospectJobs.length).toBe(5);
    for (const job of prospectJobs) {
      const breakdown = JSON.parse(job.score_breakdown_json) as { prospect_listed?: boolean };
      expect(breakdown.prospect_listed).toBe(true);
    }

    await runScanCommand(
      {},
      {
        fetchCompanies: () => fetchYcCompanies(process.cwd()),
        fetchGreenhouseJobs: () => fetchGreenhouseJobs([{ slug: "anthropic", name: "Anthropic" }], fetchMock as typeof global.fetch),
        fetchLeverJobs: () => fetchLeverJobs([{ slug: "cloudflare", name: "Cloudflare" }], fetchMock as typeof global.fetch),
      },
    );

    const jobsAfterRescan = listJobs(db, { limit: 20 });
    expect(jobsAfterRescan).toHaveLength(10);

    const briefing = assembleBriefingData(db, "2026-03-26");
    const visibleDiscoveredRoles = briefing.newRoles.filter((role) => role.kind !== "overflow");
    expect(Array.isArray(briefing.newRoles)).toBe(true);
    expect(visibleDiscoveredRoles.length).toBeGreaterThan(0);
    expect(visibleDiscoveredRoles.length).toBeLessThanOrEqual(
      jobs.filter((job) => job.score >= 60 && job.role_source !== "company_fallback").length,
    );
    for (let index = 1; index < visibleDiscoveredRoles.length; index += 1) {
      expect(visibleDiscoveredRoles[index - 1].score ?? 0).toBeGreaterThanOrEqual(visibleDiscoveredRoles[index].score ?? 0);
    }
    expect(briefing.applyNow.length).toBeGreaterThan(0);
    expect(briefing.followups).toEqual([]);

    const topRole = visibleDiscoveredRoles[0];
    const query = topRole.role === "(General)" ? topRole.company : topRole.role;
    await runApplyCommand(query, 7, {
      status: "applied",
      notes: "Integration test apply",
      resumeVersion: "resume-v1",
      outreachDraftVersion: "draft-v1",
    });

    const followups = listPendingFollowups(db);
    expect(followups).toHaveLength(1);

    const afterApplyBriefing = assembleBriefingData(db, "2026-03-26");
    expect(afterApplyBriefing.followups).toHaveLength(1);
    expect(afterApplyBriefing.followups[0].company).toBe(topRole.company);
    expect(afterApplyBriefing.drafts).toEqual([]);
  });
});
