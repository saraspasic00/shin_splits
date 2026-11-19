"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export default function HomeArrival({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem("shin-splits:welcome") !== "1") return;
      sessionStorage.removeItem("shin-splits:welcome");
    } catch {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    ref.current?.animate(
      [
        { opacity: 0, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 320, easing: "ease-out" },
    );
  }, []);

  return <div ref={ref}>{children}</div>;
}