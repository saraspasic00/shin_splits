"use client";

import { useRef, useState, type SubmitEvent } from "react";

import styles from "./check-in-summary.module.css";
import type { CalendarDate } from "@/types/training";
import { checkInRequestSchema } from "@/lib/schemas/check-in";
import {
  savedCheckInReceiptSchema,
  type SavedCheckIn,
} from "@/lib/schemas/saved-check-in";

const questions = [
  {
    name: "energy",
    label: "Energy",
    options: ["low", "okay", "good"],
  },
  {
    name: "sleep",
    label: "Sleep",
    options: ["poor", "okay", "good"],
  },
] as const;

type SubmissionState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "error"; message: string };

type CheckInProps = {
  date: CalendarDate;
  initialCheckIn?: SavedCheckIn | null;
};

export default function CheckIn({
  date,
  initialCheckIn = null,
}: CheckInProps) {
  const [state, setState] = useState<SubmissionState>({ status: "idle" });
  const [saved, setSaved] = useState(initialCheckIn);
  const [editing, setEditing] = useState(!initialCheckIn);
  const [interacted, setInteracted] = useState(false);
  const inFlight = useRef(false);

  const isSending = state.status === "sending";

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) return;

    const formData = new FormData(event.currentTarget);

    const input = checkInRequestSchema.safeParse({
      date,
      energy: formData.get("energy"),
      sleep: formData.get("sleep"),
    });

    if (!input.success) {
      setState({
        status: "error",
        message: "Check the date and choose both energy and sleep.",
      });
      return;
    }

    inFlight.current = true;
    setState({ status: "sending" });

    try {
      const response = await fetch("/api/check-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        setState({
          status: "error",
          message:
            response.status === 401
              ? "Your session has expired. Sign in again to save."
              : response.status === 422
                ? "Please check your answers."
                : "We couldn’t confirm the save. Your selections are still here. Retry, or reload to check.",
        });
        return;
      }

      const body: unknown = await response.json();
      const receipt = savedCheckInReceiptSchema.safeParse(body);

      if (
        !receipt.success ||
        receipt.data.checkIn.date !== input.data.date ||
        receipt.data.checkIn.energy !== input.data.energy ||
        receipt.data.checkIn.sleep !== input.data.sleep
      ) {
        setState({
          status: "error",
          message: "We couldn’t verify the saved answers. Please reload.",
        });
        return;
      }

      setInteracted(true);
      setSaved(receipt.data.checkIn);
      setEditing(false);
      setState({ status: "idle" });
    } catch {
      setState({
        status: "error",
        message:
          "We couldn’t confirm the save. Your selections are still here. Retry, or reload to check.",
      });
    } finally {
      inFlight.current = false;
    }
  }

  if (saved && !editing) {
    return (
      <section className={`card check-in-card ${styles.summary}`} aria-labelledby="check-in-title">
        <h2 id="check-in-title">Today’s check-in</h2>
        <p><span className={styles.tick} aria-hidden="true">✓</span> Saved</p>
        <p>{saved.energy[0].toUpperCase() + saved.energy.slice(1)} energy · {saved.sleep} sleep</p>
        <button type="button" autoFocus={interacted} onClick={() => {
          setInteracted(true);
          setEditing(true);
        }}>Edit check-in</button>
      </section>
    );
  }

  return (
    <section className="card check-in-card" aria-labelledby="check-in-title">
      <h2 id="check-in-title">How are you feeling?</h2>

      <form
        onSubmit={handleSubmit}
        onChange={() => {
          if (!inFlight.current) setState({ status: "idle" });
        }}
        aria-busy={isSending}
      >
        {questions.map(({ name, label, options }) => (
          <fieldset key={name} disabled={isSending}>
            <legend>{label}</legend>

            <div className="choice-group">
              {options.map((option) => (
                <label className="choice" key={option}>
                  <input
                    type="radio"
                    name={name}
                    value={option}
                    required
                    autoFocus={interacted && name === "energy" && option === saved?.energy}
                    defaultChecked={saved?.[name] === option}
                  />
                  <span>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <p className="form-note">
          Check-in for <time dateTime={date}>{date}</time>.
          {" "}Your check-ins help shape future training weeks.
        </p>

        <button type="submit" disabled={isSending}>
          {isSending
            ? "Saving…"
            : saved
              ? "Update check-in"
              : "Save check-in"}
        </button>

        {saved && <button type="button" disabled={isSending} onClick={() => {
          setState({ status: "idle" });
          setEditing(false);
        }}>Cancel</button>}

        <p className="status" role="status" aria-live="polite">
          {state.status === "sending"
            ? "Saving your check-in…"
            : ""}
        </p>

        {state.status === "error" && (
          <p className="status" role="alert">
            {state.message}
          </p>
        )}
      </form>
    </section>
  );
}
