import { Command } from "commander";
import { loadProfile } from "../config/profile";
import { Profile } from "../config/types";
import { initDb } from "../db";
import { listNextActions } from "../db/repositories";
import { NextActionRecord } from "../db/types";

function actionLabel(type: "followup" | "send_draft" | "apply"): string {
  switch (type) {
    case "followup":
      return "follow up";
    case "send_draft":
      return "send draft";
    case "apply":
      return "apply";
  }
}

function containsCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function matchBulletPriority(bullet: string): number {
  const normalized = bullet.toLowerCase();
  if (
    normalized.includes("matches target roles:")
    || normalized.includes("matched skills:")
    || normalized.includes("matched practices:")
    || normalized.includes("role fit")
    || normalized.includes("stack aligns")
    || normalized.includes("target role")
  ) {
    return 0;
  }
  if (
    normalized.includes("aligned preferences:")
    || normalized.includes("remote")
    || normalized.includes("healthcare")
    || normalized.includes("hybrid")
  ) {
    return 2;
  }
  return 1;
}

function buildWhyItsAMatch(action: NextActionRecord, profile?: Profile): string[] {
  const fallbackBullets = [...action.whyMatch].sort((left, right) => {
    const priorityDiff = matchBulletPriority(left) - matchBulletPriority(right);
    if (priorityDiff !== 0) return priorityDiff;
    return left.localeCompare(right);
  });

  if (!profile) {
    return fallbackBullets;
  }

  const text = [
    action.title,
    action.summary,
    action.locations,
    action.tags.join(" "),
    action.industries.join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const bullets: string[] = [];

  const matchedRoles = (profile.target_roles ?? []).filter((role) => containsCI(text, role)).slice(0, 2);
  if (matchedRoles.length > 0) {
    bullets.push(`Matches target roles: ${matchedRoles.join(", ")}`);
  }

  const skillPool = [...profile.skills_tier1, ...profile.skills_tier2];
  const matchedSkills = skillPool.filter((skill) =>
    action.extractedSkills.some((extracted) => extracted.toLowerCase() === skill.toLowerCase()),
  ).slice(0, 4);
  if (matchedSkills.length > 0) {
    bullets.push(`Matched skills: ${matchedSkills.join(", ")}`);
  }

  const matchedPractices = (profile.practices ?? []).filter((practice) => containsCI(text, practice)).slice(0, 2);
  if (matchedPractices.length > 0) {
    bullets.push(`Matched practices: ${matchedPractices.join(", ")}`);
  }

  for (const bullet of fallbackBullets) {
    if (matchBulletPriority(bullet) > 1) continue;
    if (bullets.includes(bullet)) continue;
    if (bullets.length >= 2) break;
    bullets.push(bullet);
  }

  const preferenceSignals: string[] = [];
  if (profile.preferences?.remote && action.remoteFlag) {
    preferenceSignals.push("remote");
  }
  if (profile.preferences?.healthcare && action.industries.some((industry) => /health/i.test(industry))) {
    preferenceSignals.push("healthcare");
  }
  if (profile.preferences?.early_stage && action.stage === "Early") {
    preferenceSignals.push("early-stage");
  }
  if (profile.preferences?.hybrid && /san francisco|san jose|palo alto|mountain view|sunnyvale|santa clara|milpitas/i.test(action.locations)) {
    preferenceSignals.push("Bay Area hybrid");
  }
  if (preferenceSignals.length > 0) {
    bullets.push(`Aligned preferences: ${preferenceSignals.join(", ")}`);
  }

  if (bullets.length > 0) {
    return bullets.slice(0, 3);
  }

  return fallbackBullets;
}

export function runTodayCommand(opts: { limit?: string } = {}): string[] {
  const db = initDb();
  const profile = loadProfile();
  const parsedLimit = parseInt(opts.limit ?? "10", 10);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 10;
  const actions = listNextActions(db, limit);

  return actions.map((action, index) => {
    const title = action.title ? ` - ${action.title}` : "";
    const due = action.dueAt ? ` | due ${action.dueAt}` : "";
    const breakdown = action.scoreBreakdown;
    const whyMatchBullets = buildWhyItsAMatch(action, profile);
    const whyMatch = whyMatchBullets.length > 0
      ? `\n  why it's a match: ${whyMatchBullets.join("; ")}`
      : "";
    const risk = action.risk ? `\n  risk: ${action.risk}` : "";
    return [
      `#${index + 1} [${action.score}] ${action.companyName}${title} | ${actionLabel(action.actionType)}${due}`,
      `  score details: role ${breakdown.roleFit}, stack ${breakdown.stackFit}, seniority ${breakdown.seniorityFit}, freshness ${breakdown.freshness}, company ${breakdown.companySignal}`,
      `  reason: ${action.reason}`,
      whyMatch ? whyMatch.trimEnd() : null,
      risk ? risk.trimEnd() : null,
      `  next step: ${action.nextStep}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
}

export function registerTodayCommand(): Command {
  return new Command("today")
    .alias("next")
    .description("Show the best actions to take right now across jobs, drafts, and follow-ups")
    .option("--limit <number>", "max actions to show", "10")
    .action((opts: { limit?: string }) => {
      const lines = runTodayCommand(opts);
      if (lines.length === 0) {
        console.log("No high-priority actions right now.");
        return;
      }
      for (const line of lines) console.log(line);
    });
}
