import fs from "fs";
import os from "os";
import path from "path";
import { runScanCommand } from "../src/commands/scan";
import { closeDb, initDb, resetDb } from "../src/db";
import { listJobs } from "../src/db/repositories";

describe("scan command", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-scan-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();
    initDb(path.join(tmpDir, "data", "job_hunt.db"));
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("writes multi-source scan results into SQLite and records per-source counts", async () => {
    const result = await runScanCommand(
      {},
      {
        fetchCompanies: async () => ({
          rawCount: 1,
          companies: [
            {
              name: "InfraCo",
              slug: "infraco",
              small_logo_thumb_url: "",
              website: "https://infraco.com",
              all_locations: "San Francisco, CA",
              long_description: "Infra platform",
              one_liner: "Cloud infra for teams",
              team_size: 20,
              industry: "B2B",
              subindustry: "Infra",
              tags: ["DevOps", "Kubernetes"],
              top_company: true,
              isHiring: true,
              batch: "Winter 2025",
              status: "Active",
              industries: ["Infrastructure"],
              regions: ["Remote"],
              stage: "Growth",
              url: "https://yc.com/infraco",
              roles: [
                {
                  id: "backend",
                  title: "Backend Engineer",
                  description: "Build backend systems",
                  location: "Remote",
                  remote: true,
                  apply_url: "https://infraco.com/jobs/backend",
                  compensation_min: 160000,
                  compensation_max: 210000,
                  compensation_currency: "USD",
                  compensation_period: "year",
                  seniority_hint: "Senior",
                },
              ],
            },
          ],
        }),
        fetchGreenhouseJobs: async () => ([
          {
            externalKey: "greenhouse:anthropic:100",
            roleExternalId: "100",
            roleSource: "greenhouse",
            title: "Software Engineer",
            summary: "Build AI systems",
            locations: "San Francisco, CA",
            remoteFlag: false,
            jobUrl: "https://boards.greenhouse.io/anthropic/jobs/100",
            seniorityHint: "Senior",
            extractedSkills: ["AI", "Python"],
          },
        ]),
        fetchLeverJobs: async () => ([
          {
            externalKey: "lever:cloudflare:200",
            roleExternalId: "200",
            roleSource: "lever",
            title: "Platform Engineer",
            summary: "Run infra systems",
            locations: "Remote",
            remoteFlag: true,
            jobUrl: "https://jobs.lever.co/cloudflare/200",
            seniorityHint: "Staff",
            extractedSkills: ["Infrastructure", "Kubernetes"],
          },
        ]),
      },
    );

    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const jobs = listJobs(db, { limit: 10 });
    const scans = db
      .prepare(`SELECT provider, source_counts_json FROM scans ORDER BY id ASC`)
      .all() as Array<{ provider: string; source_counts_json: string }>;

    expect(result.activeSources).toBe(3);
    expect(result.upserted).toBe(3);
    expect(result.roleCount).toBe(3);
    expect(jobs).toHaveLength(3);
    expect(jobs.some((job) => job.company_name === "InfraCo")).toBe(true);
    expect(jobs.some((job) => job.company_name === "Anthropic")).toBe(true);
    expect(jobs.some((job) => job.company_name === "Cloudflare")).toBe(true);
    expect(scans.map((scan) => scan.provider)).toEqual(["yc", "greenhouse", "lever"]);
    expect(JSON.parse(scans[0].source_counts_json)).toMatchObject({ totalRoles: 1, upserted: 1 });
    expect(JSON.parse(scans[1].source_counts_json)).toMatchObject({ totalRoles: 1, upserted: 1 });
    expect(JSON.parse(scans[2].source_counts_json)).toMatchObject({ totalRoles: 1, upserted: 1 });
  });

  test("continues scanning when one source fails", async () => {
    const result = await runScanCommand(
      {},
      {
        fetchCompanies: async () => ({
          rawCount: 1,
          companies: [
            {
              name: "InfraCo",
              slug: "infraco",
              small_logo_thumb_url: "",
              website: "https://infraco.com",
              all_locations: "Remote",
              long_description: "Infra platform",
              one_liner: "Cloud infra for teams",
              team_size: 20,
              industry: "B2B",
              subindustry: "Infra",
              tags: ["DevOps", "Kubernetes"],
              top_company: false,
              isHiring: true,
              batch: "Winter 2025",
              status: "Active",
              industries: ["Infrastructure"],
              regions: ["Remote"],
              stage: "Growth",
              url: "https://yc.com/infraco",
            },
          ],
        }),
        fetchGreenhouseJobs: async () => {
          throw new Error("Greenhouse API changed");
        },
        fetchLeverJobs: async () => ([
          {
            externalKey: "lever:cloudflare:200",
            roleExternalId: "200",
            roleSource: "lever",
            title: "Platform Engineer",
            summary: "Run infra systems",
            locations: "Remote",
            remoteFlag: true,
            jobUrl: "https://jobs.lever.co/cloudflare/200",
            seniorityHint: "Staff",
            extractedSkills: ["Infrastructure", "Kubernetes"],
          },
        ]),
      },
    );

    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const jobs = listJobs(db, { limit: 10 });
    const greenhouseScan = db
      .prepare(`SELECT source_counts_json FROM scans WHERE provider = 'greenhouse' ORDER BY id DESC LIMIT 1`)
      .get() as { source_counts_json: string };

    expect(result.upserted).toBe(2);
    expect(jobs).toHaveLength(2);
    expect(JSON.parse(greenhouseScan.source_counts_json)).toMatchObject({ failed: true, upserted: 0 });
  });
});
