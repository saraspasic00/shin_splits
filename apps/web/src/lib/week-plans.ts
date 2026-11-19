import "server-only";
import { createClient } from "@/lib/supabase/server";
import { trainingPlanSchema } from "@/lib/schemas/training-plan";
import { currentMonday } from "./week-calendar";

// Call from an authenticated component after connection().
export async function getWeekPlan(userId: string, selected?: string, current = currentMonday(new Date())) {
  try {
    const db = await createClient();
    const query = db.from("training_plans").select("id,week_start,plan,notes").eq("user_id", userId);
    const { data, error } = selected
      ? await query.eq("week_start", selected).maybeSingle()
      : await query.gte("week_start", current).order("week_start").limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return { ok: true, saved: null } as const;
    const plan = trainingPlanSchema.parse(data.plan);
    const notes: unknown = data.notes;
    if (plan.id !== data.id || plan.weekStart !== data.week_start || !Array.isArray(notes)
        || !notes.every((note): note is string => typeof note === "string")) throw Error("Invalid saved plan");
    return { ok: true, saved: { plan, notes: notes as string[] } } as const;
  } catch {
    return { ok: false, message: "Your weekly plan couldn’t load. Please try again." } as const;
  }
}
