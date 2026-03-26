import { fetchGreenhouseJobs } from "../src/ingest/greenhouse";
import type { GreenhouseCompany } from "../config/greenhouse-companies";

// ─── Fixtures ──────────────────────────────────────────────────

const MOCK_COMPANIES: GreenhouseCompany[] = [
  { slug: "testcorp", name: "TestCorp" },
  { slug: "acme", name: "Acme Inc" },
];

function makeGreenhouseResponse(jobs: unknown[]) {
  return { jobs };
}

const SAMPLE_JOBS = {
  seniorBackend: {
    id: 10001,
    title: "Senior Backend Engineer",
    absolute_url: "https://boards.greenhouse.io/testcorp/jobs/10001",
    location: { name: "San Francisco, CA" },
    content: "<p>Build <strong>distributed systems</strong> using <em>Kubernetes</em> and Golang.</p>",
    departments: [{ name: "Engineering" }, { name: "Backend" }],
  },
  remoteDesigner: {
    id: 20002,
    title: "Product Designer",
    absolute_url: "https://boards.greenhouse.io/acme/jobs/20002",
    location: { name: "Remote - US" },
    content: "<div>Design beautiful interfaces. No coding required.</div>",
    departments: [{ name: "Design" }],
  },
  internMl: {
    id: 30003,
    title: "Machine Learning Intern",
    absolute_url: "https://boards.greenhouse.io/testcorp/jobs/30003",
    location: { name: "New York, NY (Remote OK)" },
    content: "Work on LLM pipelines and RAG systems with Python and PyTorch.",
    departments: [{ name: "AI/ML" }],
  },
};

// ─── Mock fetch ────────────────────────────────────────────────

function createMockFetch(
  responses: Record<string, { status: number; body: unknown }>,
): typeof globalThis.fetch {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const match = responses[url];
    if (!match) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response(JSON.stringify(match.body), {
      status: match.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe("greenhouse ingester", () => {
  test("normalizes jobs from multiple companies", async () => {
    const mockFetch = createMockFetch({
      "https://boards-api.greenhouse.io/v1/boards/testcorp/jobs": {
        status: 200,
        body: makeGreenhouseResponse([SAMPLE_JOBS.seniorBackend, SAMPLE_JOBS.internMl]),
      },
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs": {
        status: 200,
        body: makeGreenhouseResponse([SAMPLE_JOBS.remoteDesigner]),
      },
    });

    const jobs = await fetchGreenhouseJobs(MOCK_COMPANIES, mockFetch);

    expect(jobs).toHaveLength(3);

    // Verify company names come from config, not slug
    expect(jobs[0].externalKey).toBe("greenhouse:testcorp:10001");
    expect(jobs[1].externalKey).toBe("greenhouse:testcorp:30003");
    expect(jobs[2].externalKey).toBe("greenhouse:acme:20002");
  });

  test("normalizes senior backend role correctly", async () => {
    const mockFetch = createMockFetch({
      "https://boards-api.greenhouse.io/v1/boards/testcorp/jobs": {
        status: 200,
        body: makeGreenhouseResponse([SAMPLE_JOBS.seniorBackend]),
      },
    });

    const [job] = await fetchGreenhouseJobs([MOCK_COMPANIES[0]], mockFetch);

    expect(job.title).toBe("Senior Backend Engineer");
    expect(job.roleSource).toBe("greenhouse");
    expect(job.roleExternalId).toBe("10001");
    expect(job.jobUrl).toBe("https://boards.greenhouse.io/testcorp/jobs/10001");
    expect(job.locations).toBe("San Francisco, CA");
    expect(job.remoteFlag).toBe(false);
    expect(job.seniorityHint).toBe("Senior");

    // HTML should be stripped
    expect(job.summary).not.toContain("<p>");
    expect(job.summary).not.toContain("<strong>");
    expect(job.summary).toContain("distributed systems");
    expect(job.summary).toContain("Kubernetes");

    // Skills extracted from title + content
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["kubernetes"]));
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["golang"]));
  });

  test("infers remote flag and intern seniority", async () => {
    const mockFetch = createMockFetch({
      "https://boards-api.greenhouse.io/v1/boards/testcorp/jobs": {
        status: 200,
        body: makeGreenhouseResponse([SAMPLE_JOBS.remoteDesigner, SAMPLE_JOBS.internMl]),
      },
    });

    const jobs = await fetchGreenhouseJobs([MOCK_COMPANIES[0]], mockFetch);

    // Remote designer
    expect(jobs[0].remoteFlag).toBe(true);
    expect(jobs[0].seniorityHint).toBeNull();

    // ML intern with remote in parens
    expect(jobs[1].remoteFlag).toBe(true);
    expect(jobs[1].seniorityHint).toBe("Intern");
    expect(jobs[1].extractedSkills).toEqual(expect.arrayContaining(["python"]));
    expect(jobs[1].extractedSkills).toEqual(expect.arrayContaining(["llm"]));
    expect(jobs[1].extractedSkills).toEqual(expect.arrayContaining(["rag"]));
  });

  test("skips invalid jobs without crashing", async () => {
    const mockFetch = createMockFetch({
      "https://boards-api.greenhouse.io/v1/boards/testcorp/jobs": {
        status: 200,
        body: makeGreenhouseResponse([
          { id: "not-a-number", title: 123 }, // invalid: id should be number, title should be string
          SAMPLE_JOBS.seniorBackend,
        ]),
      },
    });

    const jobs = await fetchGreenhouseJobs([MOCK_COMPANIES[0]], mockFetch);

    // Invalid job skipped, valid one kept
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Senior Backend Engineer");
  });

  test("handles HTTP errors gracefully", async () => {
    const mockFetch = createMockFetch({
      "https://boards-api.greenhouse.io/v1/boards/testcorp/jobs": {
        status: 500,
        body: { error: "Internal Server Error" },
      },
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs": {
        status: 200,
        body: makeGreenhouseResponse([SAMPLE_JOBS.remoteDesigner]),
      },
    });

    const jobs = await fetchGreenhouseJobs(MOCK_COMPANIES, mockFetch);

    // First company failed, second succeeded
    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalKey).toBe("greenhouse:acme:20002");
  });

  test("handles fetch network error gracefully", async () => {
    const mockFetch = async (): Promise<Response> => {
      throw new Error("Network failure");
    };

    const jobs = await fetchGreenhouseJobs([MOCK_COMPANIES[0]], mockFetch);
    expect(jobs).toHaveLength(0);
  });
});
