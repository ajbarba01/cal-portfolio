/**
 * SiteHeader — the single global header, rendered inside PageShell on every zone.
 *
 * Left: wordmark (admin → clay-tinted, underline-hover, links to /admin; everyone
 * else → near-black, links home). Center: marketing tab row (desktop). Right:
 * account cluster (desktop) / hamburger (mobile). The separate "Admin" link is
 * gone — the wordmark is the admin affordance.
 *
 * Server component: re-derives identity + role each render. `zoneNav` (account/
 * admin) is forwarded to the mobile drawer so it can list the zone's sections.
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "./account-menu";
import { SiteNavTabs, SiteNavMobile } from "./site-nav";
import { navUnderline } from "@/components/layout/nav-underline";
import { Wordmark } from "@/components/layout/wordmark";
import type { NavItem, ZoneNav } from "@/components/layout/nav-config";

const navLinks: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/gallery", label: "Gallery" },
  { href: "/reviews", label: "Reviews" },
  { href: "/resources", label: "Resources" },
  { href: "/book", label: "Book" },
];

export async function SiteHeader({ zoneNav }: { zoneNav?: ZoneNav }) {
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
    <div className="flex items-center gap-5 text-sm">
      {user ? (
        <AccountMenu />
      ) : (
        <Link href="/login" className={navUnderline(false)}>
          Sign in
        </Link>
      )}
    </div>
  );

  return (
    <header className="border-border border-b">
      <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-4">
          <Wordmark isAdmin={isAdmin} />

          <div className="hidden justify-self-center md:block">
            <SiteNavTabs links={navLinks} />
          </div>

          <div className="justify-self-end">
            <div className="hidden md:block">{authCluster}</div>
            <div className="flex justify-end md:hidden">
              <SiteNavMobile
                links={navLinks}
                zoneNav={zoneNav}
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
