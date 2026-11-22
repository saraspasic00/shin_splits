import Link from "next/link";

export default function ConfirmationHelpPage() {
  return (
    <section>
      <h1>Finish signing in</h1>
      <p>If your email was confirmed, sign in with your email and password. If the link expired before confirmation, request a fresh link by starting registration again.</p>
      <Link className="button-link" href="/login">Sign in</Link>
    </section>
  );
}
