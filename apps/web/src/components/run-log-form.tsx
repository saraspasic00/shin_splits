"use client";

import Link from "next/link";
import { useRef, useState, type SubmitEvent } from "react";
import {
  runLogReceiptSchema,
  runLogRequestSchema,
  sameFeedback,
  type PlannedRun,
  type RunLogIdentity,
  type SavedRunLog,
} from "@/lib/schemas/run-log";
import { completionDateForSession, formatRunDate, runFeedbackDateError } from "@/lib/run-log-dates";
import styles from "./run-log.module.css";
import{ mondayOf, weekHref} from "@/lib/week-calendar"
type Props = {
  identity: RunLogIdentity;
  session: PlannedRun;
  today: string;
  initialLog: SavedRunLog | null;
};

export default function RunLogForm({ identity, session, today, initialLog }: Props) {
  const [saved, setSaved] = useState(initialLog);
  const [outcome, setOutcome] = useState<"completed" | "skipped">(
    initialLog?.feedback.status ?? "completed",
  );
  const [minutes, setMinutes] = useState(String(initialLog?.feedback.actualMinutes ?? ""));
  const [effort, setEffort] = useState(String(initialLog?.feedback.perceivedEffort ?? ""));
  const [note, setNote] = useState(initialLog?.feedback.note ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialLog ? "Your saved run log. You can update it here." : "");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const inFlight = useRef(false);
  const completedOn = completionDateForSession(session, saved);
  const futureCompletion = outcome === "completed" && completedOn > today;
const returnHref = weekHref(mondayOf(session.date));
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || conflict) return;

    const input = runLogRequestSchema.safeParse({
      ...identity,
      expectedRevision: saved?.revision ?? 0,
      feedback: outcome === "completed" ? {
        status: "completed", completedOn,
        actualMinutes: minutes.trim() === "" ? null : Number(minutes),
        perceivedEffort: effort === "" ? null : Number(effort), note,
      } : {
        status: "skipped", completedOn: null,
        actualMinutes: null, perceivedEffort: null, note,
      },
    });

    if (!input.success) {
      setError("Enter a duration in whole minutes. Notes can contain up to 1,000 characters.");
      return;
    }
    const dateError = runFeedbackDateError(input.data.feedback, today);
    if (dateError) { setError(dateError); return; }

    inFlight.current = true;
    setPending(true);
    setError(null);
    setMessage("");
    let navigating = false;

    try {
      const response = await fetch("/api/run-logs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
        signal: AbortSignal.timeout(10000),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const serverMessage = typeof body === "object" && body !== null
          && "message" in body && typeof body.message === "string" ? body.message : null;
        if (response.status === 409) setConflict(true);
        setError(serverMessage ?? "We couldn’t confirm the save. Your answers are still here.");
        return;
      }

      const receipt = runLogReceiptSchema.safeParse(body);
      if (!receipt.success || receipt.data.log.planId !== identity.planId
          || receipt.data.log.planVersion !== identity.planVersion
          || receipt.data.log.sessionId !== identity.sessionId
          || !sameFeedback(receipt.data.log.feedback, input.data.feedback)) {
        setError("We couldn’t verify the save. Reload to check your run log.");
        return;
      }
      setSaved(receipt.data.log);
      setNote(receipt.data.log.feedback.note);
      setMessage("Saved. Opening your updated week…");
      // A fresh request discards any prefetched calendar/Home payloads.
      // Route-handler revalidation alone does not refresh the client router.
      window.location.assign(returnHref);
      navigating = true;
    } catch {
      setError("We couldn’t confirm the save. Check your connection and try again.");
    } finally {
      if (!navigating) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      onChange={() => { if (!inFlight.current) { setMessage(""); if (!conflict) setError(null); } }}
      aria-busy={pending}
    >
      <fieldset disabled={pending || conflict}>
        <legend>What happened?</legend>
        <div className={styles.outcomes}>
          {(["completed", "skipped"] as const).map((value) => (
            <label key={value}>
              <input type="radio" name="outcome" value={value} checked={outcome === value}
                onChange={() => setOutcome(value)} />
              {value === "completed" ? "I ran" : "I skipped it"}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={pending || conflict} className={styles.fields}>
        <legend className={styles.srOnly}>Run details</legend>
        {outcome === "completed" && !futureCompletion && (
          <>
            {completedOn !== session.date && (
              <p className={styles.hint}>Previously recorded on <time dateTime={completedOn}>{formatRunDate(completedOn)}</time>.</p>
            )}
            <label>
                Actual minutes
                <input type="number" value={minutes} min={1} max={1440} step={1} required
                  inputMode="numeric" onChange={(event) => setMinutes(event.target.value)} />
            </label>
            <label>
              How hard did it feel? <span className={styles.optional}>(optional)</span>
              <select value={effort} onChange={(event) => setEffort(event.target.value)}>
                <option value="">Choose an effort</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}{value === 1 ? " — very easy" : value === 10 ? " — maximum effort" : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {futureCompletion && (
          <p id="run-date-note" className={styles.hint}>This session is on {formatRunDate(session.date)}. You can skip it now; completion is available from that date.</p>
        )}
        {outcome === "skipped" && (
          <p className={styles.hint}>This session will be marked skipped. It won’t count toward your completed runs or minutes.</p>
        )}
        <label>
          Anything to add? <span className={styles.optional}>(optional)</span>
          <textarea value={note} rows={3} maxLength={1000}
            onChange={(event) => setNote(event.target.value)} />
        </label>
      </fieldset>

      <div className={styles.actions}>
        <button type="submit" disabled={pending || conflict || futureCompletion}
          aria-describedby={futureCompletion ? "run-date-note" : undefined}>
          {pending ? "Saving…" : outcome === "skipped" ? "Save as skipped" : saved ? "Update run log" : "Save run log"}
        </button>
        <Link href={returnHref}>Back to weekly plan</Link>
      </div>
      <p className={styles.status} role="status">{pending ? "Saving your run log…" : message}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {conflict && <button type="button" onClick={() => window.location.reload()}>Reload saved version</button>}
    </form>
  );
}
