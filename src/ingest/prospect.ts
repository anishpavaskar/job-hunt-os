import fs from "fs";
import path from "path";

export interface ProspectCompany {
  name: string;
  industry: string;
  prospect_url: string;
}

const STRIP_SUFFIX_RE = /\b(inc|inc\.|co|co\.|corp|corp\.|corporation|company|ltd|llc|labs|lab|technologies|technology|tech|systems|group|holdings)\b/g;

export function getProspectCompaniesPath(cwd = process.cwd()): string {
  return path.join(cwd, "data", "prospect-companies.json");
}

function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(STRIP_SUFFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadProspectCompanies(cwd = process.cwd()): ProspectCompany[] {
  const filePath = getProspectCompaniesPath(cwd);
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is ProspectCompany => {
      return Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as ProspectCompany).name === "string" &&
          typeof (item as ProspectCompany).industry === "string" &&
          typeof (item as ProspectCompany).prospect_url === "string",
      );
    });
  } catch {
    return [];
  }
}

export function getProspectMatch(companyName: string, cwd = process.cwd()): ProspectCompany | null {
  const normalizedTarget = normalizeCompanyName(companyName);
  if (!normalizedTarget) return null;

  for (const company of loadProspectCompanies(cwd)) {
    const normalizedCandidate = normalizeCompanyName(company.name);
    if (!normalizedCandidate) continue;
    if (
      normalizedTarget === normalizedCandidate ||
      normalizedTarget.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedTarget)
    ) {
      return company;
    }
  }

  return null;
}

export function isProspectCompany(companyName: string, cwd = process.cwd()): boolean {
  return getProspectMatch(companyName, cwd) !== null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeCompanies(companies: ProspectCompany[]): ProspectCompany[] {
  const seen = new Set<string>();
  const output: ProspectCompany[] = [];

  for (const company of companies) {
    const key = normalizeCompanyName(company.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(company);
  }

  return output.sort((left, right) => left.name.localeCompare(right.name));
}

export function parseProspectCompaniesFromHtml(html: string): ProspectCompany[] {
  const companies: ProspectCompany[] = [];
  const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1];
    const anchorText = stripHtml(match[2]);
    if (!anchorText || !/Industry/i.test(anchorText)) continue;
    if (!/Learn more/i.test(anchorText)) continue;

    const repeatedNameMatch = anchorText.match(/^(.+?)\s+\1(?:['’]s|\b)/i);
    const nameMatch = repeatedNameMatch ?? anchorText.match(/^(.+?)\s+Industry\s+/i);
    const industryMatch = anchorText.match(/\sIndustry\s+(.+?)\s+Learn more$/i);
    if (!nameMatch || !industryMatch) continue;

    const name = nameMatch[1].trim();
    const industry = industryMatch[1].trim();
    if (!name || !industry) continue;

    const prospectUrl = href.startsWith("http") ? href : `https://www.joinprospect.com${href}`;
    companies.push({ name, industry, prospect_url: prospectUrl });
  }

  return dedupeCompanies(companies);
}

export async function refreshProspectCompanies(cwd = process.cwd()): Promise<{
  updated: boolean;
  count: number;
  warning?: string;
}> {
  const filePath = getProspectCompaniesPath(cwd);
  const existing = loadProspectCompanies(cwd);

  try {
    const response = await fetch("https://www.joinprospect.com/explore");
    if (!response.ok) {
      return {
        updated: false,
        count: existing.length,
        warning: `Prospect responded with HTTP ${response.status}. Keeping existing prospect-companies.json.`,
      };
    }

    const html = await response.text();
    const parsed = parseProspectCompaniesFromHtml(html);
    if (parsed.length === 0) {
      return {
        updated: false,
        count: existing.length,
        warning: "Prospect page structure was not parsed successfully. Keeping existing prospect-companies.json.",
      };
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
    return { updated: true, count: parsed.length };
  } catch (error) {
    return {
      updated: false,
      count: existing.length,
      warning: `Failed to refresh Prospect companies: ${error instanceof Error ? error.message : String(error)}. Keeping existing prospect-companies.json.`,
    };
  }
}
