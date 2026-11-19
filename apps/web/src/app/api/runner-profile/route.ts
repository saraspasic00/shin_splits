import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getNextWeekStart } from "@/lib/saved-plan";
import { getPlanPreview } from "@/lib/plan-preview";
import { trainingPlanSchema } from "@/lib/schemas/training-plan";
import { profilePlanRequestSchema, profilePlanReceiptSchema } from "@/lib/profile-plan-contract";

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function refreshPages() {
  for (const path of ["/", "/plan", "/profile", "/onboarding"]) revalidatePath(path);
}

const existingPlanSchema = z.object({ id: z.uuid(), plan: trainingPlanSchema });

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return reply({ message: "Request origin not allowed." }, 403);
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return reply({ message: "Sign in before saving your profile." }, 401);

    let body: unknown;
    try { body = await request.json(); }
    catch { return reply({ message: "Invalid request format." }, 400); }

    const input = profilePlanRequestSchema.safeParse(body);
    if (!input.success) return reply({ message: "Please check your profile answers." }, 422);
    const { profile, requestId } = input.data;
    if (new Set(profile.availableDays).size !== profile.availableDays.length) {
      return reply({ message: "Available days must not repeat." }, 422);
    }

    // A retry after a lost response must not generate another version.
    const { data: previous, error: receiptError } = await supabase
      .from("profile_plan_saves").select("profile, receipt")
      .eq("user_id", user.id).eq("request_id", requestId).maybeSingle();
    if (receiptError) return reply({ message: "Saving is unavailable. Please check the database migration." }, 503);
    if (previous) {
      const receipt = profilePlanReceiptSchema.safeParse(previous.receipt);
      if (!receipt.success) return reply({ message: "We couldn’t read the save confirmation. Reload to check your plan." }, 500);
      // Zod gives both profiles the same canonical property order.
      if (JSON.stringify(receipt.data.profile) !== JSON.stringify(profile)) {
        return reply({ message: "This save request has already been used. Reload before saving again." }, 409);
      }
      refreshPages();
      return reply(receipt.data);
    }

    const weekStart = getNextWeekStart();
    const { data: existing, error: readError } = await supabase
      .from("training_plans").select("id, plan")
      .eq("user_id", user.id).eq("week_start", weekStart).maybeSingle();
    if (readError) return reply({ message: "Your plan couldn’t load. Nothing has been changed." }, 503);
    const current = existing ? existingPlanSchema.parse(existing) : null;

    // Finish generation and validation before writing either record.
    const generated = await getPlanPreview(profile, weekStart);
    if (!generated.ok) return reply({ message: `${generated.message} Your profile and plan have not changed.` }, 503);
    if (generated.preview.status !== "preview") {
      return reply({ message: `${generated.preview.message} Your profile and plan have not changed.` }, 422);
    }

    const preview = generated.preview;
    const plan = trainingPlanSchema.parse({
      ...preview.plan,
      id: current?.id ?? randomUUID(),
      version: (current?.plan.version ?? 0) + 1,
      sessions: preview.plan.sessions.map((session) => ({ ...session, id: randomUUID() })),
    });

    const { data: saved, error: saveError } = await supabase.rpc("save_profile_and_next_plan", {
      p_profile: profile,
      p_plan: plan,
      p_notes: preview.notes,
      p_policy_version: preview.policyVersion,
      p_request_id: requestId,
      p_expected_plan_id: current?.id ?? null,
      p_expected_version: current?.plan.version ?? null,
    });

    if (saveError) {
      if (saveError.message.includes("PLAN_CONFLICT") || saveError.code === "23505") {
        return reply({ message: "Your plan changed in another request. Reload, review your answers, and save again." }, 409);
      }
      if (saveError.message.includes("WEEK_CHANGED")) {
        return reply({ message: "The starting week changed while saving. Reload and try again." }, 409);
      }
      return reply({ message: "We couldn’t confirm the save. Your answers are still here. Retry, or reload to check." }, 503);
    }

    const receipt = profilePlanReceiptSchema.safeParse(saved);
    if (!receipt.success) return reply({ message: "We couldn’t verify the confirmation. Reload to check your plan." }, 502);
    refreshPages();
    return reply(receipt.data);
  } catch {
    return reply({ message: "We couldn’t confirm the save. Retry, or reload to check your plan." }, 503);
  }
}
