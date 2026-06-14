/**
 * SiteHeader — the single global header, rendered once by the persistent (site)
 * shell above all zones.
 *
 * Left: wordmark (admin → clay-tinted, links to /admin; everyone else → near-black,
 * links home). Center: marketing tab row (desktop). Right: account cluster
 * (desktop) / hamburger (mobile).
 *
 * The header reads NO cookies: it's a SYNC server component that renders the
 * static chrome (tab row, grid scaffold) plus the `HeaderAuthClient` island. That
 * island resolves auth + role in the browser, so the whole shell is static and
 * paints instantly, and public pages can prerender. Only the top-right control
 * (and the wordmark tint) fill in just after hydration, into reserved space.
 */
import { HeaderAuthClient } from "./header-auth-client";
import { SiteNavTabs } from "./site-nav";
import type { NavItem } from "@/components/layout/nav-config";

const navLinks: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/gallery", label: "Gallery" },
  { href: "/reviews", label: "Reviews" },
  { href: "/resources", label: "Resources" },
  { href: "/contact", label: "Contact" },
  { href: "/services", label: "Services", activeSections: ["/book"] },
];

/**
 * Sync server component: renders the static chrome immediately. The auth-dependent
 * cells (wordmark tint, auth cluster, mobile drawer) are owned by the client
 * island so the shell never blocks on cookies.
 */
export function SiteHeader() {
  return (
    <header className="bg-card border-border border-b">
      {/* No overflow-hidden here: the AccountMenu hover dropdown hangs below the
          header and must stay visible; single-row layout is guaranteed by the
          min-w-0 grid cells, not by clipping. */}
      {/* relative: positioning anchor for the AccountMenu dropdown, which hangs
          from the navbar's bottom edge. This container's box spans the full
          header height (the grid's py-6 lives inside it), so the panel's
          top-full tracks the navbar bottom regardless of header height. */}
      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Three explicit columns: wordmark (col 1) · tabs (col 2) · auth (col 3).
            The client island's fragment children are direct grid items. Every cell
            is pinned with explicit col-start-* + row-start-1 — relying on
            auto-placement breaks here because the grid cursor is forward-only: once
            the auth cluster claims col 3, a later DOM sibling targeting col 2 wraps
            to row 2. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-6">
          <HeaderAuthClient navLinks={navLinks} />

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
