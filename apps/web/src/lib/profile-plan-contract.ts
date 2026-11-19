import { z } from "zod";
import { runnerProfileSchema } from "@/lib/schemas/runner-profile";

export const profilePlanRequestSchema = z.strictObject({
  requestId: z.uuid(),
  profile: runnerProfileSchema,
});

export const profilePlanReceiptSchema = z.strictObject({
  status: z.literal("saved"),
  profile: runnerProfileSchema,
  planId: z.uuid(),
  planVersion: z.number().int().positive(),
  weekStart: z.iso.date(),
  redirectTo: z.literal("/plan"),
});

export const experienceLabels = {
  starting: "Starting out",
  returning: "Returning after a break",
  regular: "Running regularly",
} as const;

export const goalLabels = {
  "start-running": "Start running",
  consistency: "Build consistency",
  "5k": "Prepare for a 5K",
  "10k": "Prepare for a 10K",
} as const;
