import { countActualNewRoles } from "../briefing/types";
import type { BriefingData, BriefingNewRole, BriefingFollowup } from "../briefing/types";

// ─── Color tokens (all hardcoded hex — no CSS vars) ────────────

const C = {
  white: "#FFFFFF",
  surface: "#F7F7F5",
  border: "#E5E5E3",
  textPrimary: "#1A1A1A",
  textSecondary: "#6B6B6B",
  textTertiary: "#9B9B9B",
  greenBg: "#EAF3DE",
  greenText: "#3B6D11",
  amberBg: "#FAEEDA",
  amberText: "#854F0B",
  blueBg: "#E6F1FB",
  blueText: "#185FA5",
  purpleBg: "#EEEDFE",
  purpleText: "#534AB7",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif";

// ─── Helpers ───────────────────────────────────────────────────

function h(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const then = new Date(isoDate);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

function getDashboardBaseUrl(): string | null {
  const value = process.env.DASHBOARD_URL?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

function buildDashboardUrl(pathname: string, params?: Record<string, string>): string | null {
  const base = getDashboardBaseUrl();
  if (!base) return null;

  try {
    const url = new URL(pathname, `${base}/`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  } catch {
    const query = params
      ? `?${new URLSearchParams(params).toString()}`
      : "";
    return `${base}${pathname}${query}`;
  }
}

// ─── Pill / badge builders ──────────────────────────────────────

function scoreBadge(score: number): string {
  const bg = score >= 80 ? C.greenBg : C.amberBg;
  const color = score >= 80 ? C.greenText : C.amberText;
  return `<span style="display:inline-block;padding:2px 9px;border-radius:4px;font-size:12px;font-weight:700;background:${bg};color:${color};white-space:nowrap;">${h(score)}</span>`;
}

function pill(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500;background:${bg};color:${color};margin:0 4px 4px 0;">${h(text)}</span>`;
}

function workflowPill(status: string | null): string | null {
  if (!status) return null;
  if (status === "saved" || status === "shortlisted") {
    return pill("Saved", C.amberBg, C.amberText);
  }
  if (status === "drafted") {
    return pill("Drafted", C.purpleBg, C.purpleText);
  }
  if (status === "interview") {
    return pill("Interview", C.blueBg, C.blueText);
  }
  if (["applied", "followup_due", "replied", "rejected", "archived"].includes(status)) {
    return pill("Applied", C.greenBg, C.greenText);
  }
  return null;
}

// ─── Metric card ───────────────────────────────────────────────

function metricCard(label: string, value: string | number, valueColor: string = C.textPrimary): string {
  return `<td style="width:32%;background:${C.surface};border:1px solid ${C.border};border-radius:8px;padding:16px;text-align:center;vertical-align:top;">
  <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:${valueColor};font-family:${FONT};">${h(value)}</p>
  <p style="margin:0;font-size:12px;color:${C.textSecondary};font-family:${FONT};">${h(label)}</p>
</td>`;
}

function smallMetricCard(label: string, value: string | number, valueColor: string = C.textPrimary): string {
  return `<td style="width:24%;background:${C.surface};border:1px solid ${C.border};border-radius:8px;padding:14px;text-align:center;vertical-align:top;">
  <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:${valueColor};font-family:${FONT};">${h(value)}</p>
  <p style="margin:0;font-size:12px;color:${C.textSecondary};font-family:${FONT};">${h(label)}</p>
</td>`;
}

// ─── Section header ────────────────────────────────────────────

function sectionHeader(title: string): string {
  return `<tr><td style="padding:32px 0 16px;">
  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.textTertiary};font-family:${FONT};">${h(title)}</p>
</td></tr>`;
}

function divider(): string {
  return `<tr><td style="padding:0;"><div style="height:1px;background:${C.border};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
}

// ─── Role card ─────────────────────────────────────────────────

function renderRoleCard(role: BriefingNewRole): string {
  const score = role.score ?? 0;
  const topSkills = role.extractedSkills.slice(0, 4).join(", ");
  const locationLine = [h(role.location), topSkills ? h(topSkills) : ""]
    .filter(Boolean)
    .join(" &middot; ");
  const dateBits = [
    role.postedDate ? `Posted ${h(role.postedDate)}` : "",
    role.discoveredDate ? `Tracked ${h(role.discoveredDate)}` : "",
  ].filter(Boolean).join(" &middot; ");

  const pills: string[] = [
    pill(`Stack match: ${role.stackMatch}/10`, C.blueBg, C.blueText),
  ];
  if (role.isProspect) pills.push(pill("Prospect listed", C.purpleBg, C.purpleText));
  if (role.remoteFlag) pills.push(pill("Remote friendly", C.greenBg, C.greenText));
  const statusPill = workflowPill(role.applicationStatus);
  if (statusPill) pills.push(statusPill);

  const riskLine = role.topRisk
    ? `<p style="margin:8px 0 0;font-size:12px;color:${C.textTertiary};font-family:${FONT};">&#x26A0; ${h(role.topRisk)}</p>`
    : "";

  const href = buildDashboardUrl("/roles", { q: role.company }) ?? role.applyLink ?? "#";

  return `<tr><td style="padding:0 0 10px;">
<a href="${h(href)}" style="display:block;text-decoration:none;color:inherit;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};border:1px solid ${C.border};border-radius:8px;">
    <tr><td style="padding:14px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:15px;font-weight:700;color:${C.textPrimary};font-family:${FONT};">${h(role.company)}</td>
          <td align="right" style="white-space:nowrap;vertical-align:middle;">${scoreBadge(score)}</td>
        </tr>
      </table>
      <p style="margin:4px 0 0;font-size:14px;color:${C.textPrimary};font-family:${FONT};">${h(role.role)}</p>
      <p style="margin:4px 0 0;font-size:13px;color:${C.textSecondary};font-family:${FONT};">${locationLine}</p>
      ${dateBits ? `<p style="margin:4px 0 0;font-size:12px;color:${C.textTertiary};font-family:${FONT};">${dateBits}</p>` : ""}
      <p style="margin:8px 0 0;">${pills.join("")}</p>
      ${riskLine}
    </td></tr>
  </table>
</a>
</td></tr>`;
}

// ─── Overflow row ──────────────────────────────────────────────

function renderOverflowRow(count: number): string {
  return `<tr><td style="padding:0 0 10px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};border:1px solid ${C.border};border-radius:8px;">
    <tr><td style="padding:12px 16px;text-align:center;font-size:13px;color:${C.textSecondary};font-family:${FONT};">
      + ${h(count)} more role${count !== 1 ? "s" : ""} below 65
    </td></tr>
  </table>
</td></tr>`;
}

// ─── Follow-up card ────────────────────────────────────────────

function renderFollowupCard(f: BriefingFollowup): string {
  const days = daysSince(f.appliedDate);
  const daysLine =
    days !== null
      ? `<p style="margin:4px 0 0;font-size:13px;color:${C.amberText};font-family:${FONT};">Due ${h(f.dueDate)} &middot; Applied ${h(days)} day${days !== 1 ? "s" : ""} ago</p>`
      : `<p style="margin:4px 0 0;font-size:13px;color:${C.amberText};font-family:${FONT};">Due ${h(f.dueDate)}</p>`;

  const appliedInfo = f.appliedDate
    ? `Applied ${h(f.appliedDate)} &middot; ${h(f.lastAction)}`
    : h(f.lastAction);

  return `<tr><td style="padding:0 0 10px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};border:1px solid ${C.border};border-radius:8px;">
    <tr><td style="padding:14px 16px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:${C.textPrimary};font-family:${FONT};">${h(f.company)}${f.role ? ` &mdash; ${h(f.role)}` : ""}</p>
      <p style="margin:4px 0 0;font-size:13px;color:${C.textSecondary};font-family:${FONT};">${appliedInfo}</p>
      ${daysLine}
    </td></tr>
  </table>
</td></tr>`;
}

function renderApplyNowCard(role: BriefingData["applyNow"][number]): string {
  const riskLine = role.topRisk
    ? `<p style="margin:8px 0 0;font-size:12px;color:${C.textTertiary};font-family:${FONT};">&#x26A0; ${h(role.topRisk)}</p>`
    : "";

  const href = buildDashboardUrl("/roles", { q: role.company }) ?? role.applyLink ?? "#";

  return `<tr><td style="padding:0 0 10px;">
<a href="${h(href)}" style="display:block;text-decoration:none;color:inherit;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};border:1px solid ${C.border};border-radius:8px;">
    <tr><td style="padding:14px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:15px;font-weight:700;color:${C.textPrimary};font-family:${FONT};">${h(role.company)}</td>
          <td align="right" style="white-space:nowrap;vertical-align:middle;">${scoreBadge(role.score)}</td>
        </tr>
      </table>
      <p style="margin:4px 0 0;font-size:14px;color:${C.textPrimary};font-family:${FONT};">${h(role.role)}</p>
      <p style="margin:4px 0 0;font-size:13px;color:${C.textSecondary};font-family:${FONT};">${h(role.location)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:${C.textSecondary};font-family:${FONT};">${h(role.whyNow)}</p>
      ${riskLine}
    </td></tr>
  </table>
</a>
</td></tr>`;
}

// ─── Main render ───────────────────────────────────────────────

export function renderBriefingEmail(data: BriefingData): string {
  const {
    date,
    applyNow,
    newRoles,
    followups,
    appliedCount = 0,
    workflowCounts,
    totalTracked = 0,
    sourcesScanned = 0,
  } = data;
  const actualRolesCount = countActualNewRoles(newRoles);
  const above70 = newRoles.filter((r) => (r.score ?? 0) >= 70 && r.kind !== "overflow").length;
  const topVisibleRole = newRoles.find((role) => role.kind !== "overflow");
  const topScore = topVisibleRole?.score ?? 0;
  const topScoreColor = topScore >= 80 ? C.greenText : C.textPrimary;
  const followupColor = followups.length > 0 ? C.amberText : C.textPrimary;
  const dashboardHomeUrl = buildDashboardUrl("/");

  // Top 8 shown fully; remainder collapsed
  const shownRoles = newRoles.slice(0, 8);
  const hiddenCount = newRoles.length - shownRoles.length;

  const roleCards = shownRoles.map(renderRoleCard).join("\n");
  const overflowRow = hiddenCount > 0 ? renderOverflowRow(hiddenCount) : "";

  const trackedRecentlySection =
    newRoles.length > 0
      ? `${sectionHeader("Best Open Tracked Roles")}
${roleCards}
${overflowRow}`
      : `${sectionHeader("Best Open Tracked Roles")}
<tr><td style="padding:0 0 16px;font-size:14px;color:${C.textSecondary};font-family:${FONT};">No tracked open roles scored above 50 right now.</td></tr>`;

  const applyNowSection =
    applyNow.length > 0
      ? `${divider()}
${sectionHeader("Best Apply-Now")}
${applyNow.map(renderApplyNowCard).join("\n")}`
      : `${divider()}
${sectionHeader("Best Apply-Now")}
<tr><td style="padding:0 0 16px;font-size:14px;color:${C.textSecondary};font-family:${FONT};">No strong apply-now roles right now.</td></tr>`;

  const followupsSection =
    followups.length > 0
      ? `${divider()}
${sectionHeader("Follow-ups Due")}
${followups.map(renderFollowupCard).join("\n")}`
      : `${divider()}
${sectionHeader("Follow-ups Due")}
<tr><td style="padding:0 0 16px;font-size:14px;color:${C.textSecondary};font-family:${FONT};">No follow-ups due.</td></tr>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Job Hunt OS</title>
</head>
<body style="margin:0;padding:0;background-color:${C.white};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- OUTER WRAPPER -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.white};">
<tr><td align="center" style="padding:40px 16px;">

<!-- 600px CONTAINER -->
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

<!-- ── HEADER ── -->
<tr><td style="padding:0 0 24px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.textTertiary};font-family:${FONT};">Job Hunt OS</p>
  <p style="margin:0 0 8px;font-size:22px;font-weight:500;color:${C.textPrimary};font-family:${FONT};">${h(formatDisplayDate(date))}</p>
  <p style="margin:0;font-size:14px;color:${C.textSecondary};font-family:${FONT};">${h(actualRolesCount)} tracked roles &middot; ${h(above70)} above 70</p>
  ${dashboardHomeUrl
    ? `<p style="margin:10px 0 0;font-size:13px;font-family:${FONT};"><a href="${h(dashboardHomeUrl)}" style="color:${C.blueText};text-decoration:none;font-weight:600;">View dashboard &rarr;</a></p>`
    : ""}
</td></tr>

${divider()}

<!-- ── METRIC CARDS ── -->
<tr><td style="padding:24px 0 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr valign="top">
      ${metricCard("Top Score", topScore, topScoreColor)}
      <td width="2%" style="padding:0;">&nbsp;</td>
      ${metricCard("Applied", appliedCount)}
      <td width="2%" style="padding:0;">&nbsp;</td>
      ${metricCard("Follow-ups Due", followups.length, followupColor)}
    </tr>
  </table>
</td></tr>

<!-- ── WORKFLOW SNAPSHOT ── -->
<tr><td style="padding:12px 0 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr valign="top">
      ${smallMetricCard("Saved", workflowCounts.saved, workflowCounts.saved > 0 ? C.amberText : C.textPrimary)}
      <td width="1.333%" style="padding:0;">&nbsp;</td>
      ${smallMetricCard("Drafted", workflowCounts.drafted, workflowCounts.drafted > 0 ? C.purpleText : C.textPrimary)}
      <td width="1.333%" style="padding:0;">&nbsp;</td>
      ${smallMetricCard("Applied", workflowCounts.applied, workflowCounts.applied > 0 ? C.greenText : C.textPrimary)}
      <td width="1.333%" style="padding:0;">&nbsp;</td>
      ${smallMetricCard("Interview", workflowCounts.interview, workflowCounts.interview > 0 ? C.blueText : C.textPrimary)}
    </tr>
  </table>
</td></tr>

<!-- ── APPLY NOW ── -->
${applyNowSection}

<!-- ── TRACKED RECENTLY ── -->
${trackedRecentlySection}

<!-- ── FOLLOW-UPS ── -->
${followupsSection}

<!-- ── FOOTER ── -->
${divider()}
<tr><td style="padding:24px 0 0;text-align:center;">
  <p style="margin:0;font-size:12px;color:${C.textTertiary};font-family:${FONT};">job-hunt-os &middot; scanned ${h(sourcesScanned)} sources &middot; ${h(totalTracked)} roles tracked</p>
  ${dashboardHomeUrl
    ? `<p style="margin:10px 0 0;font-size:13px;font-family:${FONT};"><a href="${h(dashboardHomeUrl)}" style="color:${C.blueText};text-decoration:none;font-weight:600;">View dashboard &rarr;</a></p>`
    : ""}
</td></tr>

</table>

</td></tr>
</table>

</body>
</html>`;
}
