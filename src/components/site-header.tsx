/**
 * SiteHeader — the single global header, rendered inside PageShell on every zone.
 *
 * Left: wordmark (admin → clay-tinted, underline-hover, links to /admin; everyone
 * else → near-black, links home). Center: marketing tab row (desktop). Right:
 * account cluster (desktop) / hamburger (mobile). The separate "Admin" link is
 * gone — the wordmark is the admin affordance.
 *
 * Split for streaming: the outer `SiteHeader` is a SYNC server component that
 * renders the static chrome (tab row, grid scaffold). `HeaderAuth` is the async
 * child that does the auth + role queries; it owns the wordmark (whose admin tint
 * depends on role), the desktop auth cluster, and the mobile drawer. It's wrapped
 * in a `<Suspense>` so the header chrome paints immediately and `loading.tsx`
 * fallbacks are never blocked by runtime auth data.
 *
 * `zoneNav` (account/admin) is forwarded to the mobile drawer so it can list the
 * zone's sections. `navBadges` (admin only) is forwarded for attention counts.
 * `navBadgesPromise` is the deferred variant used by the admin layout — HeaderAuth
 * awaits whichever is provided.
 */
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "./account-menu";
import { SiteNavTabs, SiteNavMobile } from "./site-nav";
import { SignInLink } from "@/components/layout/sign-in-link";
import { Wordmark } from "@/components/layout/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  NavItem,
  ZoneNav,
  NavBadges,
} from "@/components/layout/nav-config";

const navLinks: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services", activeSections: ["/book"] },
  { href: "/gallery", label: "Gallery" },
  { href: "/reviews", label: "Reviews" },
  { href: "/resources", label: "Resources" },
  { href: "/contact", label: "Contact" },
];

/**
 * Async server component: auth + role queries + rendering of all auth-dependent
 * header elements (wordmark tint, desktop auth cluster, mobile drawer). Wrapped in
 * Suspense by its parent so it never blocks the static chrome above.
 */
async function HeaderAuth({
  zoneNav,
  navBadgesPromise,
}: {
  zoneNav?: ZoneNav;
  navBadgesPromise?: Promise<NavBadges>;
}) {
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

  // Resolve deferred badges (admin layout passes a promise to avoid blocking the
  // layout's own render; other zones pass nothing).
  const navBadges = navBadgesPromise ? await navBadgesPromise : undefined;

  const authCluster = (
    <div className="flex items-center gap-5 text-sm">
      {user ? <AccountMenu /> : <SignInLink />}
    </div>
  );

  return (
    <>
      {/* col 1: wordmark — tint depends on role, so lives in the async child.
          Wrapped so the grid cell is explicit (Wordmark's root is a Link that
          doesn't take placement classes). min-w-0 lets the 1fr column shrink
          below its content's min-content width, preventing two-row wrap. */}
      <div className="col-start-1 row-start-1 min-w-0 justify-self-start">
        <Wordmark isAdmin={isAdmin} />
      </div>

      {/* col 3: desktop auth cluster + mobile drawer */}
      <div className="col-start-3 row-start-1 flex items-center justify-end">
        <div className="hidden lg:block">{authCluster}</div>
        <div className="lg:hidden">
          <SiteNavMobile
            links={navLinks}
            zoneNav={zoneNav}
            navBadges={navBadges}
            isSignedIn={!!user}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Fallback fragment occupying the same two grid positions (col 1 + col 3) as
 * HeaderAuth, so the grid doesn't shift when the async child resolves.
 * The tab row in col 2 is already rendered by the static shell.
 */
function HeaderAuthSkeleton() {
  return (
    <>
      {/* col 1 — wordmark placeholder: ~same width/height as "Cal Barba" + ears mark */}
      <div
        className="col-start-1 row-start-1 flex min-w-0 items-center gap-5"
        aria-hidden="true"
      >
        {/* ears mark placeholder */}
        <Skeleton className="h-12 w-10 shrink-0" />
        {/* wordmark text placeholder */}
        <Skeleton className="h-5 w-24" />
      </div>
      {/* col 3 — auth cluster / burger placeholder */}
      <div
        className="col-start-3 row-start-1 flex items-center justify-end"
        aria-hidden="true"
      >
        {/* desktop: "Sign in" / "Account" width */}
        <Skeleton className="hidden h-5 w-16 lg:block" />
        {/* mobile: burger size */}
        <Skeleton className="size-11 lg:hidden" />
      </div>
    </>
  );
}

/**
 * Sync outer shell: renders the static chrome (tab row) immediately; wraps the
 * auth-dependent fragment in Suspense so it never blocks `loading.tsx` fallbacks.
 */
export function SiteHeader({
  zoneNav,
  navBadgesPromise,
}: {
  zoneNav?: ZoneNav;
  navBadgesPromise?: Promise<NavBadges>;
}) {
  return (
    <header className="bg-card border-border border-b">
      {/* No overflow-hidden here: the AccountMenu hover dropdown hangs below the
          header and must stay visible; single-row layout is guaranteed by the
          min-w-0 grid cells, not by clipping. */}
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Three explicit columns: wordmark (col 1) · tabs (col 2) · auth (col 3).
            Suspense is not a DOM node; its fragment children are direct grid items.
            Every cell is pinned with explicit col-start-* + row-start-1 — relying on
            auto-placement breaks here because the grid cursor is forward-only: once
            the auth cluster claims col 3, a later DOM sibling targeting col 2 wraps
            to row 2. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-6">
          <Suspense fallback={<HeaderAuthSkeleton />}>
            <HeaderAuth zoneNav={zoneNav} navBadgesPromise={navBadgesPromise} />
          </Suspense>

          {/* Tab row + auth cluster need ~762px; at md (768) only ~689px is
              available inside the container padding, so the desktop layout
              starts at lg — the burger covers 768–1023. */}
          <div className="col-start-2 row-start-1 hidden justify-self-center lg:block">
            <SiteNavTabs links={navLinks} />
          </div>
        </div>
      </div>
    </header>
  );
}
