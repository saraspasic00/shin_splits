import type { ReactNode } from "react";
import styles from "./login-layout.module.css";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.stage}>
      <div className={styles.spread}>
        <div className={styles.landscape} aria-hidden="true" />
        <div className={styles.panel}>{children}</div>
      </div>
    </div>
  );
}
