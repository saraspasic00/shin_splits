import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { profileFromRow } from "@/lib/runner-profile-mapping";
import { getPlanPreview } from "@/lib/plan-preview";
import { trainingPlanSchema } from "@/lib/schemas/training-plan";
import { getNextWeekStart } from "@/lib/saved-plan";

export async function ensureWeek(db: SupabaseClient, userId: string, week = getNextWeekStart()) {
  const existing = await db.from("training_plans").select("id")
    .eq("user_id", userId).eq("week_start", week).maybeSingle();
  if (existing.error) throw Error("Plan lookup failed");
  if (existing.data) return "existing";
  const row = await db.from("runner_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (row.error) throw Error("Profile lookup failed");
  if (!row.data) return "missing-profile";
  const profile = profileFromRow(row.data);
  const generated = await getPlanPreview(profile, week);
  if (!generated.ok) throw Error("Planner unavailable");
  const preview = generated.preview;
  if (preview.status !== "preview") return "unsupported";
  const plan = trainingPlanSchema.parse({ ...preview.plan, id: randomUUID(), version: 1,
    sessions: preview.plan.sessions.map(session => ({ ...session, id: randomUUID() })) });
  const saved = await db.rpc("ensure_runner_week", { p_user: userId, p_row: row.data,
    p_profile: profile, p_plan: plan, p_notes: preview.notes, p_policy_version: preview.policyVersion });
  if (saved.error || (saved.data !== "created" && saved.data !== "existing")) throw Error("Plan save failed");
  return saved.data as "created" | "existing";
}
