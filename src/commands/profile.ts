import { Command } from "commander";
import fs from "fs";
import path from "path";
import { saveProfile } from "../config/profile";
import { Profile, profileSchema } from "../config/types";

const KNOWN_TIER1: Record<string, string> = {
  go: "Go",
  golang: "Go",
  python: "Python",
  typescript: "TypeScript",
  javascript: "JavaScript",
  rust: "Rust",
  java: "Java",
  "c++": "C++",
  ruby: "Ruby",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
  docker: "Docker",
  terraform: "Terraform",
  helm: "Helm",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  react: "React",
  node: "Node.js",
  "node.js": "Node.js",
  fastapi: "FastAPI",
  django: "Django",
  flask: "Flask",
  express: "Express",
  pytorch: "PyTorch",
  tensorflow: "TensorFlow",
  "machine learning": "Machine Learning",
  "deep learning": "Deep Learning",
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  mongodb: "MongoDB",
  redis: "Redis",
  elasticsearch: "Elasticsearch",
  "ci/cd": "CI/CD",
  microservices: "Microservices",
  graphql: "GraphQL",
  grpc: "gRPC",
};

const KNOWN_TIER2: Record<string, string> = {
  jenkins: "Jenkins",
  ansible: "Ansible",
  puppet: "Puppet",
  chef: "Chef",
  nginx: "Nginx",
  kafka: "Kafka",
  rabbitmq: "RabbitMQ",
  prometheus: "Prometheus",
  grafana: "Grafana",
  datadog: "Datadog",
  splunk: "Splunk",
  "new relic": "New Relic",
  jira: "Jira",
  git: "Git",
  linux: "Linux",
  bash: "Bash",
  sql: "SQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  dynamodb: "DynamoDB",
  s3: "S3",
  lambda: "Lambda",
  cloudformation: "CloudFormation",
  vagrant: "Vagrant",
};

const DOMAIN_CLUSTERS: Record<string, string[]> = {
  "Cloud Infrastructure": ["kubernetes", "docker", "terraform", "aws", "gcp", "azure", "helm"],
  DevOps: ["ci/cd", "jenkins", "ansible", "docker", "kubernetes", "terraform"],
  "AI/ML": ["machine learning", "deep learning", "pytorch", "tensorflow", "llm", "rag", "nlp"],
  "Backend Engineering": ["go", "python", "java", "microservices", "grpc", "graphql"],
  "Frontend Engineering": ["react", "typescript", "javascript", "css", "html", "next.js", "vue"],
  "Data Engineering": ["kafka", "spark", "airflow", "sql", "elasticsearch", "data pipeline"],
};

const TARGET_ROLE_HINTS: Record<string, string[]> = {
  "Backend Engineer": ["backend", "api", "microservices", "distributed systems", "services"],
  "Platform Engineer": ["platform", "developer platform", "internal platform", "platform engineering"],
  "Infrastructure Engineer": ["infrastructure", "infra", "kubernetes", "cloud infrastructure"],
  "Cloud Engineer": ["cloud", "aws", "gcp", "azure", "terraform"],
  "DevOps Engineer": ["devops", "ci/cd", "observability", "reliability", "sre"],
};

const PRACTICE_HINTS: Record<string, string[]> = {
  "CI/CD": ["ci/cd", "continuous integration", "continuous delivery", "pipeline"],
  Microservices: ["microservices", "microservice", "services"],
  "Distributed Systems": ["distributed systems", "distributed", "scalability"],
  Observability: ["observability", "monitoring", "metrics", "tracing", "logging"],
};

export function extractProfileFromText(text: string): Profile {
  const lower = text.toLowerCase();
  const tier1 = new Set<string>();
  const tier2 = new Set<string>();

  for (const [keyword, label] of Object.entries(KNOWN_TIER1)) {
    if (lower.includes(keyword)) tier1.add(label);
  }
  for (const [keyword, label] of Object.entries(KNOWN_TIER2)) {
    if (lower.includes(keyword)) tier2.add(label);
  }

  const domains = new Set<string>();
  const allSkillsLower = new Set([...tier1, ...tier2].map((s) => s.toLowerCase()));
  for (const [domain, keywords] of Object.entries(DOMAIN_CLUSTERS)) {
    const matched = keywords.filter((kw) => allSkillsLower.has(kw) || lower.includes(kw));
    if (matched.length >= 2) domains.add(domain);
  }

  const targetRoles = new Set<string>();
  for (const [role, keywords] of Object.entries(TARGET_ROLE_HINTS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      targetRoles.add(role);
    }
  }

  const practices = new Set<string>();
  for (const [practice, keywords] of Object.entries(PRACTICE_HINTS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      practices.add(practice);
    }
  }

  const yearsMatch = lower.match(/(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/);
  const years = yearsMatch ? parseInt(yearsMatch[1], 10) : undefined;
  const locationMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b/);
  const location = locationMatch ? `${locationMatch[1]}, ${locationMatch[2]}` : undefined;

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let name = "Unknown";
  for (const line of lines.slice(0, 5)) {
    const cleaned = line.replace(/[^a-zA-Z\s]/g, "").trim();
    const words = cleaned.split(/\s+/);
    if (
      words.length >= 2 &&
      words.length <= 4 &&
      words.every((word) => word[0] === word[0].toUpperCase() && word.length > 1)
    ) {
      name = cleaned;
      break;
    }
  }

  return {
    name,
    target_roles: [...targetRoles],
    skills_tier1: [...tier1],
    skills_tier2: [...tier2],
    domains: [...domains],
    practices: [...practices],
    years_of_experience: years,
    location,
    preferences: {
      remote: lower.includes("remote"),
      hybrid: lower.includes("hybrid"),
      healthcare: lower.includes("healthcare") || lower.includes("health"),
      early_stage: lower.includes("startup") || lower.includes("early stage"),
      relocation: lower.includes("relocation") || lower.includes("relocate"),
    },
  };
}

export function buildExtractionPrompt(resumeText: string): string {
  return `Extract a structured profile from this resume. Return ONLY valid JSON matching this exact schema -- no markdown, no explanation:

{
  "name": "Full Name",
  "target_roles": ["Backend Engineer", "Platform Engineer"],
  "skills_tier1": ["top skills"],
  "skills_tier2": ["secondary skills"],
  "domains": ["domain expertise areas"],
  "practices": ["CI/CD", "Distributed Systems"],
  "years_of_experience": <number>,
  "location": "City, ST",
  "preferences": {
    "remote": <boolean>,
    "hybrid": <boolean>,
    "healthcare": <boolean>,
    "early_stage": <boolean>,
    "relocation": <boolean>
  }
}

Resume:
${resumeText}`;
}

export function parseExtractionResponse(responseText: string): Profile {
  let jsonStr = responseText.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  return profileSchema.parse(JSON.parse(jsonStr));
}

async function extractTextFromPdf(filePath: string): Promise<string> {
  const { PDFParse } = require("pdf-parse");
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse(new Uint8Array(buffer));
  const result = await parser.getText();
  return result.text;
}

async function aiExtract(resumeText: string): Promise<Profile> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: buildExtractionPrompt(resumeText) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.filter((item) => item.type === "text").map((item) => item.text).join("");
  if (!text) throw new Error("Anthropic API returned empty response");
  return parseExtractionResponse(text);
}

export async function runProfileCommand(resumePath: string): Promise<Profile> {
  const resolved = path.resolve(resumePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".pdf" && ext !== ".txt") {
    throw new Error(`Unsupported file type: ${ext}. Use .pdf or .txt`);
  }

  const resumeText =
    ext === ".pdf" ? await extractTextFromPdf(resolved) : fs.readFileSync(resolved, "utf-8");

  let profile: Profile;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      profile = await aiExtract(resumeText);
    } catch {
      profile = extractProfileFromText(resumeText);
    }
  } else {
    profile = extractProfileFromText(resumeText);
  }

  saveProfile(profile);
  return profile;
}

export function registerProfileCommand(): Command {
  return new Command("profile")
    .description("Extract profile from resume and save to data/profile.json")
    .argument("<resume-path>", "path to resume file (.pdf or .txt)")
    .action(async (resumePath: string) => {
      const profile = await runProfileCommand(resumePath);
      console.log(`Saved profile for ${profile.name}`);
    });
}
