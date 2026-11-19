import "server-only";

import type { TrainingPlan } from "@/types/training";
import { trainingPlanSchema } from "@/lib/schemas/training-plan";

type PlanResult =
  | { ok: true; plan: TrainingPlan }
  | { ok: false; message: string };

export async function getSamplePlan(): Promise<PlanResult> {
  const baseUrl = process.env.API_BASE_URL;

  if (!baseUrl) {
    return {
      ok: false,
      message: "The API connection has not been configured.",
    };
  }

  let response: Response;

  try {
    response = await fetch(
      new URL("/api/v1/plans/sample", baseUrl),
      {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    return {
      ok: false,
      message: "We couldn’t reach the training service. Please try again.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      message: "The training service couldn’t return your plan.",
    };
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      message: "The training service returned an unreadable response.",
    };
  }

  const result = trainingPlanSchema.safeParse(data);

  if (!result.success) {
    return {
      ok: false,
      message: "The returned plan didn’t match the expected format.",
    };
  }

  return { ok: true, plan: result.data };
}