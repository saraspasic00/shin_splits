import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureWeek } from "./ensure-week";
import { planFollowUpWeek, recentWeekReports } from "./follow-up-week";
import { getPlanPreview } from "./plan-preview";
import { runnerProfileSchema } from "./schemas/runner-profile";
import { trainingPlanSchema } from "./schemas/training-plan";

export async function prepareOrReviewWeek(db: SupabaseClient, userId: string, week: string) {
  const result = await ensureWeek(db, userId, week);
  if (result !== "existing") return result;

  const { data: row, error } = await db.from("training_plans")
    .select("id,plan,profile_snapshot,review_key,review_version")
    .eq("user_id", userId).eq("week_start", week).single();
  if (error || !row) throw Error("Upcoming plan unavailable");
  const saved = trainingPlanSchema.parse(row.plan);
  const history = await recentWeekReports(db, userId, week);
  if (!history.reports.length && !history.runs.length && row.review_key == null) return "existing";
  const key = createHash("sha256").update(JSON.stringify(history)).digest("hex");
  if (row.review_key === key && row.review_version === saved.version) return "existing";

  const profile = runnerProfileSchema.parse(row.profile_snapshot);
  const generated = await getPlanPreview(profile, week);
  if (!generated.ok) throw Error("Baseline planner unavailable");
  if (generated.preview.status !== "preview") return "unsupported";
  const revised = await planFollowUpWeek(db, userId, profile, generated.preview, history);
  // Match by date so existing sessions and any attached journal entries keep their identity.
  const minutes: Record<string, number> = {};
  for (const session of revised.plan.sessions) {
    if (session.kind === "run") minutes[session.date] = session.durationMinutes;
  }
  const { data, error: writeError } = await db.rpc("review_upcoming_week", {
    p_user: userId, p_id: row.id, p_version: saved.version,
    p_previous_key: row.review_key, p_key: key, p_minutes: minutes, p_notes: revised.notes,
  });
  if (writeError || !["existing", "updated"].includes(data)) throw Error("Weekly review failed");
  return data as "existing" | "updated";
}
