import { Suspense } from "react";
import WeeklyRecap from "@/components/weekly-recap";
import WeeklyPlan from "@/components/weekly-plan";
import { getPlanRunLogs } from "@/lib/run-logs";
import type { TrainingPlan } from "@/types/training";
import styles from "./run-log.module.css";

// Render this inside the plan page's existing Suspense boundary.
export default async function LoggedWeeklyPlan({ plan }: { plan: TrainingPlan }) {
  if (plan.source === "sample") return <WeeklyPlan plan={plan} />;
  const result = await getPlanRunLogs(plan.id, plan.version);
  return (
    <>
      {!result.ok && (
        <p className={styles.loadError} role="alert">
          {result.message} <a href={"/plan?week=" + plan.weekStart}>Reload your week</a>
        </p>
      )}
      <WeeklyPlan plan={plan} logs={result.ok ? result.logs : null} />
      {result.ok && <Suspense fallback={null}>
        <WeeklyRecap plan={plan} logs={result.logs} />
      </Suspense>}
    </>
  );
}
