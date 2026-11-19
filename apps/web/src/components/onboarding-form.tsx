"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { z } from "zod";
import {
  runnerProfileSchema,
  weekdays,
  type RunnerProfile,
} from "@/lib/schemas/runner-profile";
import {
  experienceLabels,
  goalLabels,
  profilePlanReceiptSchema,
} from "@/lib/profile-plan-contract";
import styles from "./runner-profile.module.css";
import { weekHref } from "@/lib/week-calendar";

type Draft = {
  experience: string;
  goal: string;
  raceDate: string;
  currentRunsPerWeek: string;
  currentWeeklyMinutes: string;
  longestRecentRunMinutes: string;
  maxSessionMinutes: string;
  availableDays: RunnerProfile["availableDays"];
};

const steps = ["Your running", "Your goal", "Your week"];
const fieldLabels: Record<string, string> = {
  experience: "Experience",
  goal: "Goal",
  raceDate: "Race date",
  currentRunsPerWeek: "Running days",
  currentWeeklyMinutes: "Weekly minutes",
  longestRecentRunMinutes: "Longest run",
  availableDays: "Available days",
  maxSessionMinutes: "Session limit",
};

function toNumber(value: string) {
  return value.trim() ? Number(value) : Number.NaN;
}

export default function OnboardingForm({
  initialProfile = null,
}: {
  initialProfile?: RunnerProfile | null;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    experience: initialProfile?.experience ?? "",
    goal: initialProfile?.goal ?? "",
    raceDate: initialProfile?.raceDate ?? "",
    currentRunsPerWeek: String(initialProfile?.currentRunsPerWeek ?? ""),
    currentWeeklyMinutes: String(initialProfile?.currentWeeklyMinutes ?? ""),
    longestRecentRunMinutes: String(
      initialProfile?.longestRecentRunMinutes ?? "",
    ),
    maxSessionMinutes: String(initialProfile?.maxSessionMinutes ?? ""),
    availableDays: initialProfile?.availableDays ?? [],
  }));
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const previousStep = useRef(0);
  const isRaceGoal = draft.goal === "5k" || draft.goal === "10k";

  function goToStep(next: number) {
    setDirection(next > step ? "forward" : "back");
    setStep(next);
  }

  useEffect(() => {
    if (previousStep.current !== step) {
      heading.current?.focus();
      previousStep.current = step;
    }
  }, [step]);

  useEffect(() => {
    if (errors.length) errorBox.current?.focus();
  }, [errors]);

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    requestId.current = null;
    setErrors([]);
  }

  function payload() {
    return {
      experience: draft.experience,
      goal: draft.goal,
      raceDate: isRaceGoal && draft.raceDate ? draft.raceDate : undefined,
      currentRunsPerWeek: toNumber(draft.currentRunsPerWeek),
      currentWeeklyMinutes: toNumber(draft.currentWeeklyMinutes),
      longestRecentRunMinutes: toNumber(draft.longestRecentRunMinutes),
      availableDays: draft.availableDays,
      maxSessionMinutes: toNumber(draft.maxSessionMinutes),
    };
  }

  function showIssues(issues: { path: PropertyKey[]; message: string }[]) {
    setErrors(
      issues.map(
        (issue) =>
          `${fieldLabels[String(issue.path[0])] ?? "Answers"}: ${issue.message}`,
      ),
    );
  }

  function validateHistory(): boolean {
    // Validate this step independently of unfinished later steps.
    const result = runnerProfileSchema.safeParse({
      ...payload(),
      goal: "consistency",
      raceDate: undefined,
      availableDays: ["mon"],
      maxSessionMinutes: 30,
    });
    if (!result.success) {
      showIssues(result.error.issues);
      return false;
    }
    if (
      result.data.currentWeeklyMinutes >
      result.data.currentRunsPerWeek * result.data.longestRecentRunMinutes
    ) {
      setErrors([
        "Weekly minutes cannot exceed running days multiplied by your longest run. Use the same week for all three answers.",
      ]);
      return false;
    }
    return true;
  }

  function validateGoal(): boolean {
    if (!Object.hasOwn(goalLabels, draft.goal)) {
      setErrors(["Choose what you want to work toward."]);
      return false;
    }
    if (isRaceGoal && draft.raceDate) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (
        !z.iso.date().safeParse(draft.raceDate).success ||
        draft.raceDate <= today
      ) {
        setErrors(["Choose a future race date, or leave it empty."]);
        return false;
      }
    }
    return true;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setErrors([]);
    if (step === 0) {
      if (validateHistory()) goToStep(1);
      return;
    }
    if (step === 1) {
      if (validateGoal()) goToStep(2);
      return;
    }

    const result = runnerProfileSchema.safeParse(payload());
    if (!result.success) {
      showIssues(result.error.issues);
      return;
    }
    if (!validateHistory()) {
      goToStep(0);
      return;
    }
    if (!validateGoal()) {
      goToStep(1);
      return;
    }

    inFlight.current = true;
    setSaving(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/runner-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestId.current,
          profile: result.data,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ message: z.string() }).safeParse(body);
        setErrors([
          error.success
            ? error.data.message
            : "We couldn’t confirm the save. Retry, or reload to check your plan.",
        ]);
        return;
      }
      const receipt = profilePlanReceiptSchema.safeParse(body);
      if (!receipt.success) {
        setErrors(["We couldn’t verify the save. Reload to check your plan."]);
        return;
      }
      // Full navigation fetches the updated plan with the existing auth cookies.
      window.location.assign(weekHref(receipt.data.weekStart));
    } catch {
      setErrors([
        "We couldn’t confirm the save. Your answers are still here. Retry, or reload to check your plan.",
      ]);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className={styles.wizard} aria-label="Running profile">
      <ol className={styles.steps} aria-label="Your progress" data-step={step}>
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            data-complete={index < step}
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {label}
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <div className={styles.stepPanel} key={step} data-direction={direction}>
          <div className={styles.stepHeading}>
            <p className="eyebrow">Step {step + 1} of 3</p>
            <h2 ref={heading} tabIndex={-1}>
              {
                [
                  "Start where you are.",
                  "Something to run toward.",
                  "Make room for running.",
                ][step]
              }
            </h2>
          </div>

          <fieldset disabled={saving} className={styles.fields}>
            <legend className={styles.srOnly}>{steps[step]}</legend>

            {step === 0 && (
              <>
                <label htmlFor="experience">Your running experience</label>
                <select
                  id="experience"
                  value={draft.experience}
                  onChange={(event) => change("experience", event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Choose an option
                  </option>
                  {Object.entries(experienceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p id="baseline-help" className={styles.hint}>
                  Use one representative week from the last four weeks for all
                  three answers. If you haven’t been running, enter 0.
                </p>
                <div className={styles.numbers}>
                  <div>
                    <label htmlFor="currentRunsPerWeek">Days you ran</label>
                    <input
                      id="currentRunsPerWeek"
                      type="number"
                      min="0"
                      max="7"
                      step="1"
                      required
                      aria-describedby="baseline-help"
                      value={draft.currentRunsPerWeek}
                      onChange={(event) =>
                        change("currentRunsPerWeek", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="currentWeeklyMinutes">Total minutes</label>
                    <input
                      id="currentWeeklyMinutes"
                      type="number"
                      min="0"
                      max="10080"
                      step="1"
                      required
                      aria-describedby="baseline-help"
                      value={draft.currentWeeklyMinutes}
                      onChange={(event) =>
                        change("currentWeeklyMinutes", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="longestRecentRunMinutes">
                      Longest run · min
                    </label>
                    <input
                      id="longestRecentRunMinutes"
                      type="number"
                      min="0"
                      max="1440"
                      step="1"
                      required
                      aria-describedby="baseline-help"
                      value={draft.longestRecentRunMinutes}
                      onChange={(event) =>
                        change("longestRecentRunMinutes", event.target.value)
                      }
                    />
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <fieldset className={styles.goalOptions}>
                  <legend className={styles.srOnly}>Your goal</legend>
                  {Object.entries(goalLabels).map(([value, label]) => (
                    <label key={value} className={styles.goalOption}>
                      <input
                        type="radio"
                        name="goal"
                        value={value}
                        checked={draft.goal === value}
                        onChange={() => change("goal", value)}
                        required
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                {isRaceGoal && (
                  <div>
                    <label htmlFor="raceDate">
                      Race date{" "}
                      <span className={styles.optional}>(optional)</span>
                    </label>
                    <input
                      id="raceDate"
                      type="date"
                      value={draft.raceDate}
                      onChange={(event) =>
                        change("raceDate", event.target.value)
                      }
                    />
                  </div>
                )}
                <p className={styles.hint}>
                  The current planner supports regular runners building
                  consistency. Other goals remain available to explore, but
                  cannot be saved with a plan yet.
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <fieldset>
                  <legend>Which days could you run?</legend>
                  <div className={styles.days}>
                    {weekdays.map((day) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          name="availableDays"
                          value={day}
                          checked={draft.availableDays.includes(day)}
                          onChange={(event) =>
                            change(
                              "availableDays",
                              weekdays.filter((item) =>
                                item === day
                                  ? event.target.checked
                                  : draft.availableDays.includes(item),
                              ),
                            )
                          }
                        />
                        <span>{day}</span>
                      </label>
                    ))}
                  </div>
                  <p className={styles.hint}>
                    Possible days, not a commitment to run on all of them.
                  </p>
                </fieldset>
                <div className={styles.limit}>
                  <label htmlFor="maxSessionMinutes">
                    Time available per session{" "}
                    <span className={styles.optional}>(minutes)</span>
                  </label>
                  <input
                    id="maxSessionMinutes"
                    type="number"
                    min="1"
                    max="1440"
                    step="1"
                    required
                    value={draft.maxSessionMinutes}
                    onChange={(event) =>
                      change("maxSessionMinutes", event.target.value)
                    }
                  />
                </div>
                <div className={styles.review}>
                  <p className="eyebrow">Your starting point</p>
                  <p>
                    {
                      Object.entries(experienceLabels).find(
                        ([key]) => key === draft.experience,
                      )?.[1]
                    }{" "}
                    ·{" "}
                    {
                      Object.entries(goalLabels).find(
                        ([key]) => key === draft.goal,
                      )?.[1]
                    }
                  </p>
                  <p>
                    {draft.currentRunsPerWeek} days ·{" "}
                    {draft.currentWeeklyMinutes} min in your example week ·
                    longest run {draft.longestRecentRunMinutes} min
                  </p>
                  {isRaceGoal && draft.raceDate && (
                    <p>Race date: {draft.raceDate}</p>
                  )}
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => {
                      setErrors([]);
                      goToStep(0);
                    }}
                  >
                    Edit starting point
                  </button>
                </div>
                <p className={styles.hint}>
                  Saving creates or updates next week, starting Monday. Previous
                  versions are kept; the current week is unchanged.
                </p>
              </>
            )}
          </fieldset>
        </div>

        {errors.length > 0 && (
          <div
            className={styles.error}
            ref={errorBox}
            tabIndex={-1}
            role="alert"
          >
            <ul>
              {[...new Set(errors)].map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          {step > 0 ? (
            <button
              type="button"
              className={styles.secondary}
              disabled={saving}
              onClick={() => {
                setErrors([]);
                goToStep(step - 1);
              }}
            >
              Back
            </button>
          ) : (
            <a href="/profile">Back to profile</a>
          )}
          <button type="submit" disabled={saving}>
            {saving
              ? "Saving your week…"
              : step < 2
                ? "Continue"
                : initialProfile
                  ? "Save & update my plan"
                  : "Save & create my plan"}
          </button>
        </div>
        <p className={styles.status} role="status">
          {saving
            ? "Creating your plan, then saving both your profile and plan…"
            : ""}
        </p>
      </form>
    </section>
  );
}
