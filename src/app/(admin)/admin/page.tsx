/**
 * Admin index — links to each admin section.
 * Server component; layout.tsx already guards the route group.
 */

import Link from "next/link";

const SECTIONS = [
  { href: "/admin/availability", label: "Availability Windows" },
  { href: "/admin/bookings", label: "Booking Approvals" },
  { href: "/admin/services", label: "Services Editor" },
  { href: "/admin/settings", label: "Settings Editor" },
  { href: "/admin/reviews", label: "Reviews Moderation" },
] as const;

export default function AdminIndexPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Admin Dashboard</h1>
      <nav>
        <ul className="space-y-3">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="hover:bg-muted block rounded-md border px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
