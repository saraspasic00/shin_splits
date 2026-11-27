import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RunnerLoading from "@/components/runner-loading";
import RunLogForm from "@/components/run-log-form";
import {
  plannedRunSchema,
  runLogFromRow,
  runLogIdentitySchema,
  type SavedRunLog,
} from "@/lib/schemas/run-log";
import { formatRunDate, runLogToday } from "@/lib/run-log-dates";
import styles from "@/components/run-log.module.css";

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ planId?: string | string[]; version?: string | string[]; from?: string | string[] }>;
};

export default function RunLogPage(props: Props) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className="eyebrow">Your running journal</p>
        <h1>How did it go?</h1>
        <p className="muted">A few details about this session.</p>
      </header>
      <Suspense fallback={<RunnerLoading />}>
        <RunLogContent {...props} />
      </Suspense>
    </div>
  );
}

async function RunLogContent({ params, searchParams }: Props) {
  await connection();
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { sessionId } = await params;
  const query = await searchParams;
  const parsed = runLogIdentitySchema.safeParse({
    sessionId,
    planId: query.planId,
    planVersion: typeof query.version === "string" && /^[1-9]\d*$/.test(query.version)
      ? Number(query.version) : null,
  });
  if (!parsed.success) return <Unavailable message="Open a running session from your weekly plan." />;
  const identity = parsed.data;

  const { data: row, error: logError } = await supabase.from("run_logs").select("*")
    .eq("user_id", user.id).eq("plan_id", identity.planId)
    .eq("plan_version", identity.planVersion).eq("session_id", identity.sessionId)
    .maybeSingle();
  if (logError) return <Unavailable message="Your run log couldn’t load. Reload before editing." />;

  let existing: SavedRunLog | null;
  try { existing = row ? runLogFromRow(row) : null; }
  catch { return <Unavailable message="Your saved log couldn’t be read. Reload before editing." />; }

  let session = existing?.plannedSession;
  if (!session) {
    const { data, error } = await supabase.from("training_plans").select("plan")
      .eq("id", identity.planId).eq("user_id", user.id).maybeSingle();
    if (error) return <Unavailable message="Your plan couldn’t load. Please try again." />;
    const plan: unknown = data?.plan;
    if (typeof plan !== "object" || plan === null || !("version" in plan)
        || plan.version !== identity.planVersion || !("sessions" in plan)
        || !Array.isArray(plan.sessions)) {
      return <Unavailable message="This plan has changed or is unavailable. Open your latest weekly plan." />;
    }
    const candidate: unknown = plan.sessions.find((item: unknown) => (
      typeof item === "object" && item !== null && "id" in item && item.id === sessionId
    ));
    const run = plannedRunSchema.safeParse(candidate);
    if (!run.success) return <Unavailable message="This running session is unavailable." />;
    session = run.data;
  }

  return (
    <section className={styles.card} aria-label="Run feedback">
      <div className={styles.session}>
        <h2>{session.title}</h2>
        <p><time dateTime={session.date}>{formatRunDate(session.date)}</time> · {session.durationMinutes} min planned</p>
      </div>
      <RunLogForm
        key={`${user.id}:${identity.planId}:${identity.planVersion}:${identity.sessionId}:${existing?.revision ?? 0}`}
        fromHome={query.from === "home"}
        identity={identity}
        session={session}
        initialLog={existing}
        today={runLogToday(new Date())}
      />
    </section>
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <section className={styles.card} role="alert">
      <p>{message}</p>
      <Link href="/plan">Back to weekly plan</Link>
    </section>
  );
}
