"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/plan", label: "Plan" },
  { href: "/today", label: "Today" },
  { href: "/learn", label: "Learn" },
  { href: "/map", label: "Mind map" },
  { href: "/difficulties", label: "Difficulties" },
  { href: "/calendar", label: "Calendar" },
  { href: "/progress", label: "Progress" },
  { href: "/report", label: "Reports" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * One nav, two layouts: a sidebar on desktop and a scrollable bar on mobile.
 * `aria-current="page"` marks the active item for screen readers — the colour
 * change alone would not.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="lg:h-full">
      <div className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:h-full lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
        <p className="hidden px-3 pb-4 text-sm font-semibold tracking-tight lg:block">
          Orbit
        </p>
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-ink-soft hover:bg-accent-soft hover:text-accent"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
