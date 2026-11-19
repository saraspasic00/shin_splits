"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/plan", label: "Weekly plan", icon: "calendar" },
  { href: "/profile", label: "Profile", icon: "profile" },
] as const;

function NavIcon({ name }: { name: (typeof links)[number]["icon"] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "home" && (
        <>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 9v11h5v-6h4v6h5V9" />
        </>
      )}

      {name === "calendar" && (
        <>
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M4 11h16" />
          <path d="M8 15h2M14 15h2" />
        </>
      )}

      {name === "profile" && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </>
      )}
    </svg>
  );
}

export default function Navigation() {
  const pathname = usePathname();

  return <NavigationLinks pathname={pathname} />;
}

export function NavigationFallback() {
  return <NavigationLinks pathname={null} />;
}

function NavigationLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="primary-navigation" aria-label="Main navigation">
      {links.map(({ href, label, icon }) => {
        const active =
          pathname !== null &&
          (href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`));

        return (
          <Link
            key={href}
            href={href}
            className={`nav-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            <span className="nav-icon">
              <NavIcon name={icon} />
            </span>

            <span className="nav-label">{label}</span>

            <span className="nav-tooltip" aria-hidden="true">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
