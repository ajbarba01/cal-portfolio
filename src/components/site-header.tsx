/**
 * SiteHeader — the single global header, rendered once by the persistent (site)
 * shell above all zones.
 *
 * Left: wordmark (admin → clay-tinted, underline-hover, links to /admin; everyone
 * else → near-black, links home). Center: marketing tab row (desktop). Right:
 * account cluster (desktop) / hamburger (mobile). The separate "Admin" link is
 * gone — the wordmark is the admin affordance.
 *
 * Split for streaming: the outer `SiteHeader` is a SYNC server component that
 * renders the static chrome (tab row, grid scaffold). `HeaderAuth` is the async
 * child that self-sources auth + role; it owns the wordmark (whose admin tint
 * depends on role), the desktop auth cluster, and the mobile drawer. It's wrapped
 * in a `<Suspense>` so the header chrome paints immediately and `loading.tsx`
 * fallbacks are never blocked by runtime auth data.
 *
 * Because the header is persistent (rendered once at the shell level, not per
 * navigation), admin attention badges are fetched here via `getNavBadges()`.
 * `getAttentionCounts` is React-cache'd, so this dedupes with the admin sidebar's
 * identical fetch on the initial render. Freshness after mutations rides on the
 * existing `router.refresh()` calls in booking/inquiry mutations. The mobile
 * drawer derives its zone sections from the current pathname (Task 3).
 */
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAttentionCounts } from "@/features/admin";
import { AccountMenu } from "./account-menu";
import { SiteNavTabs, SiteNavMobile } from "./site-nav";
import { SignInLink } from "@/components/layout/sign-in-link";
import { Wordmark } from "@/components/layout/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import type { NavItem, NavBadges } from "@/components/layout/nav-config";

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
 * Shape the cached attention counts into the NavBadges map consumed by the
 * mobile drawer. Keys and fields mirror the admin layout's badge construction
 * exactly so the two UI-layer files stay in sync.
 */
async function getNavBadges(): Promise<NavBadges> {
  const attention = await getAttentionCounts();
  return {
    "/admin/bookings": {
      count: attention.pendingApprovals,
      label: "awaiting approval",
    },
    "/admin/inquiries": { count: attention.newInquiries, label: "new" },
  };
}

/**
 * Async server component: self-sources auth + role + admin badges, then renders
 * all auth-dependent header elements (wordmark tint, desktop auth cluster, mobile
 * drawer). Wrapped in Suspense by its parent so it never blocks the static chrome.
 */
async function HeaderAuth() {
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

  // Admin attention badges for the mobile drawer. The header is persistent, so
  // this resolves once on load (not per navigation). getAttentionCounts is
  // React-cache'd, so it dedupes with the admin sidebar's identical fetch on the
  // initial render. Freshness after mutations rides on existing router.refresh().
  const navBadges = isAdmin ? await getNavBadges() : undefined;

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
 *
 * col 1 renders the real wordmark rather than a skeleton: the text is identical
 * for every visitor, so it's already the final render. `isAdmin` is omitted (not
 * yet known here) so the wordmark falls back to its optimistic admin hint —
 * admins keep their clay tint across a zone switch instead of flashing to black
 * until the role query resolves. Same element either way: no layout shift.
 */
function HeaderAuthSkeleton() {
  return (
    <>
      {/* col 1 — real wordmark; admin state comes from the optimistic hint */}
      <div className="col-start-1 row-start-1 min-w-0 justify-self-start">
        <Wordmark />
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
export function SiteHeader() {
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
            <HeaderAuth />
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
