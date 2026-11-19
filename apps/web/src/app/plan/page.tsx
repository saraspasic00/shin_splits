import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import RunnerLoading from "@/components/runner-loading";
import WeeklyPlan from "@/components/logged-weekly-plan";
import PlanError from "@/components/plan-error";
import { ensureWeek } from "@/lib/ensure-week";
import { createClient } from "@/lib/supabase/server";
import { getNextWeekStart } from "@/lib/saved-plan";
import { getWeekPlan } from "@/lib/week-plans";
import { currentMonday, isWeek, offsetDate, weekHref } from "@/lib/week-calendar";
import { formatRunDate } from "@/lib/run-log-dates";
import styles from "./week-nav.module.css";

type Props = { searchParams: Promise<{ week?: string | string[] }> };

export default function PlanPage(props: Props) {
  return <div className="plan-page">
    <header className="page-header">
      <p className="eyebrow">One day at a time</p>
      <h1>Your week, laid out.</h1>
      <p className="muted">A little structure. Room for real life.</p>
    </header>
    <Suspense fallback={<RunnerLoading />}><PlanContent {...props} /></Suspense>
  </div>;
}

async function PlanContent({ searchParams }: Props) {
  await connection();
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (!user || error) redirect("/login");
  const current = currentMonday(new Date());
  const { week } = await searchParams;
  if (week !== undefined && !isWeek(week)) redirect(weekHref(current));
  const nextStart = getNextWeekStart();
  let result = await getWeekPlan(user.id, week, current);
  let reason = "";
  if (result.ok && !result.saved && (!week || week === nextStart)) {
    try {
      const outcome = await ensureWeek(db, user.id, nextStart);
      if (outcome === "missing-profile") reason = "Set up your running profile to get your first week.";
      else if (outcome === "unsupported") reason = "Weekly planning currently supports regular runners building consistency with a recent running baseline.";
      else result = await getWeekPlan(user.id, week, current);
    } catch {
      return <PlanError message="We couldn’t prepare your week. Please try again." retryHref={weekHref(nextStart)} />;
    }
  }
  if (!result.ok) return <PlanError message={result.message} retryHref={week ? weekHref(week) : "/plan"} />;
  const saved = result.saved;
  const selected = week ?? saved?.plan.weekStart ?? current;
  return <div className="saved-plan-content">
    <div className={styles.toolbar}>
      <div><strong>Week of {formatRunDate(selected)}</strong>
        {saved && <span className="saved-plan-status">Saved</span>}
        {selected > current && <span className={styles.upcoming}>Upcoming week</span>}
      </div>
      <nav aria-label="Choose training week" className={styles.controls}>
        <Link href={weekHref(offsetDate(selected, -7))}>← Previous</Link>
        <Link aria-current={selected === current ? "date" : undefined} href={weekHref(current)}>This week</Link>
        <Link href={weekHref(offsetDate(selected, 7))}>Next →</Link>
      </nav>
      <Link className="plan-profile-button" href="/onboarding">Edit running profile ↗</Link>
    </div>
    {saved ? <>
      <WeeklyPlan plan={saved.plan} />
      {saved.notes.length > 0 && <details className="plan-explanation">
        <summary>About your week</summary><ul>{saved.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
      </details>}
    </> : <section className="card">
      <h2>No saved plan for this week.</h2>
      {reason ? <><p>{reason}</p><Link href="/onboarding">Open running profile</Link></>
        : <Link href={weekHref(nextStart)}>Open next week’s plan</Link>}
    </section>}
  </div>;
}
