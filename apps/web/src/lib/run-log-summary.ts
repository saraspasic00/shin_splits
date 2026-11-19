import type { SavedRunLog } from "@/lib/schemas/run-log";

// A log from an older version must never mark a newly generated session done.
export function logsForPlan(
  logs: readonly SavedRunLog[],
  plan: { id: string; version: number; sessions: readonly { id: string; kind: string }[] },
): Map<string, SavedRunLog> {
  const runIds = new Set(plan.sessions.filter((session) => session.kind === "run").map((session) => session.id));
  return new Map(logs.filter((log) => log.planId === plan.id
    && log.planVersion === plan.version && runIds.has(log.sessionId))
    .map((log) => [log.sessionId, log]));
}

export function summarizeRunLogs(logs: readonly SavedRunLog[]) {
  return logs.reduce((total, log) => {
    if (log.feedback.status === "completed") {
      total.completed += 1;
      total.actualMinutes += log.feedback.actualMinutes;
    } else total.skipped += 1;
    return total;
  }, { completed: 0, skipped: 0, actualMinutes: 0 });
}
