import { z } from "zod";
import {
  runnerProfileSchema,
  type RunnerProfile,
} from "@/lib/schemas/runner-profile";

export function profileToRow(profile: RunnerProfile) {
  return {
    experience: profile.experience,
    goal: profile.goal,
    race_date: profile.raceDate ?? null,
    current_runs_per_week: profile.currentRunsPerWeek,
    current_weekly_minutes: profile.currentWeeklyMinutes,
    longest_recent_run_minutes: profile.longestRecentRunMinutes,
    available_days: profile.availableDays,
    max_session_minutes: profile.maxSessionMinutes,
  };
}

const rowSchema = z.object({
  experience: z.unknown(),
  goal: z.unknown(),
  race_date: z.unknown(),
  current_runs_per_week: z.unknown(),
  current_weekly_minutes: z.unknown(),
  longest_recent_run_minutes: z.unknown(),
  available_days: z.unknown(),
  max_session_minutes: z.unknown(),
});

export function profileFromRow(value: unknown) {
  const row = rowSchema.parse(value);

  return runnerProfileSchema.parse({
    experience: row.experience,
    goal: row.goal,
    raceDate: row.race_date ?? undefined,
    currentRunsPerWeek: row.current_runs_per_week,
    currentWeeklyMinutes: row.current_weekly_minutes,
    longestRecentRunMinutes: row.longest_recent_run_minutes,
    availableDays: row.available_days,
    maxSessionMinutes: row.max_session_minutes,
  });
}