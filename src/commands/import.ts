import { Command } from "commander";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { loadProfile } from "../config/profile";
import { initDb } from "../db";
import { completeScan, createScan, upsertJob, upsertJobSource } from "../db/repositories";
import { normalizeCompanyFallback, NormalizedOpportunity, toJobUpsertInput } from "../ingest/normalize";
import { scoreOpportunity } from "../score/scorer";
import type { YcCompany } from "../ingest/yc";

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || value.trim() === "") return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return (JSON.parse(trimmed) as unknown[]).map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
  return trimmed
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const importedJobSchema = z.object({
  company_name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  role_url: z.string().optional(),
  job_url: z.string().optional(),
  location: z.string().optional(),
  locations: z.union([z.string(), z.array(z.string())]).optional(),
  remote_flag: z.union([z.boolean(), z.string(), z.number()]).optional(),
  seniority_hint: z.string().optional(),
  compensation_min: z.union([z.number(), z.string()]).optional(),
  compensation_max: z.union([z.number(), z.string()]).optional(),
  compensation_currency: z.string().optional(),
  compensation_period: z.string().optional(),
  extracted_skills: z.union([z.array(z.string()), z.string()]).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  industries: z.union([z.array(z.string()), z.string()]).optional(),
  website: z.string().optional(),
  source_url: z.string().optional(),
  external_id: z.string().optional(),
  stage: z.string().optional(),
  batch: z.string().optional(),
  team_size: z.union([z.number(), z.string()]).optional(),
  top_company: z.union([z.boolean(), z.string(), z.number()]).optional(),
  is_hiring: z.union([z.boolean(), z.string(), z.number()]).optional(),
});

type ImportedJobRow = z.infer<typeof importedJobSchema>;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function loadRowsFromCsv(filePath: string): unknown[] {
  const text = fs.readFileSync(filePath, "utf-8").trim();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}

function loadRows(filePath: string, format?: string): unknown[] {
  const ext = format ?? path.extname(filePath).slice(1).toLowerCase();
  if (ext === "json") {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(data)) {
      throw new Error("Imported JSON must be an array of role records.");
    }
    return data;
  }
  if (ext === "csv") {
    return loadRowsFromCsv(filePath);
  }
  throw new Error(`Unsupported import format: ${ext}. Use csv or json.`);
}

function toYcLikeCompany(row: ImportedJobRow): YcCompany {
  const companyName = row.company_name;
  return {
    name: companyName,
    slug: slugify(companyName),
    small_logo_thumb_url: "",
    website: row.website ?? row.source_url ?? row.job_url ?? row.role_url ?? "",
    all_locations: typeof row.location === "string" ? row.location : Array.isArray(row.locations) ? row.locations.join("; ") : typeof row.locations === "string" ? row.locations : "",
    long_description: row.description ?? "",
    one_liner: row.description ?? row.title ?? "",
    team_size: parseNumber(row.team_size),
    industry: "Imported",
    subindustry: "Imported -> Manual",
    tags: parseArray(row.tags),
    top_company: parseBoolean(row.top_company),
    isHiring: parseBoolean(row.is_hiring, true),
    batch: row.batch ?? "Imported",
    status: "Active",
    industries: parseArray(row.industries),
    regions: parseBoolean(row.remote_flag) ? ["Remote"] : [],
    stage: row.stage ?? "Imported",
    url: row.source_url ?? row.job_url ?? row.role_url ?? row.website ?? "",
  };
}

function toImportedOpportunity(row: ImportedJobRow, company: YcCompany): NormalizedOpportunity {
  const title = row.title ?? "Imported Role";
  const location =
    (typeof row.location === "string" && row.location) ||
    (Array.isArray(row.locations) ? row.locations.join("; ") : row.locations) ||
    company.all_locations;
  const externalId = row.external_id ?? `${slugify(company.name)}:${slugify(title)}:${slugify(location ?? "role")}`;
  return {
    externalKey: `manual:${externalId}`,
    roleExternalId: externalId,
    roleSource: "imported_role",
    title,
    summary: row.description ?? company.one_liner ?? "",
    locations: location ?? "",
    remoteFlag: parseBoolean(row.remote_flag),
    jobUrl: row.job_url ?? row.role_url ?? row.source_url ?? company.url,
    seniorityHint: row.seniority_hint ?? null,
    compensationMin: parseNumber(row.compensation_min) ?? null,
    compensationMax: parseNumber(row.compensation_max) ?? null,
    compensationCurrency: row.compensation_currency ?? null,
    compensationPeriod: row.compensation_period ?? null,
    extractedSkills: parseArray(row.extracted_skills),
  };
}

export async function runImportCommand(filePath: string, format?: string): Promise<{
  rawCount: number;
  validCount: number;
  imported: number;
}> {
  const db = initDb();
  const profile = loadProfile();
  const absolute = path.resolve(filePath);
  const rows = loadRows(absolute, format);
  const scanId = createScan(db, "manual", new Date().toISOString());

  let validCount = 0;
  let imported = 0;

  const transaction = db.transaction((items: unknown[]) => {
    for (const raw of items) {
      const parsed = importedJobSchema.safeParse(raw);
      if (!parsed.success) continue;
      validCount += 1;
      const company = toYcLikeCompany(parsed.data);
      const opportunity = toImportedOpportunity(parsed.data, company);
      const scoring = scoreOpportunity(company, opportunity, profile);
      const sourceId = upsertJobSource(db, {
        provider: "manual",
        externalId: parsed.data.external_id ?? company.slug,
        url: opportunity.jobUrl || company.url || company.website,
      });
      upsertJob(db, toJobUpsertInput(company, opportunity, sourceId, scanId, scoring));
      imported += 1;
    }
  });

  transaction(rows);
  completeScan(db, scanId, rows.length, validCount, new Date().toISOString());

  return { rawCount: rows.length, validCount, imported };
}

export function registerImportCommand(): Command {
  return new Command("import")
    .description("Import role-level jobs from CSV or JSON")
    .argument("<file>", "path to CSV or JSON file")
    .option("--format <format>", "csv or json; defaults from file extension")
    .action(async (file: string, opts: { format?: string }) => {
      const result = await runImportCommand(file, opts.format);
      console.log(`Import complete. Raw ${result.rawCount} | Valid ${result.validCount} | Imported ${result.imported}`);
    });
}
