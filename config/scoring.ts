export const TIER1_TAGS = [
  "Developer Tools",
  "DevOps",
  "Infrastructure",
  "Cloud Computing",
  "Kubernetes",
  "SaaS",
  "Data Engineering",
  "Open Source",
  "Automation",
  "Monitoring",
  "AIOps",
  "Machine Learning",
  "Generative AI",
  "AI",
  "Artificial Intelligence",
];

export const TIER2_TAGS = [
  "Healthcare",
  "Health Tech",
  "Digital Health",
  "Healthcare IT",
  "Fintech",
  "Cybersecurity",
  "Security",
  "Enterprise Software",
  "Analytics",
  "API",
];

export const HEALTH_KEYWORDS = [
  "Healthcare",
  "Health Tech",
  "Digital Health",
  "Healthcare IT",
  "Consumer Health Services",
  "Telemedicine",
  "Telehealth",
  "Medical Devices",
  "Mental Health Tech",
  "Therapeutics",
  "Diagnostics",
];

export const BAY_AREA_CITIES = [
  "San Francisco",
  "San Jose",
  "Palo Alto",
  "Mountain View",
  "Sunnyvale",
  "Santa Clara",
  "Milpitas",
];

export const RECENT_BATCHES = [
  "Winter 2026",
  "Spring 2026",
  "Fall 2025",
  "Summer 2025",
  "Spring 2025",
  "Winter 2025",
];

export const RESUME_KEYWORDS = [
  "golang",
  "python",
  "kubernetes",
  "helm",
  "microservice",
  "ci/cd",
  "pipeline",
  "observability",
  "distributed",
  "terraform",
  "docker",
  "rag",
  "llm",
];

export const SCORING_WEIGHTS = {
  roleFit: 25,
  stackFit: 30,
  seniorityFit: 15,
  freshness: 10,
  companySignal: 20,
  prospectBoost: 8,
} as const;

export const TODAY_RANKING = {
  applyMinRoleFit: 10,
  applyMinStackFit: 12,
  strongRoleFit: 14,
  strongStackFit: 16,
  applyBaseScore: 10,
  roleFitWeight: 1.6,
  stackFitWeight: 1.7,
  seniorityFitWeight: 0.7,
  freshnessWeight: 0.6,
  companySignalWeight: 0.35,
  softSignalPenalty: 18,
} as const;

export const ROLE_KEYWORDS = {
  platform: ["platform", "infrastructure", "infra", "developer platform"],
  backend: ["backend", "software engineer", "swe", "api", "distributed systems", "microservices", "services"],
  devops: ["devops", "sre", "reliability", "kubernetes", "cloud"],
  data: ["data", "pipeline", "analytics", "etl"],
  ai: ["ai", "machine learning", "ml", "llm", "rag"],
} as const;

export const SENIORITY_KEYWORDS = {
  junior: ["junior", "entry", "new grad", "associate"],
  mid: ["mid", "intermediate", "software engineer"],
  senior: ["senior", "staff", "lead", "principal"],
} as const;
