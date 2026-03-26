export interface CareerPage {
  name: string;
  slug: string;
  careersUrl: string;
  /** CSS-style selector hint, or "auto" for best-effort extraction */
  selector: string;
}

export const CAREER_PAGES: CareerPage[] = [
  { name: "Planet Labs", slug: "planet", careersUrl: "https://www.planet.com/company/careers/", selector: "auto" },
  { name: "xAI", slug: "xai", careersUrl: "https://x.ai/careers", selector: "auto" },
];
