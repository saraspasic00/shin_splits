import "server-only";

import type { RunnerProfile } from "@/lib/schemas/runner-profile";
import {
  planPreviewSchema,
  type PlanPreview,
} from "@/lib/schemas/plan-preview";

type PreviewResult =
  | { ok: true; preview: PlanPreview }
  | { ok: false; message: string };

export async function getPlanPreview(
  profile: RunnerProfile,
  weekStart: string,
): Promise<PreviewResult> {
  const baseUrl = process.env.API_BASE_URL;

  if (!baseUrl) {
    return {
      ok: false,
      message: "The planning service is not configured.",
    };
  }

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/v1/plans/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, weekStart }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        message: "The planning service couldn’t create your preview.",
      };
    }

    const body: unknown = await response.json();
    const parsed = planPreviewSchema.safeParse(body);

    if (!parsed.success) {
      return {
        ok: false,
        message: "The planning service returned an unexpected response.",
      };
    }

    if (parsed.data.status === "preview") {
      const { plan } = parsed.data;
      const start = new Date(`${weekStart}T00:00:00Z`);

      const datesMatch = plan.sessions.every((session, index) => {
        const expected = new Date(start);
        expected.setUTCDate(start.getUTCDate() + index);

        return session.date === expected.toISOString().slice(0, 10);
      });

      if (
        plan.source !== "baseline" ||
        plan.weekStart !== weekStart ||
        plan.sessions.length !== 7 ||
        !datesMatch
      ) {
        return {
          ok: false,
          message: "The returned plan didn’t match the requested week.",
        };
      }
    }

    return { ok: true, preview: parsed.data };
  } catch {
    return {
      ok: false,
      message: "We couldn’t reach the planning service. Please try again.",
    };
  }
}