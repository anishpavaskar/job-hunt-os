import fs from "fs";
import path from "path";
import { z } from "zod";

export const ycCompanySchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    small_logo_thumb_url: z.string(),
    website: z.string(),
    all_locations: z.string().default(""),
    long_description: z.string().default(""),
    one_liner: z.string().default(""),
    team_size: z.number().optional(),
    industry: z.string(),
    subindustry: z.string(),
    tags: z.array(z.string()).default([]),
    top_company: z.boolean(),
    isHiring: z.boolean(),
    batch: z.string(),
    status: z.string(),
    industries: z.array(z.string()).default([]),
    regions: z.array(z.string()).default([]),
    stage: z.string(),
    url: z.string(),
    api: z.string().optional(),
    roles: z.array(z.unknown()).optional(),
    jobs: z.array(z.unknown()).optional(),
    openings: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type YcCompany = z.infer<typeof ycCompanySchema>;

export const ycRoleSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    locations: z.union([z.string(), z.array(z.string())]).optional(),
    remote: z.boolean().optional(),
    remote_ok: z.boolean().optional(),
    remote_allowed: z.boolean().optional(),
    url: z.string().optional(),
    job_url: z.string().optional(),
    apply_url: z.string().optional(),
    salary_min: z.number().optional(),
    salary_max: z.number().optional(),
    min_salary: z.number().optional(),
    max_salary: z.number().optional(),
    compensation_min: z.number().optional(),
    compensation_max: z.number().optional(),
    compensation_currency: z.string().optional(),
    compensation_period: z.string().optional(),
    seniority: z.string().optional(),
    seniority_hint: z.string().optional(),
    level: z.string().optional(),
    experience: z.string().optional(),
  })
  .passthrough();

export type YcRole = z.infer<typeof ycRoleSchema>;

const API_URL = "https://yc-oss.github.io/api/companies/hiring.json";

export interface FetchCompaniesResult {
  rawCount: number;
  companies: YcCompany[];
}

export async function fetchYcCompanies(cwd = process.cwd()): Promise<FetchCompaniesResult> {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`YC API responded with HTTP ${response.status} (${response.statusText})`);
  }

  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) {
    throw new Error(`Expected an array from ${API_URL}, got ${typeof raw}`);
  }

  const dataDir = path.join(cwd, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "yc_hiring_raw.json"), JSON.stringify(raw, null, 2));

  const companies: YcCompany[] = [];
  for (const item of raw) {
    const result = ycCompanySchema.safeParse(item);
    if (result.success) companies.push(result.data);
  }

  return { rawCount: raw.length, companies };
}
