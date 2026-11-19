"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { profileFromRow } from "@/lib/runner-profile-mapping";
import { getPlanPreview } from "@/lib/plan-preview";
import {
  getLatestSavedPlan,
  getNextWeekStart,
} from "@/lib/saved-plan";
import { trainingPlanSchema } from "@/lib/schemas/training-plan";

export type CreatePlanState = {
  error: string | null;
};

export async function createFirstPlan(
  displayedWeekStart: string,
  _previousState: CreatePlanState,
  _formData: FormData,
): Promise<CreatePlanState> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: "Please sign in before creating your plan." };
    }

    const existing = await getLatestSavedPlan(user.id);

    if (!existing.ok) {
      return { error: existing.message };
    }

    if (!existing.saved) {
      const weekStart = getNextWeekStart();

      if (displayedWeekStart !== weekStart) {
        return {
          error: "The starting week has changed. Reload before creating your plan.",
        };
      }

      const { data, error } = await supabase
        .from("runner_profiles")
        .select()
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        return { error: "Your running profile couldn’t load. Try again." };
      }

      if (!data) {
        return { error: "Save your running profile first." };
      }

      let profile;

      try {
        profile = profileFromRow(data);
      } catch {
        return { error: "Please review your saved running profile." };
      }

      const result = await getPlanPreview(profile, weekStart);

      if (!result.ok) {
        return { error: result.message };
      }

      if (result.preview.status !== "preview") {
        return { error: result.preview.message };
      }

      const generated = result.preview;
      const planId = randomUUID();

      const plan = trainingPlanSchema.parse({
        ...generated.plan,
        id: planId,
        sessions: generated.plan.sessions.map((session) => ({
          ...session,
          id: randomUUID(),
        })),
      });

      const { error: saveError } = await supabase
        .from("training_plans")
        .insert({
          id: planId,
          user_id: user.id,
          week_start: weekStart,
          plan,
          notes: generated.notes,
          policy_version: generated.policyVersion,
          profile_snapshot: profile,
        });

      if (saveError) {
        // Another submission may have saved this week first.
        if (saveError.code !== "23505") {
          return {
            error: "We couldn’t confirm the save. Reload before trying again.",
          };
        }

        const saved = await getLatestSavedPlan(user.id);

        if (
          !saved.ok ||
          !saved.saved ||
          saved.saved.week_start !== weekStart
        ) {
          return {
            error: "We couldn’t confirm the save. Please reload.",
          };
        }
      }
    }
  } catch {
    return {
      error: "We couldn’t complete the request. Reload to check your plan.",
    };
  }

  revalidatePath("/plan");
  revalidatePath("/");
  redirect("/plan");
}