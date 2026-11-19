import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  runLogFromRow,
  runLogRequestSchema,
  sameFeedback,
} from "@/lib/schemas/run-log";

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return reply({ message: "Request origin not allowed." }, 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return reply({ message: "Send your run log as JSON." }, 415);
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return reply({ message: "Sign in before saving your run." }, 401);
    }

    let body: unknown;
    try { body = await request.json(); }
    catch { return reply({ message: "The request must contain valid JSON." }, 400); }

    const input = runLogRequestSchema.safeParse(body);
    if (!input.success) {
      return reply({ message: "Check the duration, effort, and note." }, 422);
    }
    const { planId, planVersion, sessionId, expectedRevision, feedback } = input.data;
    const { data, error } = await supabase.rpc("save_run_log", {
      p_plan_id: planId,
      p_plan_version: planVersion,
      p_session_id: sessionId,
      p_expected_revision: expectedRevision,
      p_status: feedback.status,
      p_completed_on: feedback.completedOn,
      p_actual_minutes: feedback.actualMinutes,
      p_perceived_effort: feedback.perceivedEffort,
      p_note: feedback.note,
    });

    if (error) {
      if (error.message.includes("AUTH_REQUIRED")) {
        return reply({ message: "Sign in before saving your run." }, 401);
      }
      if (error.message.includes("SESSION_NOT_FOUND")) {
        return reply({ message: "This running session is unavailable." }, 404);
      }
      if (error.message.includes("PLAN_CHANGED") || error.message.includes("LOG_CONFLICT")) {
        return reply({ message: "The plan or run log changed. Reload before editing again." }, 409);
      }
      if (error.message.includes("FUTURE_COMPLETION")) {
        return reply({ message: "This session is in the future. You can skip it now, or record completion from its scheduled date." }, 422);
      }
      if (error.message.includes("DATE_MISMATCH")) {
        return reply({ message: "The session date changed. Reload before saving." }, 409);
      }
      if (error.message.includes("FUTURE_SKIP")) {
        return reply({ message: "The service couldn’t save this skipped session. Please try again after the app update." }, 503);
      }
      if (error.message.includes("INVALID_LOG") || error.code === "23514" || error.code === "22008") {
        return reply({ message: "Check your duration, effort, and note." }, 422);
      }
      return reply({ message: "We couldn’t confirm the save. Your answers are still here; try again." }, 503);
    }

    let log;
    try { log = runLogFromRow(data); }
    catch { return reply({ message: "We couldn’t verify the save. Reload to check your run log." }, 502); }
    if (log.planId !== planId || log.planVersion !== planVersion || log.sessionId !== sessionId
        || !sameFeedback(log.feedback, feedback)) {
      return reply({ message: "We couldn’t verify the save. Reload to check your run log." }, 502);
    }

    // A cache refresh failure must not turn a confirmed DB write into a failed save.
    try {
      revalidatePath(`/plan/log/${sessionId}`);
      revalidatePath("/plan");
      revalidatePath("/");
    } catch { /* The pages also fetch account data at request time. */ }

    return reply({ status: "saved", log });
  } catch {
    return reply({ message: "We couldn’t confirm the save. Your answers are still here; try again." }, 503);
  }
}
