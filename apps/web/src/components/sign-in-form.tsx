"use client";

import { useState, type SubmitEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import RunnerLoading from "@/components/runner-loading";
export default function SignInForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcoming, setWelcoming] = useState(false);
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("displayName") ?? "").trim();
    if (displayName.length > 60) {
      setError("Please use a name of 60 characters or fewer.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const supabase = createClient();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(
          "Sign-in failed. Check your email and password and make sure your account is confirmed.",
        );
        return;
      }

      // Start a fresh server request with the new session cookies.
      if (displayName) {
        try {
          const { error: nameError } = await supabase.auth.updateUser({
            data: { display_name: displayName },
          });

          if (nameError) {
            setError(
              "You’re signed in, but your name couldn’t be saved. Try again, or continue to Home.",
            );
            return;
          }
        } catch {
          setError(
            "You’re signed in, but we couldn’t confirm your name was saved. Try again, or continue to Home.",
          );
          return;
        }
      }

      // Start a fresh server request with the updated account details.
      window.location.assign("/");
    } catch {
      setError("We couldn’t connect to sign-in. Please try again.");
    } finally {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setWelcoming(true);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1600));

        try {
          sessionStorage.setItem("shin-splits:welcome", "1");
        } catch {
          // Home still opens if browser storage is unavailable.
        }
      }

      window.location.replace("/");
    }
  }
if (welcoming) {
  return (
    <div className="login-welcome" role="status" aria-label="Opening your home page">
      <div className="login-welcome-runner" aria-hidden="true">
        <RunnerLoading />
      </div>
    </div>
  );
}
  return (
    <form className="auth-form" onSubmit={handleSubmit} aria-busy={pending}>
      <label htmlFor="displayName">What should we call you?</label>
      <input
        id="displayName"
        name="displayName"
        type="text"
        autoComplete="given-name"
        maxLength={60}
        aria-describedby="name-help"
        disabled={pending}
      />
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        disabled={pending}
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        disabled={pending}
      />

      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {error && <p role="alert">{error}</p>}

      {error?.startsWith("You’re signed in") && (
        <a href="/" className="button-link">
          Continue to Home
        </a>
      )}
    </form>
  );
}
