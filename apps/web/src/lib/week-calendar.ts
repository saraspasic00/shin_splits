import { runLogToday } from "./run-log-dates";

export function offsetDate(date: string, days: number) {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mondayOf(date: string) {
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  return offsetDate(date, -((weekday + 6) % 7));
}

export function currentMonday(now: Date) {
  return mondayOf(runLogToday(now));
}

export function isWeek(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value) || value < "1900-01-01" || value > "9998-12-31") return false;
  const day = new Date(value + "T00:00:00Z");
  return Number.isFinite(day.getTime()) && day.toISOString().startsWith(value) && day.getUTCDay() === 1;
}

export function weekHref(week: string) {
  return "/plan?week=" + encodeURIComponent(week);
}
