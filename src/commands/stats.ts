import { Command } from "commander";
import { initDb } from "../db";
import { getConversionStats, getScoreRangeStats, getSourceStats } from "../db/repositories";

function percent(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function runStatsCommand(): string {
  const db = initDb();
  const conversion = getConversionStats(db);
  const scoreRanges = getScoreRangeStats(db);
  const sources = getSourceStats(db);

  const lines: string[] = [];
  lines.push("Conversion Funnel");
  lines.push(`saved: ${conversion.saved}`);
  lines.push(`applied: ${conversion.applied} (${percent(conversion.applied, conversion.saved)})`);
  lines.push(`replied: ${conversion.replied} (${percent(conversion.replied, conversion.applied)})`);
  lines.push(`interview: ${conversion.interview} (${percent(conversion.interview, conversion.replied)})`);
  lines.push("");
  lines.push("By Score Range");
  for (const row of scoreRanges) {
    lines.push(
      `${row.range}: total=${row.total}, applied=${row.applied}, replied=${row.replied}, interview=${row.interview}`,
    );
  }
  lines.push("");
  lines.push("By Source");
  for (const row of sources) {
    lines.push(
      `${row.source}: total=${row.total}, applied=${row.applied}, replied=${row.replied}, interview=${row.interview}`,
    );
  }
  return lines.join("\n");
}

export function registerStatsCommand(): Command {
  return new Command("stats")
    .description("Show job hunt conversion rates and analytics")
    .action(() => {
      console.log(runStatsCommand());
    });
}
