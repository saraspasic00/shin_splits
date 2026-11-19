import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import OnboardingForm from "@/components/onboarding-form";
import { createClient } from "@/lib/supabase/server";
import { profileFromRow } from "@/lib/runner-profile-mapping";
import type { RunnerProfile } from "@/lib/schemas/runner-profile";
import styles from "@/components/runner-profile.module.css";
import RunnerLoading from "@/components/runner-loading";
export default function OnboardingPage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <p className="eyebrow">Your starting line</p>
        <h1>Make it your kind of week.</h1>
        <p>Three short steps. A plan that fits your starting point.</p>
      </header>
      <Suspense  fallback={<RunnerLoading />} >
        <ProfileForm />
      </Suspense>
    </>
  );
}

async function ProfileForm() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  let initialProfile: RunnerProfile | null = null;
  try {
    const { data, error } = await supabase
      .from("runner_profiles")
      .select()
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return <LoadError />;
    if (data) initialProfile = profileFromRow(data);
  } catch {
    return <LoadError />;
  }
  return <OnboardingForm key={user.id} initialProfile={initialProfile} />;
}

function LoadError() {
  return (
    <section className="card approach-card" role="alert">
      <h2>Your profile couldn’t load.</h2>
      <p>Please reload before editing your answers.</p>
      <a href="/onboarding" className="button-link">
        Try again
      </a>
    </section>
  );
}
