import Link from "next/link";
import type { TrainingPlan } from "@/types/training";
import type { SavedRunLog } from "@/lib/schemas/run-log";
import { formatRunDate } from "@/lib/run-log-dates";
import { logsForPlan, summarizeRunLogs } from "@/lib/run-log-summary";
import styles from "./run-log.module.css";

type Props = { plan: TrainingPlan; logs?: readonly SavedRunLog[] | null };

const dayFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

export default function WeeklyPlan({ plan, logs = [] }: Props) {
  const runs = plan.sessions.filter((session) => session.kind === "run");
  const plannedMinutes = runs.reduce((total, run) => total + run.durationMinutes, 0);
  const bySession = logsForPlan(logs ?? [], plan);
  const progress = summarizeRunLogs([...bySession.values()]);

  return (
    <section id="week" className="weekly-plan" aria-label="Weekly training schedule">
      <div className="plan-overview">
        <p><strong>{runs.length}</strong> running days</p>
        <span aria-hidden="true" className="overview-divider" />
        <p><strong>{plannedMinutes}</strong> planned minutes</p>
      </div>
      {bySession.size > 0 && (
        <p className={styles.progress}>
          {progress.completed} completed · {progress.skipped} skipped · {progress.actualMinutes} min recorded
        </p>
      )}

      <ol className="session-list">
        {plan.sessions.map((session) => {
          const date = new Date(`${session.date}T00:00:00Z`);
          const isRun = session.kind === "run";
          const log = bySession.get(session.id);
          const feedback = log?.feedback;
          return (
            <li className="session-row" key={session.id}>
              <time className="session-date" dateTime={session.date}>
                <span>{dayFormatter.format(date)}</span>
                <span>{dateFormatter.format(date)}</span>
              </time>
              <details className={`workout-card ${isRun ? "workout-card-run" : "workout-card-rest"} ${styles.calendarCard}`}
                data-outcome={feedback?.status}>
                <summary className="workout-summary">
                  <span className="workout-symbol" aria-hidden="true">
                    {isRun ? (
                      <svg viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="13" r="7.5" />
                        <path d="M12 9v4l2.5 1.5M9 2h6M12 2v3M18 5l2 2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none"><path d="M9 6v12M15 6v12" /></svg>
                    )}
                  </span>
                  <span className="workout-heading">
                    <span className="workout-title">{session.title}</span>
                    <span className="workout-subtitle">
                      {session.kind === "run"
                        ? `${session.durationMinutes} min planned · ${session.effort === "easy" ? "Easy" : "Steady"} effort`
                        : "No run scheduled"}
                    </span>
                    {feedback && (
                      <span className={styles.outcomeBadge} data-outcome={feedback.status}>
                        <span aria-hidden="true">{feedback.status === "completed" ? "✓" : "—"}</span>
                        {feedback.status === "completed" ? `Completed · ${feedback.actualMinutes} min` : "Skipped"}
                      </span>
                    )}
                  </span>
                  <svg className="workout-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m7 10 5 5 5-5" />
                  </svg>
                </summary>
                <div className="workout-details">
                  {session.kind === "run" ? (
                    <dl className="workout-facts">
                      <div><dt>Planned</dt><dd>{session.durationMinutes} minutes</dd></div>
                      <div><dt>Effort</dt><dd>{session.effort === "easy" ? "Easy" : "Steady"}</dd></div>
                      {feedback?.status === "completed" && (
                        <>
                          <div><dt>Recorded</dt><dd>{feedback.actualMinutes} minutes</dd></div>
                          {feedback.completedOn !== session.date && (
                            <div><dt>Ran on</dt><dd><time dateTime={feedback.completedOn}>{formatRunDate(feedback.completedOn)}</time></dd></div>
                          )}
                          {feedback.perceivedEffort !== null && (
                            <div><dt>Felt like</dt><dd>{feedback.perceivedEffort}/10</dd></div>
                          )}
                        </>
                      )}
                    </dl>
                  ) : <p>There is no running session planned for this day.</p>}
                  {feedback?.note && <p className={styles.feedbackNote}>{feedback.note}</p>}
                  {isRun && plan.source !== "sample" && logs !== null && (
                    <Link className={styles.calendarAction} href={{
                      pathname: `/plan/log/${session.id}`,
                      query: { planId: plan.id, version: String(plan.version) },
                    }}>
                      {log ? "Edit feedback" : "Log this run"}
                    </Link>
                  )}
                  {plan.source === "sample" && (
                    <p className="workout-note">Example schedule for exploring the app. This session has not been personalized.</p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
      <footer className="weekly-plan-footer">Planned time includes running sessions only.</footer>
    </section>
  );
}
