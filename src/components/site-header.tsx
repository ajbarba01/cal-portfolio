/**
 * SiteHeader — single-row marketing header.
 *
 * One row: left wordmark · centered active-state tab row (desktop) · auth cluster
 * right (desktop) / hamburger right (mobile). Tabs collapse into the drawer on mobile.
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
        {/* Single row: wordmark left · centered tabs (desktop) · auth/hamburger right.
            The 1fr_auto_1fr grid keeps the tab row optically centered regardless of
            the wordmark/auth widths. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-4">
          <Link
            href="/"
            className="font-heading justify-self-start text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Cal Barba
          </Link>

          {/* Center: tab row (SiteNavTabs is itself hidden below md) */}
          <div className="justify-self-center">
            <SiteNavTabs links={navLinks} />
          </div>

          {/* Right: auth (desktop) / hamburger (mobile) */}
          <div className="justify-self-end">
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
      </div>
    </header>
  );
}
