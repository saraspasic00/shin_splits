import SignInForm from "@/components/sign-in-form";

export default function LoginPage() {
  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Your running journal</p>
        <h1>Welcome back.</h1>
        <p className="muted">Sign in to your account.</p>
      </header>

      <section className="card auth-card" aria-label="Sign in">
        <SignInForm />
      </section>
    </>
  );
}