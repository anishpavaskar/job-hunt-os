import { Command } from "commander";
import { CAREER_PAGES } from "../../config/career-pages";
import { scrapeAllCareerPages, type CareersScrapeResult } from "../ingest/careers";

export function registerScanCareersCommand(): Command {
  return new Command("scan:careers")
    .description("Scrape career pages for companies without Greenhouse/Lever APIs (experimental)")
    .action(async () => {
      console.log(`[scan:careers] Scraping ${CAREER_PAGES.length} career pages...`);

      const results = await scrapeAllCareerPages(CAREER_PAGES);

      let totalRoles = 0;
      for (const result of results) {
        printResult(result);
        totalRoles += result.roles.length;
      }

      console.log(`\n[scan:careers] Done. Found ${totalRoles} roles across ${results.length} pages.`);
      if (totalRoles > 0) {
        console.log("[scan:careers] Review the output above. To persist these, use `npm run import` with the generated data.");
      }
    });
}

function printResult(result: CareersScrapeResult): void {
  const { company, roles, strategy } = result;
  const label = `${company.name} (${company.careersUrl})`;

  if (roles.length === 0) {
    console.log(`\n  ${label}`);
    console.log(`    strategy: ${strategy} | roles: 0`);
    return;
  }

  console.log(`\n  ${label}`);
  console.log(`    strategy: ${strategy} | roles: ${roles.length}`);
  for (const role of roles.slice(0, 10)) {
    const loc = role.locations ? ` | ${role.locations}` : "";
    const seniority = role.seniorityHint ? ` [${role.seniorityHint}]` : "";
    console.log(`      - ${role.title}${seniority}${loc}`);
    console.log(`        ${role.jobUrl}`);
  }
  if (roles.length > 10) {
    console.log(`      ... and ${roles.length - 10} more`);
  }
}
