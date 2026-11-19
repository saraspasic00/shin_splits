import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { profileFromRow } from "@/lib/runner-profile-mapping";
import { experienceLabels, goalLabels } from "@/lib/profile-plan-contract";
import { weekdays, type RunnerProfile } from "@/lib/schemas/runner-profile";
import SignOutButton from "@/components/sign-out-button";
import styles from "@/components/runner-profile.module.css";
import RunnerLoading from "@/components/runner-loading";

export default function ProfilePage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <p className="eyebrow">The runner behind the plan</p>
        <h1>Your running, your way.</h1>
        <p>Your starting point and the space you make for running.</p>
      </header>
      <Suspense fallback={<RunnerLoading />}>
        <AccountDetails />
      </Suspense>
    </>
  );
}

async function AccountDetails() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const rawName: unknown = user.user_metadata?.display_name;
  const name =
    typeof rawName === "string" && rawName.trim()
      ? rawName.trim().slice(0, 60)
      : "Your account";
  let profile: RunnerProfile | null = null;
  let loadFailed = false;
  try {
    const { data, error: profileError } = await supabase
      .from("runner_profiles")
      .select()
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) loadFailed = true;
    else if (data) profile = profileFromRow(data);
  } catch {
    loadFailed = true;
  }

  return (
    <div className={styles.profileGrid}>
      <section className={styles.identity} aria-labelledby="account-heading">
        <span className={styles.monogram} aria-hidden="true">
          {name === "Your account"
            ? "ss"
            : Array.from(name)[0].toLocaleUpperCase("en-GB")}
        </span>
        <div className={styles.identityText}>
          <p className="eyebrow">Your corner</p>
          <h2 id="account-heading">{name}</h2>
          <p className={styles.email}>{user.email}</p>
        </div>
        <div className={styles.accountControls}>
          <SignOutButton />
        </div>
      </section>

      {loadFailed ? (
        <section className={styles.summaryCard} role="alert">
          <h2>Your running profile couldn’t load.</h2>
          <p>Your account is connected. Reload to see your saved answers.</p>
          <a href="/profile">Try again</a>
        </section>
      ) : profile ? (
        <>
          <section
            className={styles.summaryCard}
            aria-labelledby="baseline-heading"
          >
            <p className="eyebrow">Your starting point</p>
            <h2 id="baseline-heading">{goalLabels[profile.goal]}</h2>
            <p>{experienceLabels[profile.experience]}</p>
            <dl className={styles.stats}>
              <div>
                <dt>running days</dt>
                <dd>{profile.currentRunsPerWeek}</dd>
              </div>
              <div>
                <dt>weekly minutes</dt>
                <dd>{profile.currentWeeklyMinutes}</dd>
              </div>
              <div>
                <dt>longest run · min</dt>
                <dd>{profile.longestRecentRunMinutes}</dd>
              </div>
            </dl>
            <p className={styles.hint}>
              Your reported example week, not a completed-activity total.
            </p>
            {profile.raceDate && (
              <p>
                Race date:{" "}
                <time dateTime={profile.raceDate}>{profile.raceDate}</time>
              </p>
            )}
          </section>
          <section
            className={styles.scheduleCard}
            aria-labelledby="schedule-heading"
          >
            <p className="eyebrow">Room in your week</p>
            <h2 id="schedule-heading">A rhythm that fits.</h2>
            <ul
              className={styles.dayChips}
              aria-label="Your running availability"
            >
              {weekdays.map((day) => {
                const available = profile.availableDays.includes(day);
                return (
                  <li key={day} data-available={available}>
                    <span>{day}</span>
                    <span className={styles.dayMark} aria-hidden="true">
                      {available ? "✓" : "—"}
                    </span>
                    <span className={styles.srOnly}>
                      {available ? ": available" : ": not selected"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p>
              Up to <strong>{profile.maxSessionMinutes} minutes</strong>{" "}
              available per session.
            </p>
            <div className={styles.profileActions}>
              <Link className="button-link" href="/onboarding">
                Edit running profile
              </Link>
              <Link href="/plan">View weekly plan</Link>
            </div>
          </section>
        </>
      ) : (
        <section className={styles.summaryCard}>
          <p className="eyebrow">Start where you are</p>
          <h2>A little more like you.</h2>
          <p>
            Add your running history, goal, and available days to build your
            first week.
          </p>
          <Link className="button-link" href="/onboarding">
            Set up my running profile
          </Link>
        </section>
      )}
    </div>
  );
}
