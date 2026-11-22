import SignInForm from "@/components/sign-in-form";
import styles from "./login-layout.module.css";
import Link from "next/link";
export default function LoginPage() {
  return (
    <>
      <header className="page-header">
        <h1 className={styles.journalLabel}>Your running journal</h1>
        {/* <p className="muted">Sign in to your account.</p> */}
      </header>

      <section className="card auth-card" aria-label="Sign in">
        <SignInForm />
        <p>
          New to Shin Splits?{" "}
          <Link href="/login/register">Create an account</Link>
        </p>
      </section>
    </>
  );
}
