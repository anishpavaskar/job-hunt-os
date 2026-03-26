import { Command } from "commander";
import { GREENHOUSE_COMPANIES } from "../../config/greenhouse-companies";
import { LEVER_COMPANIES } from "../../config/lever-companies";
import { loadProfile } from "../config/profile";
import { initDb } from "../db";
import {
  completeScan,
  createScan,
  getExistingJobExternalKeys,
  upsertJob,
  upsertJobSource,
} from "../db/repositories";
import {
  NormalizedOpportunity,
  normalizeCompanyFallback,
  normalizeRoleOpportunity,
  toJobUpsertInput,
} from "../ingest/normalize";
import { fetchGreenhouseJobs } from "../ingest/greenhouse";
import { fetchLeverJobs } from "../ingest/lever";
import { fetchYcCompanies, FetchCompaniesResult, ycRoleSchema, YcCompany } from "../ingest/yc";
import { getOpportunityScoreDebug, scoreOpportunity, sortCompanies } from "../score/scorer";

export type ScanSource = "all" | "yc" | "greenhouse" | "lever";

interface ScanOptions {
  source?: ScanSource;
  slugAudit?: boolean;
  scoreDebug?: string[];
  logger?: Pick<Console, "log">;
}

interface ProviderOpportunity {
  provider: Exclude<ScanSource, "all">;
  sourceExternalId: string;
  sourceUrl: string;
  company: YcCompany;
  opportunity: NormalizedOpportunity;
}

interface ProviderCounts {
  rawCount: number;
  validCount: number;
  totalRoles: number;
  deduped: number;
  upserted: number;
  newCount: number;
  scored80Plus: number;
  roleCount: number;
  failed?: boolean;
}

export interface ScanDeps {
  fetchCompanies?: () => Promise<FetchCompaniesResult>;
  fetchYcCompanies?: () => Promise<FetchCompaniesResult>;
  fetchGreenhouseJobs?: () => Promise<NormalizedOpportunity[]>;
  fetchLeverJobs?: () => Promise<NormalizedOpportunity[]>;
}

interface ScoredProviderOpportunity {
  item: ProviderOpportunity;
  scoring: ReturnType<typeof scoreOpportunity>;
  isNew: boolean;
}

function uniqueByExternalKey(items: ProviderOpportunity[]): ProviderOpportunity[] {
  const seen = new Set<string>();
  const output: ProviderOpportunity[] = [];

  for (const item of items) {
    if (seen.has(item.opportunity.externalKey)) continue;
    seen.add(item.opportunity.externalKey);
    output.push(item);
  }

  return output;
}

function buildExternalCompany(
  provider: "greenhouse" | "lever",
  slug: string,
  name: string,
  opportunity: NormalizedOpportunity,
): YcCompany {
  return {
    name,
    slug,
    small_logo_thumb_url: "",
    website: opportunity.jobUrl,
    all_locations: opportunity.locations,
    long_description: opportunity.summary,
    one_liner: opportunity.summary,
    team_size: undefined,
    industry: provider,
    subindustry: `${provider} role`,
    tags: opportunity.extractedSkills,
    top_company: false,
    isHiring: true,
    batch: "External",
    status: "Active",
    industries: [],
    regions: opportunity.remoteFlag ? ["Remote"] : [],
    stage: "External",
    url: opportunity.jobUrl,
  };
}

function extractSlugFromExternalKey(externalKey: string): string {
  const parts = externalKey.split(":");
  return parts.length >= 3 ? parts[1] : parts[0];
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function collectYcOpportunities(
  fetchCompanies: () => Promise<FetchCompaniesResult>,
): Promise<{ rawCount: number; validCount: number; opportunities: ProviderOpportunity[]; roleCount: number }> {
  const { rawCount, companies } = await fetchCompanies();
  const sortedCompanies = sortCompanies(
    companies.map((company) => ({ ...company, score: company.top_company ? 1 : 0 })),
  );

  const opportunities: ProviderOpportunity[] = [];
  let roleCount = 0;

  for (const company of sortedCompanies) {
    const candidateRoles = [
      ...(Array.isArray(company.roles) ? company.roles : []),
      ...(Array.isArray(company.jobs) ? company.jobs : []),
      ...(Array.isArray(company.openings) ? company.openings : []),
    ]
      .map((role) => ycRoleSchema.safeParse(role))
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter((role) => role.title || role.description || role.url || role.job_url || role.apply_url);

    if (candidateRoles.length > 0) {
      candidateRoles.forEach((role, index) => {
        opportunities.push({
          provider: "yc",
          sourceExternalId: company.slug,
          sourceUrl: company.url,
          company,
          opportunity: normalizeRoleOpportunity(company, role, index),
        });
      });
      roleCount += candidateRoles.length;
    } else {
      opportunities.push({
        provider: "yc",
        sourceExternalId: company.slug,
        sourceUrl: company.url,
        company,
        opportunity: normalizeCompanyFallback(company),
      });
    }
  }

  return {
    rawCount,
    validCount: companies.length,
    opportunities,
    roleCount,
  };
}

async function collectExternalOpportunities(
  provider: "greenhouse" | "lever",
  items: NormalizedOpportunity[],
  namesBySlug: Map<string, string>,
): Promise<{ rawCount: number; validCount: number; opportunities: ProviderOpportunity[]; roleCount: number }> {
  const opportunities = items.map((opportunity) => {
    const slug = extractSlugFromExternalKey(opportunity.externalKey);
    const companyName = namesBySlug.get(slug) ?? humanizeSlug(slug);
    return {
      provider,
      sourceExternalId: slug,
      sourceUrl: opportunity.jobUrl,
      company: buildExternalCompany(provider, slug, companyName, opportunity),
      opportunity,
    };
  });

  return {
    rawCount: items.length,
    validCount: items.length,
    opportunities,
    roleCount: items.length,
  };
}

export async function runScanCommand(
  optsOrDeps: ScanOptions | ScanDeps = {},
  depsArg: ScanDeps = {},
): Promise<{
  activeSources: number;
  rawCount: number;
  validCount: number;
  upserted: number;
  updatedCount: number;
  roleCount: number;
  newCount: number;
  scored80Plus: number;
  sourceCounts: Record<string, ProviderCounts>;
}> {
  const deps = ("fetchCompanies" in optsOrDeps || "fetchYcCompanies" in optsOrDeps || "fetchGreenhouseJobs" in optsOrDeps || "fetchLeverJobs" in optsOrDeps)
    ? optsOrDeps as ScanDeps
    : depsArg;
  const opts = ("source" in optsOrDeps || "slugAudit" in optsOrDeps || "scoreDebug" in optsOrDeps || "logger" in optsOrDeps)
    ? optsOrDeps as ScanOptions
    : {};
  const db = initDb();
  const startedAt = new Date().toISOString();
  const profile = loadProfile();
  const selectedSource = opts.source ?? "all";
  const logger = opts.logger ?? console;
  const scoreDebugSelectors = opts.scoreDebug ?? [];
  const activeSources = selectedSource === "all"
    ? (["yc", "greenhouse", "lever"] as Array<Exclude<ScanSource, "all">>)
    : [selectedSource];

  const sourceCounts: Record<string, ProviderCounts> = {};
  const scanIds: Partial<Record<Exclude<ScanSource, "all">, number>> = {};
  const groupedOpportunities: Record<string, ProviderOpportunity[]> = {
    yc: [],
    greenhouse: [],
    lever: [],
  };

  for (const provider of activeSources) {
    const scanId = createScan(db, provider, startedAt);
    scanIds[provider] = scanId;

    try {
      if (provider === "yc") {
        const fetchCompanies = deps.fetchYcCompanies ?? deps.fetchCompanies ?? (() => fetchYcCompanies());
        const result = await collectYcOpportunities(fetchCompanies);
        groupedOpportunities.yc = result.opportunities;
        sourceCounts.yc = {
          rawCount: result.rawCount,
          validCount: result.validCount,
          totalRoles: result.opportunities.length,
          deduped: 0,
          upserted: 0,
          newCount: 0,
          scored80Plus: 0,
          roleCount: result.roleCount,
        };
        completeScan(db, scanId, result.rawCount, result.validCount, new Date().toISOString(), sourceCounts.yc);
        continue;
      }

      if (provider === "greenhouse") {
        const fetchJobs = deps.fetchGreenhouseJobs ?? (() => fetchGreenhouseJobs(
          GREENHOUSE_COMPANIES,
          globalThis.fetch,
          opts.slugAudit
            ? {
              audit: ({ slug, httpResult, jobsReturned }) => {
                logger.log(`[slug-audit][greenhouse] configured_slug=${slug} http=${httpResult} jobs=${jobsReturned}`);
              },
            }
            : {},
        ));
        const result = await collectExternalOpportunities(
          "greenhouse",
          await fetchJobs(),
          new Map(GREENHOUSE_COMPANIES.map((company) => [company.slug, company.name])),
        );
        groupedOpportunities.greenhouse = result.opportunities;
        sourceCounts.greenhouse = {
          rawCount: result.rawCount,
          validCount: result.validCount,
          totalRoles: result.opportunities.length,
          deduped: 0,
          upserted: 0,
          newCount: 0,
          scored80Plus: 0,
          roleCount: result.roleCount,
        };
        completeScan(db, scanId, result.rawCount, result.validCount, new Date().toISOString(), sourceCounts.greenhouse);
        continue;
      }

      const fetchJobs = deps.fetchLeverJobs ?? (() => fetchLeverJobs(
        LEVER_COMPANIES,
        globalThis.fetch,
        opts.slugAudit
          ? {
            audit: ({ slug, httpResult, jobsReturned }) => {
              logger.log(`[slug-audit][lever] configured_slug=${slug} http=${httpResult} jobs=${jobsReturned}`);
            },
          }
          : {},
      ));
      const result = await collectExternalOpportunities(
        "lever",
        await fetchJobs(),
        new Map(LEVER_COMPANIES.map((company) => [company.slug, company.name])),
      );
      groupedOpportunities.lever = result.opportunities;
      sourceCounts.lever = {
        rawCount: result.rawCount,
        validCount: result.validCount,
        totalRoles: result.opportunities.length,
        deduped: 0,
        upserted: 0,
        newCount: 0,
        scored80Plus: 0,
        roleCount: result.roleCount,
      };
      completeScan(db, scanId, result.rawCount, result.validCount, new Date().toISOString(), sourceCounts.lever);
    } catch (error) {
      const warning = `[scan] ${provider} failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(warning);
      sourceCounts[provider] = {
        rawCount: 0,
        validCount: 0,
        totalRoles: 0,
        deduped: 0,
        upserted: 0,
        newCount: 0,
        scored80Plus: 0,
        roleCount: 0,
        failed: true,
      };
      completeScan(db, scanId, 0, 0, new Date().toISOString(), sourceCounts[provider]);
    }
  }

  const combined = uniqueByExternalKey(
    activeSources.flatMap((provider) => groupedOpportunities[provider]),
  );
  const existingKeys = getExistingJobExternalKeys(
    db,
    combined.map((item) => item.opportunity.externalKey),
  );

  const scoredItems: ScoredProviderOpportunity[] = combined.map((item) => ({
    item,
    scoring: scoreOpportunity(item.company, item.opportunity, profile),
    isNew: !existingKeys.has(item.opportunity.externalKey),
  }));

  const shouldLogScoreDebug = (item: ProviderOpportunity): boolean => {
    if (scoreDebugSelectors.length === 0) return false;
    const haystacks = [
      item.company.name,
      item.opportunity.title ?? "",
      item.opportunity.externalKey,
      item.sourceExternalId,
    ].map((value) => value.toLowerCase());
    return scoreDebugSelectors.some((selector) => haystacks.some((haystack) => haystack.includes(selector.toLowerCase())));
  };

  const transaction = db.transaction((items: ScoredProviderOpportunity[]) => {
    for (const { item, scoring } of items) {
      const sourceId = upsertJobSource(db, {
        provider: item.provider,
        externalId: item.sourceExternalId,
        url: item.sourceUrl,
      });

      upsertJob(db, toJobUpsertInput(item.company, item.opportunity, sourceId, scanIds[item.provider] ?? 0, scoring));
    }
  });

  const itemsByProvider = new Map<string, ScoredProviderOpportunity[]>();
  scoredItems.forEach((item) => {
    const existing = itemsByProvider.get(item.item.provider) ?? [];
    existing.push(item);
    itemsByProvider.set(item.item.provider, existing);
  });

  activeSources.forEach((provider) => {
    const providerItems = itemsByProvider.get(provider) ?? [];
    let providerNew = 0;
    let provider80 = 0;

    providerItems.forEach((item) => {
      if (item.isNew) providerNew += 1;
      if (item.scoring.score >= 80) provider80 += 1;
    });

    const counts = sourceCounts[provider];
    counts.deduped = providerItems.length;
    counts.upserted = providerItems.length;
    counts.newCount = providerNew;
    counts.scored80Plus = provider80;
  });

  const upserted = scoredItems.length;
  const newCount = scoredItems.filter((item) => item.isNew).length;
  const updatedCount = upserted - newCount;
  const scored80Plus = scoredItems.filter((item) => item.scoring.score >= 80).length;
  const roleCount = scoredItems.filter((item) => item.item.opportunity.roleSource !== "company_fallback").length;

  scoredItems
    .filter(({ item }) => shouldLogScoreDebug(item))
    .forEach(({ item, scoring }) => {
      const debug = getOpportunityScoreDebug(item.company, item.opportunity, profile);
      logger.log(`[score-debug] ${item.company.name} | ${item.opportunity.title ?? "(General)"} | ${item.opportunity.externalKey}`);
      logger.log(`  extracted text: ${debug.extractedText || "(empty)"}`);
      logger.log(`  extracted skills: ${debug.extractedSkills.join(", ") || "(none)"}`);
      logger.log(`  matched profile signals: ${JSON.stringify(debug.matchedProfileSignals)}`);
      logger.log(`  score breakdown: ${JSON.stringify({ ...scoring.breakdown, total: scoring.score })}`);
    });

  transaction(scoredItems);

  for (const provider of activeSources) {
    const scanId = scanIds[provider];
    if (!scanId) continue;
    completeScan(
      db,
      scanId,
      sourceCounts[provider].rawCount,
      sourceCounts[provider].validCount,
      new Date().toISOString(),
      sourceCounts[provider],
    );
  }

  return {
    activeSources: activeSources.length,
    rawCount: activeSources.reduce((sum, provider) => sum + (sourceCounts[provider]?.rawCount ?? 0), 0),
    validCount: activeSources.reduce((sum, provider) => sum + (sourceCounts[provider]?.validCount ?? 0), 0),
    upserted,
    updatedCount,
    roleCount,
    newCount,
    scored80Plus,
    sourceCounts,
  };
}

function collectListOption(value: string, previous: string[]): string[] {
  return previous.concat(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function registerScanCommand(): Command {
  return new Command("scan")
    .description("Fetch jobs from YC, Greenhouse, and Lever, score them, and persist them to SQLite")
    .option("--source <source>", "yc, greenhouse, lever, or all", "all")
    .option("--slug-audit", "print configured slug, HTTP result, and jobs returned for Greenhouse and Lever")
    .option(
      "--score-debug <selector>",
      "print scoring internals for matching jobs; repeat or comma-separate values",
      collectListOption,
      [],
    )
    .action(async (opts: { source?: ScanSource; slugAudit?: boolean; scoreDebug?: string[] }) => {
      const source = (opts.source ?? "all") as ScanSource;
      if (!["all", "yc", "greenhouse", "lever"].includes(source)) {
        throw new Error(`Unsupported source "${opts.source}". Use yc, greenhouse, lever, or all.`);
      }

      const result = await runScanCommand({ source, slugAudit: opts.slugAudit, scoreDebug: opts.scoreDebug });
      console.log(
        `Scanned ${result.activeSources} sources. ${result.upserted} upserted. ${result.newCount} new. ${result.updatedCount} updated. ${result.scored80Plus} scored 80+.`,
      );
    });
}
