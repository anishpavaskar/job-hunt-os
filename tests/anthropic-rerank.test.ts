import { rerankItemsWithAnthropic } from "../src/ai/anthropic-rerank";

describe("Anthropic reranker", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_RERANK_ENABLED: "1",
      ANTHROPIC_RERANK_IN_TESTS: "1",
      ANTHROPIC_RERANK_MODEL: "",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test("defaults to Haiku and reorders candidates by ai_score", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [
                { id: 2, ai_score: 94, reason: "Clearer IC platform fit" },
                { id: 1, ai_score: 41, reason: "Management-heavy" },
              ],
            }),
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = [
      { id: 1, company: "ManagerCo", title: "Engagement Manager", summary: "Own client relationships", score: 90 },
      { id: 2, company: "InfraCo", title: "Platform Engineer", summary: "Build control-plane systems", score: 82 },
    ];

    const reranked = await rerankItemsWithAnthropic(items, (item) => ({
      id: item.id,
      company: item.company,
      title: item.title,
      summary: item.summary,
      locations: "Remote",
      remoteFlag: true,
      score: item.score,
    }), { purpose: "review" });

    expect(reranked.map((item) => item.id)).toEqual([2, 1]);

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(String(request.model).toLowerCase()).toContain("haiku");
  });

  test("parses fenced json responses from Anthropic", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: [
              "```json",
              JSON.stringify({
                results: [
                  { id: 2, ai_score: 91, reason: "Better IC fit" },
                  { id: 1, ai_score: 35, reason: "Business-adjacent role" },
                ],
              }, null, 2),
              "```",
            ].join("\n"),
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = [
      { id: 1, company: "A", title: "Engagement Manager", summary: "Client work", score: 88 },
      { id: 2, company: "B", title: "Platform Engineer", summary: "Infra", score: 80 },
    ];

    const reranked = await rerankItemsWithAnthropic(items, (item) => ({
      id: item.id,
      company: item.company,
      title: item.title,
      summary: item.summary,
      locations: "Remote",
      remoteFlag: true,
      score: item.score,
    }), { purpose: "review" });

    expect(reranked.map((item) => item.id)).toEqual([2, 1]);
  });

  test("falls back to original ordering when the API call fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const items = [
      { id: 1, company: "A", title: "Platform Engineer", summary: "Infra", score: 80 },
      { id: 2, company: "B", title: "Backend Engineer", summary: "APIs", score: 75 },
    ];

    const reranked = await rerankItemsWithAnthropic(items, (item) => ({
      id: item.id,
      company: item.company,
      title: item.title,
      summary: item.summary,
      locations: "Remote",
      remoteFlag: true,
      score: item.score,
    }), { purpose: "browse" });

    expect(reranked.map((item) => item.id)).toEqual([1, 2]);
  });
});
