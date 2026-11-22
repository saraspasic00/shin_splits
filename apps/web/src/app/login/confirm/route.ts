import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session) {
        return NextResponse.redirect(new URL("/onboarding", url.origin));
      }
    } catch {
      // A verified runner can still sign in with their password.
    }
  }
  return NextResponse.redirect(new URL("/login/confirmation-help", url.origin));
}
