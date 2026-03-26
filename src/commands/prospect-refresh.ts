import { Command } from "commander";
import { refreshProspectCompanies } from "../ingest/prospect";

export async function runProspectRefreshCommand(): Promise<string> {
  const result = await refreshProspectCompanies();
  if (result.warning) {
    return `Prospect refresh skipped. ${result.warning}`;
  }
  return `Prospect refresh complete. ${result.count} companies saved.`;
}

export function registerProspectRefreshCommand(): Command {
  return new Command("prospect-refresh")
    .description("Refresh the Prospect company signal dataset from joinprospect.com/explore")
    .action(async () => {
      console.log(await runProspectRefreshCommand());
    });
}
