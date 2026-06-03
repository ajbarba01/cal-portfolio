/**
 * SiteHeader — the standard, session-aware header shared across route groups
 * (marketing + admin). Renders the brand, main nav, and a right-side control
 * cluster: an Admin link (only when the caller has role='admin'), plus either
 * the AccountMenu (signed in) or a Sign in link.
 *
 * Server component: it re-derives identity and role from the verified session
 * on every render, so the Admin link is never shown to non-admins. The admin
 * route group still enforces its own redirect guard — this link is convenience,
 * not authorization.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "./account-menu";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/gallery", label: "Gallery" },
  { href: "/reviews", label: "Reviews" },
  { href: "/resources", label: "Resources" },
  { href: "/book", label: "Book" },
];

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  return (
    <header className="border-border bg-background border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-foreground text-lg font-semibold tracking-tight hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cal Barba
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {navLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-4 text-sm">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Admin
            </Link>
          )}
          {user ? (
            <AccountMenu />
          ) : (
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
