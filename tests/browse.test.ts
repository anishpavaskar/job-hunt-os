import fs from "fs";
import os from "os";
import path from "path";
import { runBrowseCommand } from "../src/commands/browse";
import { closeDb, initDb, resetDb } from "../src/db";
import { createScan, upsertJob, upsertJobSource } from "../src/db/repositories";

describe("browse command", () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-browse-"));
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    resetDb();

    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const ycScanId = await createScan(db, "yc", new Date().toISOString());
    const greenhouseScanId = await createScan(db, "greenhouse", new Date().toISOString());
    const careersScanId = await createScan(db, "careers", new Date().toISOString());

    const ycSourceId = await upsertJobSource(db, {
      provider: "yc",
      externalId: "confident-ai",
      url: "https://www.ycombinator.com/companies/confident-ai",
    });
    const greenhouseSourceId = await upsertJobSource(db, {
      provider: "greenhouse",
      externalId: "scaleai",
      url: "https://job-boards.greenhouse.io/scaleai",
    });
    const greenhouseSourceIdTwo = await upsertJobSource(db, {
      provider: "greenhouse",
      externalId: "asana",
      url: "https://boards.greenhouse.io/asana",
    });
    const careersSourceId = await upsertJobSource(db, {
      provider: "careers",
      externalId: "microsoft",
      url: "https://careers.microsoft.com/professionals/us/en/l-bayarea",
    });

    await upsertJob(db, {
      sourceId: ycSourceId,
      scanId: ycScanId,
      externalKey: "company:confident-ai",
      roleExternalId: null,
      roleSource: "company_fallback",
      companyName: "Confident AI",
      title: null,
      summary: "AI eval tooling company",
      website: "https://confident-ai.com",
      locations: "San Francisco, CA",
      remoteFlag: false,
      jobUrl: "https://www.ycombinator.com/companies/confident-ai",
      postedAt: null,
      regions: ["United States of America"],
      tags: ["AI"],
      industries: ["AI"],
      stage: "Growth",
      batch: "Winter 2025",
      teamSize: 20,
      seniorityHint: null,
      extractedSkills: ["python"],
      topCompany: false,
      isHiring: true,
      score: 54,
      scoreReasons: ["strong_yc_fit"],
      scoreBreakdown: { roleFit: 12, stackFit: 11, seniorityFit: 7, freshness: 10, companySignal: 14 },
      explanationBullets: ["Fresh enough to prioritize from Winter 2025"],
      riskBullets: ["Not clearly remote"],
      status: "new",
    });

    await upsertJob(db, {
      sourceId: greenhouseSourceId,
      scanId: greenhouseScanId,
      externalKey: "greenhouse:scaleai:4665557005",
      roleExternalId: "4665557005",
      roleSource: "greenhouse",
      companyName: "Scale AI",
      title: "Infrastructure Software Engineer, Enterprise GenAI",
      summary: "Build AI infra with Go, Kubernetes, and AWS",
      website: "https://scale.com",
      locations: "San Francisco, CA",
      remoteFlag: false,
      jobUrl: "https://job-boards.greenhouse.io/scaleai/jobs/4665557005",
      postedAt: "2026-03-18T21:34:04.000Z",
      regions: ["United States of America"],
      tags: ["AI", "Infrastructure"],
      industries: ["AI"],
      stage: "Growth",
      batch: "External",
      teamSize: 1000,
      seniorityHint: "Senior",
      extractedSkills: ["go", "kubernetes", "aws"],
      topCompany: true,
      isHiring: true,
      score: 53,
      scoreReasons: ["role_fit", "stack_fit"],
      scoreBreakdown: { roleFit: 16, stackFit: 15, seniorityFit: 6, freshness: 4, companySignal: 12, prospect_listed: true },
      explanationBullets: ["Strong role fit for Infrastructure Software Engineer, Enterprise GenAI"],
      riskBullets: ["Not clearly remote"],
      status: "new",
    });

    await upsertJob(db, {
      sourceId: greenhouseSourceIdTwo,
      scanId: greenhouseScanId,
      externalKey: "greenhouse:asana:7299272",
      roleExternalId: "7299272",
      roleSource: "greenhouse",
      companyName: "Asana",
      title: "Software Engineer, CI/CD",
      summary: "Own CI/CD systems and developer tooling",
      website: "https://asana.com",
      locations: "San Francisco, CA",
      remoteFlag: false,
      jobUrl: "https://www.asana.com/jobs/apply/7299272?gh_jid=7299272",
      postedAt: "2026-03-10T21:00:00.000Z",
      regions: ["United States of America"],
      tags: ["Infrastructure"],
      industries: ["Software"],
      stage: "Growth",
      batch: "External",
      teamSize: 500,
      seniorityHint: "Senior",
      extractedSkills: ["ci/cd", "typescript"],
      topCompany: false,
      isHiring: true,
      score: 38,
      scoreReasons: ["stack_fit"],
      scoreBreakdown: { roleFit: 10, stackFit: 12, seniorityFit: 5, freshness: 4, companySignal: 7 },
      explanationBullets: ["CI/CD overlap with your platform interests"],
      riskBullets: ["Not clearly remote"],
      status: "new",
    });

    await upsertJob(db, {
      sourceId: careersSourceId,
      scanId: careersScanId,
      externalKey: "careers:microsoft:https://apply.careers.microsoft.com/careers/job/1970393556852494?hl=en",
      roleExternalId: "https://apply.careers.microsoft.com/careers/job/1970393556852494?hl=en",
      roleSource: "careers",
      companyName: "Microsoft",
      title: "Principal Software Engineer - Simulation Platform",
      summary: "Build simulation platform systems",
      website: "https://microsoft.com",
      locations: "Mountain View, CA",
      remoteFlag: false,
      jobUrl: "https://apply.careers.microsoft.com/careers/job/1970393556852494?hl=en",
      postedAt: "2026-03-25T07:29:01.000Z",
      regions: ["United States of America"],
      tags: ["Platform"],
      industries: ["Software"],
      stage: "Enterprise",
      batch: "External",
      teamSize: 10000,
      seniorityHint: "Principal",
      extractedSkills: ["distributed systems"],
      topCompany: false,
      isHiring: true,
      score: 43,
      scoreReasons: ["role_fit"],
      scoreBreakdown: { roleFit: 14, stackFit: 8, seniorityFit: 2, freshness: 8, companySignal: 11 },
      explanationBullets: ["Strong platform overlap"],
      riskBullets: ["Likely senior stretch"],
      status: "new",
    });

    db.prepare(`UPDATE jobs SET created_at = '2026-03-26 10:00:00', updated_at = '2026-03-26 10:00:00'`).run();
  });

  afterEach(() => {
    process.chdir(previousCwd);
    closeDb();
  });

  test("filters by source and keeps yc fallback rows visible when requested", async () => {
    const lines = (await runBrowseCommand({ source: "yc", limit: "10" })).join("\n");

    expect(lines).toContain("Showing 1 jobs");
    expect(lines).toContain("Confident AI");
    expect(lines).toContain("source: yc");
    expect(lines).toContain("flags: YC company");
    expect(lines).not.toContain("Scale AI");
  });

  test("filters to prospect real roles within a posted window", async () => {
    const lines = (await runBrowseCommand({
      source: "greenhouse",
      prospect: true,
      realRoles: true,
      postedWithinDays: "30",
      minScore: "45",
      limit: "10",
    })).join("\n");

    expect(lines).toContain("Showing 1 jobs");
    expect(lines).toContain("Scale AI");
    expect(lines).toContain("flags: Prospect");
    expect(lines).not.toContain("Confident AI");
    expect(lines).not.toContain("Microsoft");
  });

  test("sorts by posted date when requested", async () => {
    const lines = await runBrowseCommand({
      source: "greenhouse",
      realRoles: true,
      sort: "posted",
      limit: "10",
    });

    const scaleIndex = lines.findIndex((line: string) => line.includes("Scale AI"));
    const asanaIndex = lines.findIndex((line: string) => line.includes("Asana"));
    expect(scaleIndex).toBeGreaterThan(0);
    expect(asanaIndex).toBeGreaterThan(0);
    expect(scaleIndex).toBeLessThan(asanaIndex);
  });

  test("caps browse results at ten roles per company", async () => {
    const db = initDb(path.join(tmpDir, "data", "job_hunt.db"));
    const scanId = await createScan(db, "greenhouse", new Date().toISOString());
    const sourceId = await upsertJobSource(db, {
      provider: "greenhouse",
      externalId: "repeat-browse",
      url: "https://job-boards.greenhouse.io/repeat-browse",
    });

    for (let index = 1; index <= 11; index += 1) {
      await upsertJob(db, {
        sourceId,
        scanId,
        externalKey: `greenhouse:repeat-browse:${index}`,
        roleExternalId: `repeat-browse:${index}`,
        roleSource: "greenhouse",
        companyName: "RepeatBrowseCo",
        title: `Infrastructure Engineer ${index}`,
        summary: "Build distributed infrastructure systems",
        website: "https://repeatbrowseco.com",
        locations: "San Francisco, CA",
        remoteFlag: false,
        jobUrl: `https://repeatbrowseco.com/jobs/${index}`,
        postedAt: `2026-03-${String(index).padStart(2, "0")}T12:00:00.000Z`,
        regions: ["United States of America"],
        tags: ["Infrastructure"],
        industries: ["AI"],
        stage: "Growth",
        batch: "External",
        teamSize: 500,
        seniorityHint: "Senior",
        extractedSkills: ["go", "kubernetes", "aws"],
        topCompany: true,
        isHiring: true,
        score: 80 - index,
        scoreReasons: ["role_fit", "stack_fit"],
        scoreBreakdown: { roleFit: 16, stackFit: 15, seniorityFit: 6, freshness: 4, companySignal: 12, prospect_listed: true },
        explanationBullets: ["Strong role fit for Infrastructure Engineer"],
        riskBullets: ["Not clearly remote"],
        status: "new",
      });
    }

    const lines = await runBrowseCommand({
      source: "greenhouse",
      query: "RepeatBrowseCo",
      limit: "20",
    });
    const repeatLines = lines.filter((line: string) => line.includes("RepeatBrowseCo"));

    expect(repeatLines).toHaveLength(10);
  });
});
