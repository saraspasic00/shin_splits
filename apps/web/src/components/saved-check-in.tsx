import { connection } from "next/server";
import { redirect } from "next/navigation";

import CheckIn from "@/components/check-in";
import { createClient } from "@/lib/supabase/server";
import { checkInRequestSchema } from "@/lib/schemas/check-in";
import type { CalendarDate } from "@/types/training";
import type { SavedCheckIn } from "@/lib/schemas/saved-check-in";

export default async function SavedCheckIn({
  date,
}: {
  date: CalendarDate;
}) {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  let initialCheckIn: SavedCheckIn | null = null;

  try {
    const { data, error } = await supabase
      .from("check_ins")
      .select("date, energy, sleep")
      .eq("user_id", user.id)
      .eq("date", date)
      .maybeSingle();

    if (error) {
      return <CheckInLoadError />;
    }

    if (data) {
      const parsed = checkInRequestSchema.safeParse(data);

      if (!parsed.success || parsed.data.date !== date) {
        return <CheckInLoadError />;
      }

      initialCheckIn = parsed.data;
    }
  } catch {
    return <CheckInLoadError />;
  }

  const formKey = [
    user.id,
    date,
    initialCheckIn?.energy ?? "",
    initialCheckIn?.sleep ?? "",
  ].join(":");

  return (
    <CheckIn
      key={formKey}
      date={date}
      initialCheckIn={initialCheckIn}
    />
  );
}

function CheckInLoadError() {
  return (
    <section className="card check-in-card" role="alert">
      <h2>How are you feeling?</h2>
      <p>Your saved check-in couldn’t load. Please reload before editing.</p>
      <a href="/" className="button-link">
        Try again
      </a>
    </section>
  );
}