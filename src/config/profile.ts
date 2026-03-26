import fs from "fs";
import path from "path";
import { profileSchema, Profile } from "./types";

export function getProfilePath(cwd = process.cwd()): string {
  return path.join(cwd, "data", "profile.json");
}

export function loadProfile(cwd = process.cwd()): Profile | undefined {
  const profilePath = getProfilePath(cwd);
  if (!fs.existsSync(profilePath)) return undefined;

  try {
    const raw = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    const result = profileSchema.safeParse(raw);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function saveProfile(profile: Profile, cwd = process.cwd()): string {
  const dataDir = path.join(cwd, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const profilePath = getProfilePath(cwd);
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  return profilePath;
}
