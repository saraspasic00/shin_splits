import type { PlannedRun, RunFeedback, SavedRunLog } from "@/lib/schemas/run-log";

// Matches the existing planning timezone. User-selectable zones come later.
export const RUN_LOG_TIME_ZONE = "Europe/Amsterdam";

export function runLogToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: RUN_LOG_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function completionDateForSession(
  session: PlannedRun,
  existing: SavedRunLog | null,
): string {
  // Earlier versions allowed an explicit actual date. Preserve those records.
  return existing?.feedback.status === "completed"
    ? existing.feedback.completedOn
    : session.date;
}

export function runFeedbackDateError(feedback: RunFeedback, today: string): string | null {
  if (feedback.status === "skipped") return null;
  if (feedback.completedOn > today) {
    return "This session is in the future. You can skip it now, or record completion from its scheduled date.";
  }
  if (feedback.completedOn < "1900-01-01") return "This session has an invalid date.";
  return null;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

export function formatRunDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}
