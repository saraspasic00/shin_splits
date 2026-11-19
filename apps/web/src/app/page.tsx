import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import RunnerLoading from "@/components/runner-loading";
import CheckIn from "@/components/saved-check-in";
import PlanError from "@/components/plan-error";
import { createClient } from "@/lib/supabase/server";
import { getWeekPlan } from "@/lib/week-plans";
    import { currentMonday, weekHref } from "@/lib/week-calendar";
import styles from "./home.module.css";
import RunHistory from "@/components/run-history";
const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function calendarDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function getToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function shortDate(value: string) {
  const date = calendarDate(value);

  return `${weekdayFormatter.format(date)} ${dateFormatter.format(date)}`;
}

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <RunnerLoading />
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }
  const savedName: unknown = user.user_metadata?.display_name;

  const displayName =
    typeof savedName === "string" ? savedName.trim().slice(0, 60) : "";

  const result = await getWeekPlan(user.id);

  if (!result.ok) {
    return <PlanError message={result.message} retryHref="/" />;
  }

  const today = getToday();
  const plan = result.saved?.plan ?? null;
  const planHref = plan ? weekHref(plan.weekStart) : "/plan";
    const upcomingWeek = !!plan && plan.weekStart > currentMonday(new Date());
  const runs = (plan?.sessions ?? [])
    .filter((session) => session.kind === "run")
    .sort((a, b) => a.date.localeCompare(b.date));

  const todaySession = plan?.sessions.find((session) => session.date === today);

  const nextRun = runs.find((run) => run.date > today);

  // Keep today's rest day visible when one is explicitly scheduled.
  // Otherwise, show the next run if today's date is outside the plan.
  const featuredSession = todaySession ?? nextRun;

  const plannedMinutes = runs.reduce(
    (total, run) => total + run.durationMinutes,
    0,
  );

  const upcomingRuns = runs.filter((run) => run.date > today).slice(0, 2);

  const weekEnd = plan ? calendarDate(plan.weekStart) : null;

  if (weekEnd) {
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  }

  const weekEndDate = weekEnd?.toISOString().slice(0, 10);
  const isPastPlan = Boolean(weekEndDate && weekEndDate < today);

  const weekHeading = !plan
    ? ""
    : isPastPlan
      ? "Your last saved week."
      : plan.weekStart > today
        ? "Your week ahead."
        : "A little structure.";

  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <p className={styles.kicker}>
          <time dateTime={today}>{shortDate(today)}</time>
          {" / One day at a time"}
        </p>

        <h1>
          {displayName
            ? `Good to see you, ${displayName}.`
            : "Good to see you."}
        </h1>
        <p className={styles.tagline}>
          Running plans that take you into account.
        </p>
      </header>

      <div className={styles.topGrid}>
        <section className={styles.hero} aria-labelledby="run-title">
          <div className={styles.trackLines} aria-hidden="true" />

          <div className={styles.heroContent}>
            <h2 id="run-title" className={styles.kicker}>
              {!plan ? (
                "Your starting line"
              ) : featuredSession ? (
                <>
                  {featuredSession.date === today
                    ? "Today"
                    : `Next run · ${shortDate(featuredSession.date)}`}
                  {" / "}
                  {featuredSession.title}
                </>
              ) : (
                "Your running journal"
              )}
            </h2>

            {featuredSession?.kind === "run" ? (
              <>
                <p className={styles.duration}>
                  <span>{featuredSession.durationMinutes}</span>
                  <span className={styles.unit}>min</span>
                </p>

                <p className={styles.effort}>
                  {featuredSession.effort === "easy"
                    ? "Easy effort"
                    : "Steady effort"}
                </p>
              </>
            ) : (
              <p className={styles.restTitle}>
                {!plan
                  ? "Start where you are."
                  : featuredSession?.kind === "rest"
                    ? "Room to rest."
                    : "No run scheduled."}
              </p>
            )}

            <Link className={styles.action} href={planHref}>
              {!plan
                ? "Create my first week"
                : isPastPlan
                  ? "View saved plan"
                  : "View weekly plan"}
              <span aria-hidden="true">↗</span>
            </Link>

            <p className={styles.heroFooter}>
              {plan
                ? `${runs.length} runs in your saved plan · Week of ${dateFormatter.format(
                    calendarDate(plan.weekStart),
                  )}`
                : "Your history. Your available days. Your starting point."}
            </p>
          </div>
        </section>

        <div className={styles.checkIn}>
          <CheckIn key={today} date={today} />
        </div>
      </div>

      {plan && (
        <section className={styles.week} aria-labelledby="week-overview">
          <div className={styles.sectionHeader}>
            <h2 id="week-overview">{weekHeading}</h2>
            <p>{plannedMinutes} min planned</p>
          </div>

          <p className={styles.tagline}>
            {upcomingWeek ? "Upcoming week" : "Week"} of{" "}
            <time dateTime={plan.weekStart}>
              {dateFormatter.format(calendarDate(plan.weekStart))}
            </time>
          </p>

          <ol className={styles.weekDays}>
            {plan.sessions.map((session) => (
              <li key={session.id}>
                <time
                  dateTime={session.date}
                  aria-current={session.date === today ? "date" : undefined}
                >
                  {weekdayFormatter.format(calendarDate(session.date))}
                </time>

                <span className={styles.sessionName}>{session.title}</span>

                <span className={styles.weekDuration}>
                  {session.kind === "run" ? (
                    <>
                      {session.durationMinutes}
                      <span className={styles.srOnly}> minutes</span>
                    </>
                  ) : (
                    <span aria-label="No running minutes">—</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className={styles.bottomGrid}>
        <section className={styles.upcoming} aria-labelledby="up-next">
          <div className={styles.sectionHeader}>
            <h2 id="up-next">Up next</h2>
            <Link href={planHref}>{plan ? "See your plan" : "Get started"}</Link>
          </div>

          {upcomingRuns.length > 0 ? (
            <ul className={styles.upcomingList}>
              {upcomingRuns.map((run) => (
                <li key={run.id}>
                  <time dateTime={run.date}>
                    {weekdayFormatter.format(calendarDate(run.date))}
                    <span>{dateFormatter.format(calendarDate(run.date))}</span>
                  </time>

                  <span>{run.title}</span>

                  <span className={styles.upcomingDuration}>
                    {run.durationMinutes} min
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {plan
                ? "No upcoming runs in your saved plan."
                : "Your upcoming runs will appear here once you create a plan."}
            </p>
          )}
        </section>

        <RunHistory/>
      </div>
    </div>
  );
}
