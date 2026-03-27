export interface CareerPage {
  name: string;
  slug: string;
  careersUrl: string;
  /** CSS-style selector hint, or "auto" for best-effort extraction */
  selector: string;
}

// Planet Labs omitted for now: the page loads, but current extraction only finds a "Planet Federal" careers link, not job postings.
// xAI omitted for now: https://x.ai/careers returned a live Cloudflare 403 page during verification.
// Apple omitted for now: the page loads, but current extraction only finds careers/navigation links, not job postings.
// Google omitted for now: the page loads, but current extraction only finds careers/legal links, not job postings.
// Amazon omitted for now: the page loads, but current extraction returns no roles with the current best-effort scraper.
export const CAREER_PAGES: CareerPage[] = [
  { name: "Microsoft", slug: "microsoft", careersUrl: "https://careers.microsoft.com/professionals/us/en/l-bayarea", selector: "auto" },
];
