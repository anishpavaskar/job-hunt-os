import { scrapeCareerPage, scrapeAllCareerPages } from "../src/ingest/careers";
import type { CareerPage } from "../config/career-pages";

// ─── Fixtures ──────────────────────────────────────────────────

const PLANET: CareerPage = { name: "Planet Labs", slug: "planet", careersUrl: "https://www.planet.com/company/careers/", selector: "auto" };
const XAI: CareerPage = { name: "xAI", slug: "xai", careersUrl: "https://x.ai/careers", selector: "auto" };
const ACME: CareerPage = { name: "Acme", slug: "acme", careersUrl: "https://acme.com/careers", selector: "auto" };

// ─── HTML fixtures ─────────────────────────────────────────────

const JSON_LD_PAGE = `
<!DOCTYPE html>
<html>
<head>
  <title>Careers at Planet Labs</title>
  <script type="application/ld+json">
  [
    {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": "Senior Backend Engineer",
      "url": "https://www.planet.com/careers/senior-backend-engineer",
      "jobLocation": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "San Francisco",
          "addressRegion": "CA",
          "addressCountry": "US"
        }
      },
      "description": "<p>Build distributed systems using <strong>Kubernetes</strong> and Golang for satellite data pipelines.</p>"
    },
    {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": "Machine Learning Intern",
      "url": "/careers/ml-intern",
      "jobLocation": {
        "@type": "Place",
        "name": "Remote"
      },
      "description": "Work on LLM and RAG systems with Python."
    }
  ]
  </script>
</head>
<body>
  <h1>Join Planet Labs</h1>
</body>
</html>
`;

const JSON_LD_GRAPH_PAGE = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@graph": [
      {
        "@type": "JobPosting",
        "title": "Staff Platform Engineer",
        "url": "https://example.com/jobs/staff-platform",
        "jobLocation": "New York, NY"
      }
    ]
  }
  </script>
</head>
<body></body>
</html>
`;

const LINK_PATTERN_PAGE = `
<!DOCTYPE html>
<html>
<head><title>xAI Careers</title></head>
<body>
  <div class="job-list">
    <a href="/careers/jobs/senior-sre">Senior SRE - Infrastructure</a>
    <a href="/careers/jobs/ml-engineer">Machine Learning Engineer</a>
    <a href="/careers/jobs/intern-data">Data Engineering Intern</a>
    <a href="/careers/">View All Jobs</a>
    <a href="/about">About Us</a>
    <a href="/careers/jobs/senior-sre">Senior SRE - Infrastructure</a>
  </div>
</body>
</html>
`;

const GREENHOUSE_IFRAME_PAGE = `
<!DOCTYPE html>
<html>
<head><title>Acme Careers</title></head>
<body>
  <h1>Join Acme</h1>
  <iframe src="https://boards.greenhouse.io/acmecorp/embed/job_board"></iframe>
</body>
</html>
`;

const LEVER_IFRAME_PAGE = `
<!DOCTYPE html>
<html>
<body>
  <div id="lever-jobs-container" data-url="https://jobs.lever.co/coolstartup"></div>
</body>
</html>
`;

const EMPTY_PAGE = `
<!DOCTYPE html>
<html>
<head><title>Acme</title></head>
<body>
  <h1>We're not hiring right now</h1>
  <p>Check back later.</p>
</body>
</html>
`;

const MICROSOFT_LIST_PAGE = `
<!DOCTYPE html>
<html>
<head><title>Microsoft Careers</title></head>
<body>
  <div class="jobs">
    <a href="https://apply.careers.microsoft.com/careers/job/1970393556852850?hl=en" aria-label="See details">See details</a>
  </div>
</body>
</html>
`;

const MICROSOFT_DETAIL_PAGE = `
<!DOCTYPE html>
<html>
<head>
  <title>Software Engineer II - M365 Copilot App | Microsoft Careers</title>
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
</head>
<body></body>
</html>
`;

// ─── Mock fetch ────────────────────────────────────────────────

function createMockFetch(
  responses: Record<string, { status: number; body: string; contentType?: string }>,
): typeof globalThis.fetch {
  return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const match = responses[url];
    if (!match) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response(match.body, {
      status: match.status,
      headers: { "Content-Type": match.contentType ?? "text/html" },
    });
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe("careers scraper", () => {
  describe("JSON-LD extraction", () => {
    test("extracts roles from JSON-LD JobPosting array", async () => {
      const mockFetch = createMockFetch({
        [PLANET.careersUrl]: { status: 200, body: JSON_LD_PAGE },
      });

      const result = await scrapeCareerPage(PLANET, mockFetch);

      expect(result.strategy).toBe("jsonld");
      expect(result.roles).toHaveLength(2);

      // Senior Backend Engineer
      expect(result.roles[0].title).toBe("Senior Backend Engineer");
      expect(result.roles[0].jobUrl).toBe("https://www.planet.com/careers/senior-backend-engineer");
      expect(result.roles[0].locations).toBe("San Francisco, CA, US");
      expect(result.roles[0].remoteFlag).toBe(false);
      expect(result.roles[0].seniorityHint).toBe("Senior");
      expect(result.roles[0].roleSource).toBe("careers");
      expect(result.roles[0].externalKey).toContain("careers:planet:");

      // HTML stripped from description
      expect(result.roles[0].summary).not.toContain("<p>");
      expect(result.roles[0].summary).toContain("Kubernetes");
      expect(result.roles[0].extractedSkills).toEqual(expect.arrayContaining(["kubernetes"]));
      expect(result.roles[0].extractedSkills).toEqual(expect.arrayContaining(["golang"]));

      // ML Intern with relative URL
      expect(result.roles[1].title).toBe("Machine Learning Intern");
      expect(result.roles[1].jobUrl).toBe("https://www.planet.com/careers/ml-intern");
      expect(result.roles[1].locations).toBe("Remote");
      expect(result.roles[1].remoteFlag).toBe(true);
      expect(result.roles[1].seniorityHint).toBe("Intern");
      expect(result.roles[1].extractedSkills).toEqual(expect.arrayContaining(["llm"]));
      expect(result.roles[1].extractedSkills).toEqual(expect.arrayContaining(["rag"]));
      expect(result.roles[1].extractedSkills).toEqual(expect.arrayContaining(["python"]));
    });

    test("extracts roles from @graph JSON-LD", async () => {
      const mockFetch = createMockFetch({
        [PLANET.careersUrl]: { status: 200, body: JSON_LD_GRAPH_PAGE },
      });

      const result = await scrapeCareerPage(PLANET, mockFetch);

      expect(result.strategy).toBe("jsonld");
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].title).toBe("Staff Platform Engineer");
      expect(result.roles[0].seniorityHint).toBe("Staff");
      expect(result.roles[0].locations).toBe("New York, NY");
    });
  });

  describe("link pattern extraction", () => {
    test("extracts roles from href links with /jobs/ paths", async () => {
      const mockFetch = createMockFetch({
        [XAI.careersUrl]: { status: 200, body: LINK_PATTERN_PAGE },
      });

      const result = await scrapeCareerPage(XAI, mockFetch);

      expect(result.strategy).toBe("link_pattern");
      // 3 unique roles: Senior SRE, ML Engineer, Intern (duplicate SRE deduped, "View All" filtered)
      expect(result.roles).toHaveLength(3);

      expect(result.roles[0].title).toBe("Senior SRE - Infrastructure");
      expect(result.roles[0].jobUrl).toBe("https://x.ai/careers/jobs/senior-sre");
      expect(result.roles[0].seniorityHint).toBe("Senior");

      expect(result.roles[1].title).toBe("Machine Learning Engineer");
      expect(result.roles[1].jobUrl).toBe("https://x.ai/careers/jobs/ml-engineer");

      expect(result.roles[2].title).toBe("Data Engineering Intern");
      expect(result.roles[2].seniorityHint).toBe("Intern");
    });

    test("filters out non-role links", async () => {
      const mockFetch = createMockFetch({
        [XAI.careersUrl]: { status: 200, body: LINK_PATTERN_PAGE },
      });

      const result = await scrapeCareerPage(XAI, mockFetch);
      const titles = result.roles.map((r) => r.title);

      // "View All Jobs" should be filtered out
      expect(titles).not.toContain("View All Jobs");
      // "About Us" doesn't match /jobs/ pattern at all
      expect(titles).not.toContain("About Us");
    });

    test("hydrates generic link titles from the detail page", async () => {
      const microsoft: CareerPage = {
        name: "Microsoft",
        slug: "microsoft",
        careersUrl: "https://careers.microsoft.com/professionals/us/en/l-bayarea",
        selector: "auto",
      };
      const mockFetch = createMockFetch({
        [microsoft.careersUrl]: { status: 200, body: MICROSOFT_LIST_PAGE },
        "https://apply.careers.microsoft.com/careers/job/1970393556852850?hl=en": { status: 200, body: MICROSOFT_DETAIL_PAGE },
      });

      const result = await scrapeCareerPage(microsoft, mockFetch);

      expect(result.strategy).toBe("link_pattern");
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].title).toBe("Software Engineer II - M365 Copilot App");
      expect(result.roles[0].locations).toBe("Mountain View, CA, US");
      expect(result.roles[0].postedAt).toBe("2026-03-26T03:50:07.000Z");
      expect(result.roles[0].summary).toContain("TypeScript");
    });
  });

  describe("iframe redirect detection", () => {
    test("detects embedded Greenhouse and returns no roles", async () => {
      const mockFetch = createMockFetch({
        [ACME.careersUrl]: { status: 200, body: GREENHOUSE_IFRAME_PAGE },
      });

      const result = await scrapeCareerPage(ACME, mockFetch);

      expect(result.strategy).toBe("iframe_redirect:greenhouse:acmecorp");
      expect(result.roles).toHaveLength(0);
    });

    test("detects embedded Lever", async () => {
      const mockFetch = createMockFetch({
        [ACME.careersUrl]: { status: 200, body: LEVER_IFRAME_PAGE },
      });

      const result = await scrapeCareerPage(ACME, mockFetch);

      expect(result.strategy).toBe("iframe_redirect:lever:coolstartup");
      expect(result.roles).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    test("handles HTTP errors gracefully", async () => {
      const mockFetch = createMockFetch({
        [PLANET.careersUrl]: { status: 503, body: "Service Unavailable" },
      });

      const result = await scrapeCareerPage(PLANET, mockFetch);

      expect(result.roles).toHaveLength(0);
      expect(result.strategy).toBe("none");
    });

    test("handles network errors gracefully", async () => {
      const mockFetch = async (): Promise<Response> => {
        throw new Error("Network failure");
      };

      const result = await scrapeCareerPage(PLANET, mockFetch);

      expect(result.roles).toHaveLength(0);
      expect(result.strategy).toBe("none");
    });

    test("handles timeout via abort gracefully", async () => {
      const mockFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        // Simulate abort signal triggering
        if (init?.signal) {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        }
        throw new Error("abort");
      };

      const result = await scrapeCareerPage(PLANET, mockFetch);
      expect(result.roles).toHaveLength(0);
    });

    test("handles page with no roles", async () => {
      const mockFetch = createMockFetch({
        [ACME.careersUrl]: { status: 200, body: EMPTY_PAGE },
      });

      const result = await scrapeCareerPage(ACME, mockFetch);

      expect(result.roles).toHaveLength(0);
      expect(result.strategy).toBe("none");
    });
  });

  describe("scrapeAllCareerPages", () => {
    test("scrapes multiple pages with rate limiting", async () => {
      const mockFetch = createMockFetch({
        [PLANET.careersUrl]: { status: 200, body: JSON_LD_PAGE },
        [XAI.careersUrl]: { status: 200, body: LINK_PATTERN_PAGE },
      });

      const start = Date.now();
      const results = await scrapeAllCareerPages([PLANET, XAI], mockFetch);
      const elapsed = Date.now() - start;

      expect(results).toHaveLength(2);
      expect(results[0].roles.length).toBe(2); // JSON-LD
      expect(results[1].roles.length).toBe(3); // link patterns
      // Rate limiting: at least 500ms gap
      expect(elapsed).toBeGreaterThanOrEqual(400);
    });
  });
});
