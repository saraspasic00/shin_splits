import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chooseWeek, applyDecision, repeatedHardEasyRuns, type CompletedRun } from "./follow-up-policy";
import { checkInRequestSchema } from "./schemas/check-in";
import type { PlanPreview } from "./schemas/plan-preview";
import type { RunnerProfile } from "./schemas/runner-profile";
import { plannedRunSchema, runFeedbackSchema } from "./schemas/run-log";
import { runLogToday } from "./run-log-dates";
import { offsetDate } from "./week-calendar";

export async function recentWeekReports(db: SupabaseClient, userId: string, weekStart: string) {
  const today = runLogToday(new Date());
  const [checkIns, completed] = await Promise.all([
    db.from("check_ins").select("date,energy,sleep")
      .eq("user_id", userId).gte("date", offsetDate(today, -6)).lte("date", today)
      .lt("date", weekStart).order("date"),
    db.from("run_logs").select("completed_on,actual_minutes,perceived_effort,planned_session")
      .eq("user_id", userId).eq("status", "completed")
      .gte("completed_on", offsetDate(today, -13)).lte("completed_on", today)
      .lt("completed_on", weekStart).order("completed_on").order("id"),
  ]);
  if (checkIns.error || !checkIns.data || completed.error || !completed.data) {
    throw Error("Recent training history unavailable");
  }
  const reports = checkInRequestSchema.array().max(7).parse(checkIns.data);
  const runs: CompletedRun[] = completed.data.map(row => {
    const session = plannedRunSchema.parse(row.planned_session);
    const feedback = runFeedbackSchema.parse({
      status: "completed", completedOn: row.completed_on, actualMinutes: row.actual_minutes,
      perceivedEffort: row.perceived_effort, note: "",
    });
    if (feedback.status !== "completed") throw Error("Invalid completed run");
    return { date: feedback.completedOn, plannedMinutes: session.durationMinutes,
      actualMinutes: feedback.actualMinutes, plannedEffort: session.effort,
      perceivedEffort: feedback.perceivedEffort };
  });
  return { reports, runs };
}

export async function planFollowUpWeek(
  db: SupabaseClient, userId: string, profile: RunnerProfile,
  preview: Extract<PlanPreview, { status: "preview" }>,
  history?: Awaited<ReturnType<typeof recentWeekReports>>,
) {
  const { reports, runs } = history ?? await recentWeekReports(db, userId, preview.plan.weekStart);
  const decision = await chooseWeek(profile, reports.map(({ energy, sleep }) => ({ energy, sleep })), runs);
  const sessions = applyDecision(preview.plan.sessions, decision);
  const shortened = sessions.some((session, index) => {
    const original = preview.plan.sessions[index];
    return session.kind === "run" && original.kind === "run" && session.durationMinutes < original.durationMinutes;
  });
  const notes = [...preview.notes];
  const labels = { baseline: "Profile baseline", fallback: "Training feedback rule", ollama: "Ollama" };
  notes.push(`Planning decision: ${labels[decision.source]} (${decision.choice}).`);
  if (shortened && repeatedHardEasyRuns(runs)) {
    notes.push("You rated several recent easy runs as hard, so the upcoming week has shorter easy sessions.");
  } else if (shortened) notes.push("Your recent check-ins included repeated low energy or poor sleep, so this week has shorter easy sessions.");
  return { plan: { ...preview.plan, sessions }, notes, policyVersion: "follow-up-v1" };
}

