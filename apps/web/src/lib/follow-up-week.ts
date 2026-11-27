import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chooseWeek, applyDecision } from "./follow-up-policy";
import { checkInRequestSchema } from "./schemas/check-in";
import type { PlanPreview } from "./schemas/plan-preview";
import type { RunnerProfile } from "./schemas/runner-profile";
import { runLogToday } from "./run-log-dates";
import { offsetDate } from "./week-calendar";

export async function recentWeekReports(db: SupabaseClient, userId: string, weekStart: string) {
  const today = runLogToday(new Date());
  const { data, error } = await db.from("check_ins").select("date,energy,sleep")
    .eq("user_id", userId).gte("date", offsetDate(today, -6)).lte("date", today)
    .lt("date", weekStart).order("date");
  if (error || !data) throw Error("Check-in history unavailable");
  return checkInRequestSchema.array().max(7).parse(data);
}

export async function planFollowUpWeek(
  db: SupabaseClient, userId: string, profile: RunnerProfile,
  preview: Extract<PlanPreview, { status: "preview" }>,
  reports?: Awaited<ReturnType<typeof recentWeekReports>>,
) {
  reports ??= await recentWeekReports(db, userId, preview.plan.weekStart);
  const decision = await chooseWeek(profile, reports.map(({ energy, sleep }) => ({ energy, sleep })));
  const sessions = applyDecision(preview.plan.sessions, decision);
  const shortened = sessions.some((session, index) => {
    const original = preview.plan.sessions[index];
    return session.kind === "run" && original.kind === "run" && session.durationMinutes < original.durationMinutes;
  });
  const notes = [...preview.notes];
  const labels = { baseline: "Profile baseline", fallback: "Check-in rule", ollama: "Ollama" };
  notes.push(`Planning decision: ${labels[decision.source]} (${decision.choice}).`);
  if (shortened) notes.push("Your recent check-ins included repeated low energy or poor sleep, so this week has shorter easy sessions.");
  return { plan: { ...preview.plan, sessions }, notes, policyVersion: "follow-up-v1" };
}

