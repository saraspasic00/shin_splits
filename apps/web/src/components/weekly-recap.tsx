import "server-only";
import styles from "./weekly-recap.module.css";
import { z } from "zod";
import { runLogToday } from "@/lib/run-log-dates";
import type { SavedRunLog } from "@/lib/schemas/run-log";
import type { TrainingPlan } from "@/types/training";

const count = z.number().int().min(0).max(7);
const minutes = z.number().int().nonnegative();
const factsSchema = z.object({
  week_start: z.iso.date(), as_of: z.iso.date(),
  planned_runs: count, planned_minutes: minutes, completed_runs: count,
  recorded_minutes: minutes, skipped_runs: count, past_without_feedback: count,
  due_today: count, upcoming_runs: count,
});

export default async function WeeklyRecap({ plan, logs }: {
  plan: TrainingPlan; logs: SavedRunLog[];
}) {
  const today = runLogToday(new Date());
  let facts;
  try {
    const base = process.env.API_BASE_URL;
    if (!base) throw Error("Missing API base");
    const response = await fetch(new URL("/api/v1/weekly-recap", base), {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        as_of: today,
        plan: { id: plan.id, version: plan.version, weekStart: plan.weekStart,
          sessions: plan.sessions.map(s => ({ id: s.id, kind: s.kind, date: s.date,
            durationMinutes: s.kind === "run" ? s.durationMinutes : null })) },
        logs: logs.map(({ planId, planVersion, sessionId, feedback }) => ({
          planId, planVersion, sessionId, feedback: { status: feedback.status,
            completedOn: feedback.completedOn, actualMinutes: feedback.actualMinutes },
        })),
      }),
    });
    if (!response.ok) throw Error("Recap unavailable");
    facts = factsSchema.parse(await response.json());
    if (facts.week_start !== plan.weekStart || facts.as_of !== today) throw Error("Wrong week");
  } catch {
    return <p className="muted">The weekly recap couldn’t load. <a href={"/plan?week=" + plan.weekStart}>Try again</a></p>;
  }
  const statuses = [
    [facts.skipped_runs, "skipped"],
    [facts.past_without_feedback, "without feedback"],
    [facts.due_today, "due today"],
    [facts.upcoming_runs, "upcoming"],
  ] as const;
  const statusLine = statuses.filter(([n]) => n > 0)
    .map(([n, label]) => n + " " + label).join(" · ");

  return (
    <section className={styles.recap} aria-labelledby="weekly-recap-title">
      <div>
        <h2 id="weekly-recap-title">Weekly recap</h2>
        {statusLine && <p>{statusLine}</p>}
      </div>
      <dl className={styles.metrics}>
        <div>
          <dt>Runs completed</dt>
          <dd>{facts.completed_runs} <small>of {facts.planned_runs}</small></dd>
        </div>
        <div>
          <dt>Minutes recorded</dt>
          <dd>{facts.recorded_minutes} <small>of {facts.planned_minutes} planned</small></dd>
        </div>
      </dl>
    </section>
  );
}
