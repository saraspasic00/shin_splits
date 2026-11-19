import styles from "./runner-loading.module.css";

export default function RunnerLoading() {
  return (
    <div className={styles.container} role="status">
      <span className={styles.srOnly}>Loading your page…</span>

      <div className={styles.scene} aria-hidden="true">
        <svg
          className={styles.runner}
          viewBox="0 0 100 100"
          fill="none"
          focusable="false"
        >
          <circle cx="62" cy="18" r="8" fill="currentColor" />

          <g
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M55 33 46 53" strokeWidth="13" />
            <path d="m53 35 15 12 13-5" strokeWidth="8" />
            <path d="m51 35-15 2-10 13" strokeWidth="8" />
            <path d="m46 53 16 13-8 20" strokeWidth="10" />
            <path d="m46 53-13 17-20 2" strokeWidth="10" />
          </g>
        </svg>

        <span className={styles.track} />
      </div>
    </div>
  );
}