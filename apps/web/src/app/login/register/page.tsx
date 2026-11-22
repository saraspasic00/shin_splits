"use client";

import Link from "next/link";
import { useRef, useState, type SubmitEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function register(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const values = new FormData(event.currentTarget);
    const displayName = String(values.get("name") ?? "").trim();
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const { data, error } = await createClient().auth.signUp({
        email: String(values.get("email") ?? "").trim(),
        password: String(values.get("password") ?? ""),
        options: {
          data: displayName ? { display_name: displayName } : {},
          emailRedirectTo: new URL("/login/confirm", window.location.origin).href,
        },
      });
      if (error) {
        setError(error.message);
      } else if (data.session) {
        window.location.replace("/onboarding");
      } else {
        setSent(true);
      }
    } catch {
      setError("Couldn’t reach Shin Splits. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="register-title">
      <h1 id="register-title">{sent ? "Check your email" : "Create your account"}</h1>
      {sent ? (
        <p role="status">For a new account, open the confirmation link in this browser to set up your running profile. Already registered? You can sign in below.</p>
      ) : (
        <form className="auth-form" onSubmit={register} aria-busy={pending}>
          <label htmlFor="name">What should we call you? (optional)</label>
          <input id="name" name="name" autoComplete="given-name" maxLength={60} />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required />
          {error && <p role="alert">{error}</p>}
          <button disabled={pending} type="submit">{pending ? "Creating account…" : "Create account"}</button>
        </form>
      )}
      <p><Link href="/login">Back to sign in</Link></p>
    </section>
  );
}
