/**
 * SiteHeader — two-tier centered marketing header.
 *
 * Top tier: centered wordmark; auth cluster right (desktop); hamburger right (mobile).
 * Bottom tier (desktop only): centered active-state tab row.
 *
 * Server component: re-derives identity and role on every render. The Admin link
 * is convenience, not authorization — the admin route group enforces its own guard.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "./account-menu";
import { SiteNavTabs, SiteNavMobile } from "./site-nav";
import type { NavItem } from "@/components/layout/nav-config";

const navLinks: NavItem[] = [
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

  const authCluster = (
    <div className="flex items-center gap-4 text-sm">
      {isAdmin && (
        <Link
          href="/admin"
          className="text-muted-foreground hover:text-foreground font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Admin
        </Link>
      )}
      {user ? (
        <AccountMenu />
      ) : (
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Sign in
        </Link>
      )}
    </div>
  );

  return (
    <header className="border-border bg-card border-b">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        {/* Top tier: wordmark center (desktop) / left (mobile); auth right (desktop); hamburger right (mobile) */}
        <div className="grid grid-cols-3 items-center py-4">
          {/* Left column — spacer on desktop, empty on mobile */}
          <div className="hidden md:block" />

          {/* Center column — wordmark */}
          <Link
            href="/"
            className="font-heading col-start-1 justify-self-start text-xl font-semibold tracking-tight md:col-start-2 md:justify-self-center"
          >
            Cal Barba
          </Link>

          {/* Right column — auth (desktop) | hamburger (mobile) */}
          <div className="col-start-3 justify-self-end">
            <div className="hidden md:block">{authCluster}</div>
            <div className="md:hidden">
              <SiteNavMobile
                links={navLinks}
                isSignedIn={!!user}
                isAdmin={isAdmin}
              />
            </div>
          </div>
        </div>

        {/* Bottom tier: centered tab row (desktop only) */}
        <div className="hidden pb-3 md:block">
          <SiteNavTabs links={navLinks} />
        </div>
      </div>
    </header>
  );
}
