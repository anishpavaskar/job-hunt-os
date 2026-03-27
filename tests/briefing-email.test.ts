import { renderBriefingEmail } from "../src/templates/briefing-email";
import type { BriefingData, BriefingNewRole, BriefingFollowup } from "../src/briefing/types";

const ORIGINAL_DASHBOARD_URL = process.env.DASHBOARD_URL;

// ─── Fixtures ──────────────────────────────────────────────────

function makeRole(overrides: Partial<BriefingNewRole> = {}): BriefingNewRole {
  return {
    rank: 1,
    score: 85,
    company: "Anthropic",
    role: "Backend Engineer",
    location: "San Francisco, CA",
    whyItFits: "Strong alignment with ML infrastructure",
    topRisk: "Compensation not listed",
    applyLink: "https://anthropic.com/jobs/1",
    isProspect: false,
    remoteFlag: false,
    discoveredDate: "2026-03-26",
    postedDate: null,
    extractedSkills: ["Python", "TypeScript", "Kubernetes"],
    stackMatch: 7,
    applicationStatus: null,
    ...overrides,
  };
}

function makeFollowup(overrides: Partial<BriefingFollowup> = {}): BriefingFollowup {
  return {
    company: "Stripe",
    role: "Platform Engineer",
    dueDate: "2026-03-27",
    lastAction: "applied (2026-03-10)",
    notes: null,
    appliedDate: "2026-03-10",
    ...overrides,
  };
}

function makeData(overrides: Partial<BriefingData> = {}): BriefingData {
  return {
    date: "2026-03-26",
    applyNow: [],
    newRoles: [makeRole()],
    followups: [],
    drafts: [],
    funnel: null,
    appliedCount: 12,
    workflowCounts: {
      saved: 2,
      drafted: 1,
      applied: 12,
      interview: 3,
    },
    totalTracked: 340,
    sourcesScanned: 87,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe("renderBriefingEmail", () => {
  beforeEach(() => {
    process.env.DASHBOARD_URL = "https://dashboard.example.com";
  });

  afterAll(() => {
    process.env.DASHBOARD_URL = ORIGINAL_DASHBOARD_URL;
  });

  describe("structure", () => {
    it("returns a full HTML document", () => {
      const html = renderBriefingEmail(makeData());
      expect(html).toContain("<!DOCTYPE html");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("<body");
      expect(html).toContain("</body>");
    });

    it("uses no <style> blocks or CSS classes", () => {
      const html = renderBriefingEmail(makeData());
      expect(html).not.toContain("<style");
      expect(html).not.toMatch(/class=/);
    });

    it("uses only inline styles", () => {
      const html = renderBriefingEmail(makeData());
      // Every styled element should have style=""
      const styledElements = html.match(/style="[^"]*"/g) ?? [];
      expect(styledElements.length).toBeGreaterThan(10);
    });

    it("uses table layout, not flexbox or grid", () => {
      const html = renderBriefingEmail(makeData());
      expect(html).not.toContain("display:flex");
      expect(html).not.toContain("display:grid");
      expect(html).toContain("<table");
    });

    it("contains no CSS variables", () => {
      const html = renderBriefingEmail(makeData());
      expect(html).not.toContain("var(--");
    });
  });

  describe("header", () => {
    it("renders JOB HUNT OS label", () => {
      const html = renderBriefingEmail(makeData());
      expect(html.toLowerCase()).toContain("job hunt os");
    });

    it("renders the formatted date", () => {
      const html = renderBriefingEmail(makeData({ date: "2026-03-26" }));
      expect(html).toContain("March 26, 2026");
    });

    it("shows tracked role count and above-70 count", () => {
      const roles = [
        makeRole({ score: 85 }),
        makeRole({ score: 72, company: "Figma" }),
        makeRole({ score: 61, company: "Notion" }),
      ];
      const html = renderBriefingEmail(makeData({ newRoles: roles }));
      expect(html).toContain("3 tracked roles");
      expect(html).toContain("2 above 70");
    });

    it("counts grouped overflow roles in the tracked total", () => {
      const roles = [
        makeRole({ company: "Anthropic", score: 54 }),
        makeRole({ company: "Anthropic", role: "Senior SWE", score: 50 }),
        makeRole({
          kind: "overflow",
          rank: null,
          score: null,
          company: "Anthropic",
          role: "+4 more roles at Anthropic",
          location: "",
          whyItFits: "Similar roles hidden to keep the briefing readable",
          topRisk: null,
          applyLink: null,
          isProspect: true,
          remoteFlag: false,
          discoveredDate: "2026-03-26",
          postedDate: null,
          extractedSkills: [],
          stackMatch: 0,
          applicationStatus: null,
        }),
        makeRole({ company: "Figma", score: 50 }),
      ];
      const html = renderBriefingEmail(makeData({ newRoles: roles }));
      expect(html).toContain("7 tracked roles");
    });

    it("renders a dashboard link at the top of the email", () => {
      const html = renderBriefingEmail(makeData());
      expect(html).toContain("https://dashboard.example.com/");
      expect(html).toContain("View dashboard");
    });
  });

  describe("metric cards", () => {
    it("renders top score", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ score: 91 })] }));
      expect(html).toContain("91");
      expect(html).toContain("Top Score");
    });

    it("renders applied count", () => {
      const html = renderBriefingEmail(makeData({ appliedCount: 17 }));
      expect(html).toContain("17");
      expect(html).toContain("Applied");
    });

    it("renders follow-ups due count", () => {
      const html = renderBriefingEmail(
        makeData({ followups: [makeFollowup(), makeFollowup({ company: "Ramp" })] }),
      );
      expect(html).toContain("Follow-ups Due");
      expect(html).toContain("2");
    });

    it("top score is green when >= 80", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ score: 82 })] }));
      expect(html).toContain("#3B6D11");
    });

    it("follow-ups count is amber when > 0", () => {
      const html = renderBriefingEmail(makeData({ followups: [makeFollowup()] }));
      expect(html).toContain("#854F0B");
    });

    it("renders workflow snapshot cards", () => {
      const html = renderBriefingEmail(
        makeData({
          workflowCounts: { saved: 4, drafted: 2, applied: 9, interview: 1 },
        }),
      );
      expect(html).toContain("Saved");
      expect(html).toContain("Drafted");
      expect(html).toContain("Applied");
      expect(html).toContain("Interview");
      expect(html).toContain(">4<");
      expect(html).toContain(">2<");
      expect(html).toContain(">9<");
      expect(html).toContain(">1<");
    });
  });

  describe("best open tracked roles section", () => {
    it("renders each role's company and title", () => {
      const roles = [
        makeRole({ company: "Anthropic", role: "ML Infra Engineer" }),
        makeRole({ company: "Vercel", role: "Platform Engineer", score: 78 }),
      ];
      const html = renderBriefingEmail(makeData({ newRoles: roles }));
      expect(html).toContain("Anthropic");
      expect(html).toContain("ML Infra Engineer");
      expect(html).toContain("Vercel");
      expect(html).toContain("Platform Engineer");
    });

    it("renders score badge green for 80+", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ score: 88 })] }));
      expect(html).toContain("#EAF3DE");
      expect(html).toContain("#3B6D11");
    });

    it("renders score badge amber for 60-79", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ score: 71 })] }));
      expect(html).toContain("#FAEEDA");
      expect(html).toContain("#854F0B");
    });

    it("renders stack match pill with correct value", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ stackMatch: 6 })] }));
      expect(html).toContain("Stack match: 6/10");
    });

    it("renders Prospect listed pill when isProspect=true", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ isProspect: true })] }));
      expect(html).toContain("Prospect listed");
      expect(html).toContain("#EEEDFE");
    });

    it("renders Applied pill when the role already has an application", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ applicationStatus: "applied" })] }));
      expect(html).toContain("Applied");
    });

    it("renders Saved pill when the role is saved", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ applicationStatus: "saved" })] }));
      expect(html).toContain("Saved");
    });

    it("renders Drafted pill when the role is drafted", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ applicationStatus: "drafted" })] }));
      expect(html).toContain("Drafted");
    });

    it("renders Interview pill when the role is in interview", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ applicationStatus: "interview" })] }));
      expect(html).toContain("Interview");
    });

    it("does not render Prospect pill when isProspect=false", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ isProspect: false })] }));
      expect(html).not.toContain("Prospect listed");
    });

    it("renders Remote friendly pill when remoteFlag=true", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [makeRole({ remoteFlag: true })] }));
      expect(html).toContain("Remote friendly");
    });

    it("renders top extracted skills in location line", () => {
      const html = renderBriefingEmail(
        makeData({
          newRoles: [makeRole({ extractedSkills: ["Python", "Go", "Kubernetes", "AWS", "Redis"] })],
        }),
      );
      expect(html).toContain("Python");
      expect(html).toContain("Go");
      expect(html).toContain("Kubernetes");
      expect(html).toContain("AWS");
      // 5th skill beyond top 4 should not appear in the location line
      expect(html).not.toContain("Redis");
    });

    it("renders posted and tracked dates when available", () => {
      const html = renderBriefingEmail(
        makeData({ newRoles: [makeRole({ postedDate: "2026-03-12", discoveredDate: "2026-03-26" })] }),
      );
      expect(html).toContain("Posted 2026-03-12");
      expect(html).toContain("Tracked 2026-03-26");
    });

    it("renders a dashboard roles link on the card", () => {
      const html = renderBriefingEmail(
        makeData({ newRoles: [makeRole({ company: "Open AI Research" })] }),
      );
      expect(html).toContain("https://dashboard.example.com/roles?q=Open+AI+Research");
    });

    it("renders top risk line", () => {
      const html = renderBriefingEmail(
        makeData({ newRoles: [makeRole({ topRisk: "Early stage, limited runway" })] }),
      );
      expect(html).toContain("Early stage, limited runway");
    });

    it("omits risk line when topRisk is null", () => {
      const html = renderBriefingEmail(
        makeData({ newRoles: [makeRole({ topRisk: null })] }),
      );
      expect(html).not.toContain("&#x26A0;");
    });

    it("shows top 8 roles fully and collapses the rest", () => {
      const roles = Array.from({ length: 11 }, (_, i) =>
        makeRole({ company: `Company${i}`, score: 90 - i, rank: i + 1 }),
      );
      const html = renderBriefingEmail(makeData({ newRoles: roles }));
      // First 8 should appear
      for (let i = 0; i < 8; i++) {
        expect(html).toContain(`Company${i}`);
      }
      // 9th–11th companies should not be individually shown
      expect(html).not.toContain("Company8");
      expect(html).not.toContain("Company9");
      expect(html).not.toContain("Company10");
      // Overflow indicator appears
      expect(html).toContain("3 more roles below 65");
    });

    it("shows empty state when no new roles", () => {
      const html = renderBriefingEmail(makeData({ newRoles: [] }));
      expect(html).toContain("No tracked open roles scored above 50 right now.");
    });
  });

  describe("best apply-now section", () => {
    it("renders apply-now cards when present", () => {
      const html = renderBriefingEmail(
        makeData({
          applyNow: [
            {
              rank: 1,
              score: 78,
              company: "Figma",
              role: "Software Engineer, Distributed Systems",
              location: "San Francisco, CA",
              whyNow: "Strong unapplied match in your queue",
              topRisk: "Not clearly remote",
              applyLink: "https://figma.com/jobs/1",
            },
          ],
        }),
      );
      expect(html).toContain("Best Apply-Now");
      expect(html).toContain("Figma");
      expect(html).toContain("Strong unapplied match in your queue");
      expect(html).toContain("https://dashboard.example.com/roles?q=Figma");
    });

    it("shows an empty state when no apply-now roles exist", () => {
      const html = renderBriefingEmail(makeData({ applyNow: [] }));
      expect(html).toContain("No strong apply-now roles right now.");
    });
  });

  describe("follow-ups section", () => {
    it("renders follow-up company and role", () => {
      const html = renderBriefingEmail(
        makeData({ followups: [makeFollowup({ company: "Stripe", role: "Platform Engineer" })] }),
      );
      expect(html).toContain("Stripe");
      expect(html).toContain("Platform Engineer");
    });

    it("renders applied date and last action", () => {
      const html = renderBriefingEmail(
        makeData({
          followups: [makeFollowup({ appliedDate: "2026-03-10", lastAction: "applied (2026-03-10)" })],
        }),
      );
      expect(html).toContain("2026-03-10");
      expect(html).toContain("applied");
    });

    it("renders due date in amber", () => {
      const html = renderBriefingEmail(makeData({ followups: [makeFollowup()] }));
      // amber color appears for the due-date line
      expect(html).toContain("#854F0B");
      expect(html).toContain("2026-03-27");
    });

    it("shows an empty state when no follow-ups are due", () => {
      const data = makeData({ followups: [] });
      const html = renderBriefingEmail(data);
      expect(html).toContain("No follow-ups due.");
    });
  });

  describe("footer", () => {
    it("renders sources scanned count", () => {
      const html = renderBriefingEmail(makeData({ sourcesScanned: 87 }));
      expect(html).toContain("scanned 87 sources");
    });

    it("renders total roles tracked", () => {
      const html = renderBriefingEmail(makeData({ totalTracked: 340 }));
      expect(html).toContain("340 roles tracked");
    });

    it("renders job-hunt-os label", () => {
      const html = renderBriefingEmail(makeData());
      expect(html).toContain("job-hunt-os");
    });

    it("renders a dashboard link at the bottom of the email", () => {
      const html = renderBriefingEmail(makeData());
      expect(html).toContain("https://dashboard.example.com/");
      expect(html).toContain("View dashboard");
    });
  });

  describe("HTML safety", () => {
    it("escapes HTML in company names", () => {
      const html = renderBriefingEmail(
        makeData({ newRoles: [makeRole({ company: '<script>alert("xss")</script>' })] }),
      );
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes HTML in role titles", () => {
      const html = renderBriefingEmail(
        makeData({ newRoles: [makeRole({ role: "Engineer & Lead" })] }),
      );
      expect(html).toContain("Engineer &amp; Lead");
    });
  });
});
