import { z } from "zod";

export const weekdays = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export const runnerProfileSchema = z
  .strictObject({
    experience: z.enum(["starting", "returning", "regular"]),

    goal: z.enum([
      "start-running",
      "consistency",
      "5k",
      "10k",
    ]),

    raceDate: z.iso.date().optional(),

    currentRunsPerWeek: z.number().int().min(0).max(7),
    currentWeeklyMinutes: z.number().int().min(0).max(10080),
    longestRecentRunMinutes: z.number().int().min(0).max(1440),

    availableDays: z.array(z.enum(weekdays)).min(1).max(7),

    maxSessionMinutes: z.number().int().min(1).max(1440),
  })
  .superRefine((profile, context) => {
    if (
      profile.longestRecentRunMinutes >
      profile.currentWeeklyMinutes
    ) {
      context.addIssue({
        code: "custom",
        path: ["longestRecentRunMinutes"],
        message:
          "Your longest run cannot exceed your total running time for that week.",
      });
    }

    if (
      profile.currentRunsPerWeek === 0 &&
      (profile.currentWeeklyMinutes > 0 ||
        profile.longestRecentRunMinutes > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["currentRunsPerWeek"],
        message:
          "If you entered running minutes, also enter how many days you ran.",
      });
    }

    if (
      profile.currentRunsPerWeek > 0 &&
      (profile.currentWeeklyMinutes === 0 ||
        profile.longestRecentRunMinutes === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["currentWeeklyMinutes"],
        message:
          "Enter your running minutes and longest run, or use zero running days.",
      });
    }

    if (
      profile.raceDate &&
      profile.goal !== "5k" &&
      profile.goal !== "10k"
    ) {
      context.addIssue({
        code: "custom",
        path: ["raceDate"],
        message: "A race date applies only to a race goal.",
      });
    }
  });

export type RunnerProfile = z.infer<typeof runnerProfileSchema>;