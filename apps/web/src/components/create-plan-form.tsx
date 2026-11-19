"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createFirstPlan,
  type CreatePlanState,
} from "@/app/plan/actions";

const initialState: CreatePlanState = { error: null };

export default function CreatePlanForm({
  weekStart,
}: {
  weekStart: string;
}) {
  const action = createFirstPlan.bind(null, weekStart);
  const [state, formAction, pending] = useActionState(
    action,
    initialState,
  );

  const startLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${weekStart}T00:00:00Z`));

  return (
    <section className="plan-start">
      <p className="eyebrow">Your starting line</p>
      <h2>A week built around you.</h2>
      <p>
        We’ll use your saved running history and available days
        to create your first week.
      </p>

      <p className="plan-start-date">
        Starts Monday, {startLabel}
      </p>

      <form action={formAction}>
        <button type="submit" disabled={pending}>
          {pending ? "Creating your plan…" : "Create my plan"}
        </button>

        <p className="status" role="status">
          {pending ? "Putting your week together and saving it…" : ""}
        </p>

        {state.error && (
          <p className="plan-create-error" role="alert">
            {state.error}
          </p>
        )}
      </form>

      <Link href="/onboarding" className="plan-profile-link">
        Review my running profile
      </Link>
    </section>
  );
}