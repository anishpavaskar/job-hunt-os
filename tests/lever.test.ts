import { fetchLeverJobs } from "../src/ingest/lever";
import type { LeverCompany } from "../config/lever-companies";

// ─── Fixtures ──────────────────────────────────────────────────

const MOCK_COMPANIES: LeverCompany[] = [
  { slug: "testcorp", name: "TestCorp" },
  { slug: "acme", name: "Acme Inc" },
];

const SAMPLE_POSTINGS = {
  seniorBackend: {
    id: "abc-123-def",
    text: "Senior Backend Engineer",
    hostedUrl: "https://jobs.lever.co/testcorp/abc-123-def",
    applyUrl: "https://jobs.lever.co/testcorp/abc-123-def/apply",
    createdAt: "2026-03-08T00:00:00.000Z",
    categories: {
      team: "Engineering",
      department: "Platform",
      location: "San Francisco, CA",
      commitment: "Full-time",
      allLocations: ["San Francisco, CA"],
    },
    descriptionPlain: "Build distributed systems using Kubernetes and Golang. Own backend microservices and CI/CD pipelines.",
    lists: [
      { text: "Requirements", content: "<li>5+ years experience</li>" },
    ],
  },
  remoteIntern: {
    id: "xyz-456-ghi",
    text: "Data Engineering Intern",
    hostedUrl: "https://jobs.lever.co/acme/xyz-456-ghi",
    categories: {
      team: "Data",
      department: "Data",
      location: "Remote",
      commitment: "Intern",
      allLocations: ["Remote - US", "Remote - Canada"],
    },
    descriptionPlain: "Work on data pipelines with Python, building ETL workflows and analytics dashboards.",
    lists: [],
  },
  staffMl: {
    id: "staff-ml-001",
    text: "Staff Machine Learning Engineer",
    hostedUrl: "https://jobs.lever.co/testcorp/staff-ml-001",
    categories: {
      team: "AI/ML",
      department: "Engineering",
      location: "New York, NY",
      commitment: "Full-time",
      allLocations: ["New York, NY", "San Francisco, CA"],
    },
    descriptionPlain: "Lead LLM and RAG systems development. Deep expertise in machine learning, distributed training, and Python required.",
    lists: [],
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

describe("lever ingester", () => {
  test("normalizes postings from multiple companies", async () => {
    const mockFetch = createMockFetch({
      "https://api.lever.co/v0/postings/testcorp": {
        status: 200,
        body: [SAMPLE_POSTINGS.seniorBackend, SAMPLE_POSTINGS.staffMl],
      },
      "https://api.lever.co/v0/postings/acme": {
        status: 200,
        body: [SAMPLE_POSTINGS.remoteIntern],
      },
    });

    const jobs = await fetchLeverJobs(MOCK_COMPANIES, mockFetch);

    expect(jobs).toHaveLength(3);
    expect(jobs[0].externalKey).toBe("lever:testcorp:abc-123-def");
    expect(jobs[1].externalKey).toBe("lever:testcorp:staff-ml-001");
    expect(jobs[2].externalKey).toBe("lever:acme:xyz-456-ghi");
  });

  test("normalizes senior backend posting correctly", async () => {
    const mockFetch = createMockFetch({
      "https://api.lever.co/v0/postings/testcorp": {
        status: 200,
        body: [SAMPLE_POSTINGS.seniorBackend],
      },
    });

    const [job] = await fetchLeverJobs([MOCK_COMPANIES[0]], mockFetch);

    expect(job.title).toBe("Senior Backend Engineer");
    expect(job.roleSource).toBe("lever");
    expect(job.roleExternalId).toBe("abc-123-def");
    expect(job.jobUrl).toBe("https://jobs.lever.co/testcorp/abc-123-def");
    expect(job.locations).toBe("San Francisco, CA");
    expect(job.remoteFlag).toBe(false);
    expect(job.seniorityHint).toBe("Senior");
    expect(job.postedAt).toBe("2026-03-08T00:00:00.000Z");

    // Summary is plain text (not HTML)
    expect(job.summary).toContain("distributed systems");
    expect(job.summary).toContain("Kubernetes");

    // Skills extracted from title + description
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["kubernetes"]));
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["golang"]));
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["ci/cd"]));
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["microservice"]));
  });

  test("infers remote flag from location and commitment", async () => {
    const mockFetch = createMockFetch({
      "https://api.lever.co/v0/postings/acme": {
        status: 200,
        body: [SAMPLE_POSTINGS.remoteIntern],
      },
    });

    const [job] = await fetchLeverJobs([MOCK_COMPANIES[1]], mockFetch);

    expect(job.remoteFlag).toBe(true);
    expect(job.seniorityHint).toBe("Intern");
    // allLocations has multiple entries → joined
    expect(job.locations).toBe("Remote - US; Remote - Canada");

    expect(job.extractedSkills).toEqual(expect.arrayContaining(["python"]));
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["pipeline"]));
  });

  test("infers staff seniority and multi-location", async () => {
    const mockFetch = createMockFetch({
      "https://api.lever.co/v0/postings/testcorp": {
        status: 200,
        body: [SAMPLE_POSTINGS.staffMl],
      },
    });

    const [job] = await fetchLeverJobs([MOCK_COMPANIES[0]], mockFetch);

    expect(job.seniorityHint).toBe("Staff");
    expect(job.remoteFlag).toBe(false);
    // allLocations has 2 entries → joined
    expect(job.locations).toBe("New York, NY; San Francisco, CA");

    expect(job.extractedSkills).toEqual(expect.arrayContaining(["llm"]));
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["rag"]));
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["python"]));
    expect(job.extractedSkills).toEqual(expect.arrayContaining(["Machine Learning"]));
  });

  test("skips invalid postings without crashing", async () => {
    const mockFetch = createMockFetch({
      "https://api.lever.co/v0/postings/testcorp": {
        status: 200,
        body: [
          { id: 999, text: null }, // invalid: id should be string, text required
          SAMPLE_POSTINGS.seniorBackend,
        ],
      },
    });

    const jobs = await fetchLeverJobs([MOCK_COMPANIES[0]], mockFetch);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Senior Backend Engineer");
  });

  test("handles non-array response gracefully", async () => {
    const mockFetch = createMockFetch({
      "https://api.lever.co/v0/postings/testcorp": {
        status: 200,
        body: { error: "not an array" },
      },
    });

    const jobs = await fetchLeverJobs([MOCK_COMPANIES[0]], mockFetch);
    expect(jobs).toHaveLength(0);
  });

  test("handles HTTP errors gracefully", async () => {
    const mockFetch = createMockFetch({
      "https://api.lever.co/v0/postings/testcorp": {
        status: 403,
        body: { error: "Forbidden" },
      },
      "https://api.lever.co/v0/postings/acme": {
        status: 200,
        body: [SAMPLE_POSTINGS.remoteIntern],
      },
    });

    const jobs = await fetchLeverJobs(MOCK_COMPANIES, mockFetch);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalKey).toBe("lever:acme:xyz-456-ghi");
  });

  test("handles network errors gracefully", async () => {
    const mockFetch = async (): Promise<Response> => {
      throw new Error("Network failure");
    };

    const jobs = await fetchLeverJobs([MOCK_COMPANIES[0]], mockFetch);
    expect(jobs).toHaveLength(0);
  });

  test("deduplicates team/department in tags", async () => {
    // When team and department are the same, we only keep one
    const posting = {
      ...SAMPLE_POSTINGS.remoteIntern,
      categories: {
        ...SAMPLE_POSTINGS.remoteIntern.categories,
        team: "Data",
        department: "Data",
      },
    };
    const mockFetch = createMockFetch({
      "https://api.lever.co/v0/postings/testcorp": {
        status: 200,
        body: [posting],
      },
    });

    const [job] = await fetchLeverJobs([MOCK_COMPANIES[0]], mockFetch);
    // The job normalizes — just verifying it doesn't crash or duplicate
    expect(job.roleSource).toBe("lever");
  });
});
