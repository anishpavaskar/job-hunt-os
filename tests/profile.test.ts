import fs from "fs";
import os from "os";
import path from "path";
import {
  extractProfileFromText,
  parseExtractionResponse,
  runProfileCommand,
} from "../src/commands/profile";

describe("profile command support", () => {
  test("extracts profile from text", () => {
    const profile = extractProfileFromText(`
      Anish Pavaskar
      Senior Software Engineer with 5 years of experience.
      Skills: Python, Kubernetes, Docker, Terraform, Go.
      Based in San Francisco, CA.
    `);

    expect(profile.name).toBe("Anish Pavaskar");
    expect(profile.skills_tier1).toContain("Python");
    expect(profile.domains).toContain("Cloud Infrastructure");
  });

  test("parses JSON wrapped in markdown", () => {
    const profile = parseExtractionResponse(`\`\`\`json
{
  "name": "Anish",
  "target_roles": ["Backend Engineer"],
  "skills_tier1": ["Go"],
  "skills_tier2": [],
  "domains": [],
  "practices": ["CI/CD"],
  "preferences": {
    "remote": true,
    "hybrid": true,
    "healthcare": false,
    "early_stage": true,
    "relocation": true
  }
}
\`\`\``);
    expect(profile.name).toBe("Anish");
    expect(profile.target_roles).toContain("Backend Engineer");
    expect(profile.practices).toContain("CI/CD");
    expect(profile.preferences?.hybrid).toBe(true);
  });

  test("runProfileCommand saves data/profile.json", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-hunt-profile-"));
    const previousCwd = process.cwd();
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });

    const resumePath = path.join(tmpDir, "resume.txt");
    fs.writeFileSync(
      resumePath,
      "Anish Pavaskar\nSoftware Engineer with 3 years of experience in Python and Kubernetes.\nMilpitas, CA\nRemote startup roles.",
    );

    const profile = await runProfileCommand(resumePath);
    expect(profile.name).toBe("Anish Pavaskar");
    expect(fs.existsSync(path.join(tmpDir, "data", "profile.json"))).toBe(true);

    process.chdir(previousCwd);
  });

  test("extracts richer target role and practice hints from text", () => {
    const profile = extractProfileFromText(`
      Anish Pavaskar
      Software Engineer with 3 years of experience.
      Built backend microservices, internal platform tooling, CI/CD pipelines, and observability systems.
      Interested in remote or hybrid startup roles and open to relocation.
    `);

    expect(profile.target_roles).toEqual(
      expect.arrayContaining(["Backend Engineer", "Platform Engineer"]),
    );
    expect(profile.practices).toEqual(
      expect.arrayContaining(["CI/CD", "Microservices", "Observability"]),
    );
    expect(profile.preferences?.hybrid).toBe(true);
    expect(profile.preferences?.relocation).toBe(true);
  });
});
