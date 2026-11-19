import "server-only";

import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runLogFromRow, type SavedRunLog } from "@/lib/schemas/run-log";

type Result = { ok: true; logs: SavedRunLog[] } | { ok: false; message: string };
type Scope = { planId: string; planVersion: number } | { recentCompleted: true };

const columns = "id, plan_id, plan_version, session_id, revision, planned_session, status, completed_on, actual_minutes, perceived_effort, note, updated_at";

// No persistent cache: these reads are private to the authenticated request.
async function readLogs(scope: Scope): Promise<Result> {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sign in to see your run feedback." };

    let query = supabase.from("run_logs").select(columns).eq("user_id", user.id);
    if ("planId" in scope) {
      query = query.eq("plan_id", scope.planId).eq("plan_version", scope.planVersion);
    } else {
      // Read across weeks and plan versions. Regeneration must not hide history.
      query = query.eq("status", "completed")
        .order("completed_on", { ascending: false })
        .order("id", { ascending: false }).limit(3);
    }
    const { data, error } = await query;
    if (error || !data) return { ok: false, message: "Your run feedback couldn’t load. Please try again." };
    const rows: unknown[] = data;
    return { ok: true, logs: rows.map(runLogFromRow) };
  } catch {
    return { ok: false, message: "Your run feedback couldn’t load. Please try again." };
  }
}

export function getPlanRunLogs(planId: string, planVersion: number): Promise<Result> {
  return readLogs({ planId, planVersion });
}

export function getRecentCompletedRuns(): Promise<Result> {
  return readLogs({ recentCompleted: true });
}
