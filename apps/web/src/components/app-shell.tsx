import Link from "next/link";
import  { Suspense, type ReactNode } from "react";

import Navigation, { NavigationFallback } from "@/components/navigation";
import ScrollHeader from "@/components/scroll-header";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <ScrollHeader>
        <Link className="wordmark" href="/" aria-label="Shin Splits home">
          shin splits
        </Link>

        <Suspense fallback={<NavigationFallback />}>
          <Navigation />
        </Suspense>

        <p className="sidebar-note">
          Your running.
          <br />
          Your rhythm.
        </p>
      </ScrollHeader>

      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
