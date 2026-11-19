import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { trainingPlanSchema } from "@/lib/schemas/training-plan";

const savedPlanSchema = z.object({
  id: z.uuid(),
  week_start: z.iso.date(),
  plan: trainingPlanSchema,
  notes: z.array(z.string()),
  policy_version: z.string(),
}).refine(
  (row) =>
    row.plan.id === row.id &&
    row.plan.weekStart === row.week_start,
  { message: "Saved plan metadata does not match its contents." },
);

type SavedPlan = z.infer<typeof savedPlanSchema>;

type SavedPlanResult =
  | { ok: true; saved: SavedPlan | null }
  | { ok: false; message: string };

export function getNextWeekStart(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  function part(type: Intl.DateTimeFormatPartTypes) {
    return parts.find((item) => item.type === type)!.value;
  }

  const date = new Date(
    `${part("year")}-${part("month")}-${part("day")}T00:00:00Z`,
  );

  const daysUntilMonday = (8 - date.getUTCDay()) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);

  return date.toISOString().slice(0, 10);
}

export async function getLatestSavedPlan(
  userId: string,
): Promise<SavedPlanResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("training_plans")
      .select("id, week_start, plan, notes, policy_version")
      .eq("user_id", userId)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { ok: false, message: "Your saved plan couldn’t load." };
    }

    if (!data) {
      return { ok: true, saved: null };
    }

    const parsed = savedPlanSchema.safeParse(data);

    if (!parsed.success) {
      return {
        ok: false,
        message: "Your saved plan couldn’t be read.",
      };
    }

    return { ok: true, saved: parsed.data };
  } catch {
    return {
      ok: false,
      message: "We couldn’t connect to your saved plan. Please try again.",
    };
  }
}