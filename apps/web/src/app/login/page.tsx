
import SignInForm from "@/components/sign-in-form";
import styles from "./login-layout.module.css";
export default function LoginPage() {
  return (
    <>
      <header className="page-header">
      <h1 className={styles.journalLabel}>Your running journal</h1>
        {/* <p className="muted">Sign in to your account.</p> */}
      </header>

      <section className="card auth-card" aria-label="Sign in">
        <SignInForm />
      </section>
    </>
  );
}