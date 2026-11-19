import { z } from "zod";
import type { TrainingPlan } from "@/types/training";

const runningSessionSchema = z.strictObject({
  id: z.string(),
  date: z.iso.date(),
  kind: z.literal("run"),
  title: z.string(),
  durationMinutes: z.number().int().positive(),
  effort: z.enum(["easy", "steady"]),
});

const restSessionSchema = z.strictObject({
  id: z.string(),
  date: z.iso.date(),
  kind: z.literal("rest"),
  title: z.string(),
});

export const trainingPlanSchema = z.strictObject({
  id: z.string(),
  version: z.number().int().positive(),
  weekStart: z.iso.date(),
  source: z.enum(["sample", "baseline", "llm"]),
  sessions: z.array(
    z.discriminatedUnion("kind", [
      runningSessionSchema,
      restSessionSchema,
    ]),
  ),
}) satisfies z.ZodType<TrainingPlan>;