import Link from "next/link";
import { getRecentCompletedRuns } from "@/lib/run-logs";
import { formatRunDate } from "@/lib/run-log-dates";
import { summarizeRunLogs } from "@/lib/run-log-summary";
import styles from "./run-history.module.css";

// Use within Home's existing Suspense boundary, in place of the placeholder.
export default async function RunHistory() {
  const result = await getRecentCompletedRuns();
  return (
    <section className={styles.history} aria-labelledby="run-history-heading">
      <p className={styles.kicker}>Your running journal</p>
      <h2 id="run-history-heading">Runs you’ve logged.</h2>
      {!result.ok ? (
        <p role="alert">{result.message} <a href="/">Reload</a></p>
      ) : result.logs.length === 0 ? (
        <>
          <p>No completed runs logged yet.</p>
          <Link className={styles.emptyLink} href="/plan">Log a run from your week <span aria-hidden="true">↗</span></Link>
        </>
      ) : (
        <>
          <p className={styles.total}>
            Latest {result.logs.length} {result.logs.length === 1 ? "run" : "runs"} · {summarizeRunLogs(result.logs).actualMinutes} min recorded
          </p>
          <ul className={styles.runs}>
            {result.logs.map((log) => log.feedback.status === "completed" && (
              <li key={log.id}>
                <Link href={{ pathname: `/plan/log/${log.sessionId}`, query: { planId: log.planId, version: String(log.planVersion) } }}>
                  <span className={styles.runLabel}>
                    <strong>{log.plannedSession.title}</strong>
                    <time dateTime={log.feedback.completedOn}>{formatRunDate(log.feedback.completedOn)}</time>
                  </span>
                  <span className={styles.minutes}>{log.feedback.actualMinutes} min <span aria-hidden="true">↗</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
