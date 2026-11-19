import { z } from "zod";
import { trainingPlanSchema } from "@/lib/schemas/training-plan";

export const planPreviewSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("preview"),
    policyVersion: z.literal("consistency-v1"),
    persisted: z.literal(false),
    plan: trainingPlanSchema,
    notes: z.array(z.string()),
  }),
  z.strictObject({
    status: z.literal("unsupported"),
    message: z.string(),
  }),
  z.strictObject({
    status: z.literal("needs_review"),
    message: z.string(),
  }),
]);

export type PlanPreview = z.infer<typeof planPreviewSchema>;