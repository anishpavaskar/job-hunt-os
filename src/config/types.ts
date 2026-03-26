import { z } from "zod";

export const profileSchema = z.object({
  name: z.string(),
  target_roles: z.array(z.string()).optional().default([]),
  skills_tier1: z.array(z.string()),
  skills_tier2: z.array(z.string()),
  domains: z.array(z.string()),
  practices: z.array(z.string()).optional().default([]),
  years_of_experience: z.number().optional(),
  location: z.string().optional(),
  preferences: z
    .object({
      remote: z.boolean().optional(),
      hybrid: z.boolean().optional(),
      healthcare: z.boolean().optional(),
      early_stage: z.boolean().optional(),
      relocation: z.boolean().optional(),
    })
    .optional(),
});

export type Profile = z.infer<typeof profileSchema>;
