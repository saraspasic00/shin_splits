import type { RunnerProfile } from "./schemas/runner-profile";
import type { PlannedSession } from "@/types/training";

type Choice = "keep" | "shorten";
type Decision = { choice: Choice; source: "baseline" | "fallback" | "ollama" };

export type CompletedRun = {
  date: string;
  plannedMinutes: number;
  actualMinutes: number;
  plannedEffort: "easy" | "steady";
  perceivedEffort: number | null;
};

export function repeatedHardEasyRuns(runs: CompletedRun[]) {
  return runs.filter(run => run.plannedEffort === "easy"
    && run.perceivedEffort !== null && run.perceivedEffort >= 8).length >= 2;
}

export async function chooseWeek(
  profile: RunnerProfile,
  recent: { energy: string; sleep: string }[],
  runs: CompletedRun[] = [],
): Promise<Decision> {
  const flaggedDays = recent.filter(day => day.energy === "low" || day.sleep === "poor").length;
  const repeatedEffort = repeatedHardEasyRuns(runs);
  if (flaggedDays < 2 && !repeatedEffort) return { choice: "keep", source: "baseline" };

  const shorten = repeatedEffort || (flaggedDays >= 2 && flaggedDays * 2 >= recent.length);
  const fallback: Decision = { choice: shorten ? "shorten" : "keep", source: "fallback" };
  const host = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL;
  if (!host || !model) return fallback;

  try {
    const response = await fetch(new URL("/api/chat", host), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model, stream: false, options: { temperature: 0 },
        format: { type: "object", properties: { choice: { type: "string", enum: ["keep", "shorten"] } },
          required: ["choice"], additionalProperties: false },
        messages: [
          { role: "system", content: "Choose keep or shorten for the upcoming easy running week. Weigh repeated low energy or poor sleep and whether recent reports improved. Shorten reduces scheduled minutes by around ten percent. Consider planned versus recorded minutes alongside effort on completed runs. Repeated high ratings on easy runs can support shortening even with good check-ins. Short duration alone does not establish fatigue. Null effort and missing days are unknown. Return only the JSON decision." },
          { role: "user", content: JSON.stringify({ goal: profile.goal, experience: profile.experience,
              weeklyMinutes: profile.currentWeeklyMinutes, sessionLimit: profile.maxSessionMinutes,
              completedRunsOldestFirst: runs, reportedDaysOldestFirst: recent }) },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const result = await response.json();
    const answer = JSON.parse(result.message.content);
    if (!answer || Object.keys(answer).length !== 1 ||
        (answer.choice !== "keep" && answer.choice !== "shorten")) return fallback;
    return { choice: answer.choice, source: "ollama" };
  } catch {
    return fallback;
  }
}

export function applyDecision(sessions: PlannedSession[], decision: Decision) {
  return sessions.map(session => {
    if (decision.choice === "keep" || session.kind !== "run") return session;
    const minutes = session.durationMinutes;
    const nearestFive = Math.round(minutes * 0.9 / 5) * 5;
    const lowerFive = Math.floor((minutes - 1) / 5) * 5;
    const durationMinutes = minutes <= 5
      ? Math.max(1, minutes - 1)
      : Math.min(nearestFive, lowerFive);
    return { ...session, durationMinutes };
  });
}

