"use client";

import { useEffect, useState, type ReactNode } from "react";

export default function ScrollHeader({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 701px)");
    let frame = 0;

    function update() {
      cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        setCompact((previous) => {
          if (!desktop.matches) return false;

          // Different thresholds prevent flickering near the boundary.
          return previous ? window.scrollY > 6 : window.scrollY > 24;
        });
      });
    }

    update();

    window.addEventListener("scroll", update, { passive: true });
    desktop.addEventListener("change", update);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  return (
    <aside className="sidebar" data-compact={compact}>
      <div className="sidebar-content">{children}</div>
    </aside>
  );
}
