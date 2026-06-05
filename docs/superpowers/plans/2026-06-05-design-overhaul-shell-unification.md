# Shell Unification + Interaction Language — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the marketing header global on every zone, render every route as one centered "sheet on an accent desk", and ship a documented hover/active interaction language — plus fold in three Phase-1 cleanups and adopt the shell on the auth pages.

**Architecture:** A new server primitive `PageShell` owns the desk+sheet chrome and renders the global `SiteHeader` + zone body + `SiteFooter`. `AppShell` is reduced to a body-only sidebar+content (its slim bar + mobile drawer move into `SiteHeader`'s merged drawer). Interaction styling is centralized in a `navUnderline` helper (top-bar links) and a `--sidebar-active` token (sidebar rect); buttons deepen on hover. All color via two-layer semantic tokens.

**Tech Stack:** Next.js App Router (server + client components), TypeScript strict, Tailwind v4 (`@theme inline` in `globals.css`), `@base-ui/react`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-design-overhaul-shell-unification-design.md`

**Conventions for every task:** commit messages are **subject-line only**, Conventional Commits, no body/trailer/Co-Authored-By. Stage **by name** (never `git add -A`; quote paths with parentheses). Verify (`lint`/`typecheck`/`build`/`test` as noted) before each commit. **Do NOT push** — Alex batches the push. Caveman tone is for chat, not code/commits.

---

## File map

- **Create:** `src/components/layout/page-shell.tsx`, `src/components/layout/site-footer.tsx`, `src/components/layout/nav-underline.ts`, `src/components/layout/nav-underline.test.ts`, `src/app/(auth)/layout.tsx`
- **Modify:** `src/app/globals.css`, `src/lib/design-tokens.ts`, `src/components/site-header.tsx`, `src/components/site-nav.tsx`, `src/components/account-menu.tsx`, `src/components/layout/app-shell.tsx`, `src/components/layout/app-sidebar.tsx`, `src/app/(marketing)/layout.tsx`, `src/app/(account)/layout.tsx`, `src/app/(admin)/layout.tsx`, `src/components/ui/button.tsx`, `src/components/layout/page-header.tsx`, `src/components/ui/form-field.tsx`, `src/components/feedback/confirm-dialog.tsx`, `src/components/feedback/toast.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/(account)/onboarding/page.tsx`, `docs/FRONTEND.md`, `docs/DESIGN.md`

### Execution order (green at every commit)

Tasks 3, 5, 6 share the `zoneNav` prop, so execute in this order so each commit typechecks/builds cleanly. Do **not** follow raw task numbers:

**T1 → T2 → T6 → T5 → T3 → T4 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14**

Why: the `zoneNav` prop is **optional** everywhere, so T6 (SiteNavMobile accepts it) lands before T5 (SiteHeader passes it) before T3 (PageShell renders SiteHeader) — each compiles against the previous. T4 (reduce AppShell) lands immediately before T7 (layouts adopt PageShell) so account/admin are never left header-less for more than one commit. With this order, **every** task ends green — ignore the "may error mid-sequence" hedges below (they only apply if you run strictly by number).

---

## Task 1: Tokens — `--canvas`, `--sidebar-active`, `--clay-deep`, `.desk-grain`

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/lib/design-tokens.ts`

- [ ] **Step 1: Add the dark-active primitive.** In `globals.css`, inside `:root` after the `--clay-onfill` line (the clay block ~line 88), add:

```css
--clay-deep: #3a2a20; /* dark sidebar-active rect fill (warm, clay-tinted) */
```

- [ ] **Step 2: Add the two semantic roles in `:root`.** After the `--accent-foreground: var(--sand-900);` line, add:

```css
/* Accent "desk" behind the sheet (gutter color) + sidebar active-rect fill */
--canvas: var(--sand-100);
--sidebar-active: var(--clay-soft);
```

- [ ] **Step 3: Mirror both in `.dark`.** In the `.dark` block, after `--accent-foreground: var(--sand-50);`, add:

```css
--canvas: var(--sand-950);
--sidebar-active: var(--clay-deep);
```

- [ ] **Step 4: Expose them to Tailwind.** In the `@theme inline` block, after `--color-accent: var(--accent);`, add:

```css
--color-canvas: var(--canvas);
--color-sidebar-active: var(--sidebar-active);
```

- [ ] **Step 5: Add the grain utility.** In `globals.css`, inside the existing `@layer utilities { ... }` block (after the `.measure` rule), add:

```css
/* Faint static paper grain for the accent desk — invisible-but-felt depth.
     Applied to an absolutely-positioned aria-hidden overlay inside the desk. */
.desk-grain {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.035;
}
```

- [ ] **Step 6: Register the role names.** In `src/lib/design-tokens.ts`, in the `SEMANTIC_COLORS` array, add `"canvas",` after `"accent",` and add `"sidebar-active",` after `"brand-strong",`.

- [ ] **Step 7: Verify build + lint.**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: all pass; 28 pages build (no visual change yet — tokens are defined but unused).

- [ ] **Step 8: Commit.**

```bash
git add src/app/globals.css src/lib/design-tokens.ts
git commit -m "feat(tokens): add --canvas desk, --sidebar-active, desk-grain utility"
```

---

## Task 2: `navUnderline` helper (top-bar link interaction) — TDD

The one pure unit in this phase: a function returning the underline-grow class string for top-bar links (tabs, account, admin wordmark). Centralizing it kills the copy-pasted class string and makes the interaction language one source.

**Files:**

- Create: `src/components/layout/nav-underline.ts`
- Test: `src/components/layout/nav-underline.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vitest";
import { navUnderline, NAV_UNDERLINE_BASE } from "./nav-underline";

describe("navUnderline", () => {
  it("always includes the animated underline base", () => {
    expect(navUnderline(false)).toContain("after:scale-x-0");
    expect(navUnderline(false)).toContain("after:transition-transform");
  });

  it("active link is brand-strong, semibold, underline shown", () => {
    const cls = navUnderline(true);
    expect(cls).toContain("text-brand-strong");
    expect(cls).toContain("font-semibold");
    expect(cls).toContain("after:scale-x-100");
  });

  it("inactive link is muted with hover-reveal underline (not shown by default)", () => {
    const cls = navUnderline(false);
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("hover:after:scale-x-100");
    expect(cls).not.toContain("font-semibold");
  });

  it("exposes the base for non-link callers (e.g. admin wordmark)", () => {
    expect(NAV_UNDERLINE_BASE).toContain("after:bg-brand-strong");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails.**

Run: `npm test -- nav-underline`
Expected: FAIL — `Cannot find module './nav-underline'`.

- [ ] **Step 3: Implement the helper.**

```ts
import { cn } from "@/lib/utils";

/**
 * Top-bar link interaction: an underline that grows from center on hover and
 * persists when active. The single source for the marketing tabs, the account
 * link, and the admin wordmark — so the "nav-underline" language is defined once.
 */
export const NAV_UNDERLINE_BASE =
  "after:bg-brand-strong relative py-1 transition-colors after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:origin-center after:scale-x-0 after:rounded after:transition-transform after:duration-200 after:ease-out focus-visible:outline-2 focus-visible:outline-offset-2";

export function navUnderline(active: boolean): string {
  return cn(
    NAV_UNDERLINE_BASE,
    active
      ? "text-brand-strong font-semibold after:scale-x-100"
      : "text-muted-foreground hover:text-foreground hover:after:scale-x-100",
  );
}
```

- [ ] **Step 4: Run the test, verify it passes.**

Run: `npm test -- nav-underline`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/components/layout/nav-underline.ts src/components/layout/nav-underline.test.ts
git commit -m "feat(nav): add navUnderline helper for top-bar link interaction"
```

---

## Task 3: `PageShell` + `SiteFooter` (desk + sheet primitive)

`PageShell` is the desk+sheet wrapper that renders the global header, the zone body (its `children`), and the footer. `SiteFooter` is the marketing footer extracted so every zone shares one sheet bottom.

**Files:**

- Create: `src/components/layout/site-footer.tsx`
- Create: `src/components/layout/page-shell.tsx`

- [ ] **Step 1: Create `SiteFooter`** (extracted from `(marketing)/layout.tsx`, unchanged markup):

```tsx
import Link from "next/link";

/** Shared sheet footer. Rendered by PageShell on every zone. */
export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            ©&nbsp;{new Date().getFullYear()}&nbsp;Cal Barba — [[Pet care
            tagline]] · Colorado
          </p>
          <nav aria-label="Footer navigation">
            <ul className="flex gap-4 text-sm">
              <li>
                <Link
                  href="/about"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/services"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Services
                </Link>
              </li>
              <li>
                <Link
                  href="/book"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Book
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Create `PageShell`.** Server component; renders the async `SiteHeader` as a child. `zoneNav` is forwarded to the header for the merged mobile drawer.

```tsx
import * as React from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "./site-footer";
import type { ZoneNav } from "./nav-config";

/**
 * The "sheet on a desk" shell composed by every zone layout. The desk (bg-canvas
 * + faint grain) fills the viewport; one centered sheet (bg-card, hairline side
 * borders, full height) holds the global header, the zone body, and the footer.
 * At phone width the sheet goes full-bleed (no max-width, no side borders) so the
 * gutters collapse. `zoneNav` (account/admin only) feeds the header's merged
 * mobile drawer with the zone's section links.
 */
export function PageShell({
  zoneNav,
  children,
}: {
  zoneNav?: ZoneNav;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-canvas relative flex min-h-dvh flex-col">
      <div
        aria-hidden
        className="desk-grain pointer-events-none absolute inset-0"
      />
      <div className="bg-card border-border relative mx-auto flex min-h-dvh w-full max-w-5xl flex-1 flex-col sm:border-x">
        <SiteHeader zoneNav={zoneNav} />
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck** (the file references `SiteHeader`'s new `zoneNav` prop, added in Task 5 — expected to fail until then; if doing tasks in order, defer the standalone check).

Run: `npm run typecheck`
Expected: may error on `zoneNav` prop until Task 5 lands. That is acceptable mid-sequence; the consolidated build runs in Task 7.

- [ ] **Step 4: Commit.**

```bash
git add src/components/layout/site-footer.tsx src/components/layout/page-shell.tsx
git commit -m "feat(layout): add PageShell desk+sheet primitive and SiteFooter"
```

---

## Task 4: Reduce `AppShell` to body-only; `AppSidebar` rect + drop back-to-site

`AppShell` loses its slim top bar and its own mobile drawer (the global header + merged drawer own those). `AppSidebar` loses "Back to site" (now the global wordmark/tabs) and adopts the `--sidebar-active` rect.

**Files:**

- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Replace `app-shell.tsx` entirely** with the body-only version (no `"use client"`, no Drawer, no slim header):

```tsx
import * as React from "react";
import { AppSidebar } from "./app-sidebar";
import type { ZoneNav } from "./nav-config";

/**
 * Account/admin body: persistent desktop sidebar + content. Rendered inside
 * PageShell, below the global SiteHeader. The mobile section nav lives in the
 * header's merged drawer (SiteNavMobile), not here.
 */
export function AppShell({
  nav,
  identity,
  children,
}: {
  nav: ZoneNav;
  identity: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <aside className="border-border bg-sidebar hidden w-60 shrink-0 border-r md:block">
        <div className="sticky top-0 h-dvh overflow-y-auto py-3">
          <AppSidebar nav={nav} identity={identity} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
```

(Note: `px-5 sm:px-8` added so account/admin content gets the standard `space.pageX` gutter now that there is no separate `PageContainer` wrapper in the layout. Pages that already use `PageContainer` will nest fine — `PageContainer` re-centers within.)

- [ ] **Step 2: Update `app-sidebar.tsx`** — remove the "Back to site" link and its `ChevronLeft` import; change the active class. Replace the import line:

```tsx
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActiveNav } from "./is-active-nav";
import type { ZoneNav } from "./nav-config";
import { SignOutButton } from "@/components/sign-out-button";
```

- [ ] **Step 3: Remove the back-to-site block.** Delete the entire `<Link href="/" ...>` "Back to site" element (the first child of the outer `<div>`), so the sidebar now opens directly with the zone label `<p>`.

- [ ] **Step 4: Swap the active rect.** In the nav item `cn(...)`, change the active branch from `bg-accent text-brand-strong font-semibold` to:

```tsx
                active
                  ? "bg-sidebar-active text-brand-strong font-semibold"
                  : "text-foreground hover:bg-muted",
```

- [ ] **Step 5: Verify lint + typecheck.**

Run: `npm run lint && npm run typecheck`
Expected: pass (AppShell no longer imports Drawer/Menu/X; confirm no unused-import errors).

- [ ] **Step 6: Commit.**

```bash
git add src/components/layout/app-shell.tsx src/components/layout/app-sidebar.tsx
git commit -m "refactor(layout): reduce AppShell to body-only; sidebar rect via --sidebar-active"
```

---

## Task 5: Global `SiteHeader` — wordmark-as-admin, drop Admin link, account underline, `zoneNav` prop

**Files:**

- Modify: `src/components/site-header.tsx`
- Modify: `src/components/account-menu.tsx`

- [ ] **Step 1: Replace `site-header.tsx`** with the global version:

```tsx
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
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "./account-menu";
import { SiteNavTabs, SiteNavMobile } from "./site-nav";
import {
  NAV_UNDERLINE_BASE,
  navUnderline,
} from "@/components/layout/nav-underline";
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
          <Link
            href={isAdmin ? "/admin" : "/"}
            className={cn(
              "font-heading justify-self-start text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2",
              isAdmin &&
                cn(
                  NAV_UNDERLINE_BASE,
                  "text-brand-strong hover:after:scale-x-100",
                ),
            )}
          >
            Cal Barba
          </Link>

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
```

(The header no longer paints `bg-card` — it inherits the sheet's `bg-card`. The `border-b` hairline stays.)

- [ ] **Step 2: Give the `AccountMenu` trigger the underline treatment.** In `account-menu.tsx`, replace the trigger `Link` className and add the import. Change the import block top to include the helper:

```tsx
import Link from "next/link";
import { navUnderline } from "@/components/layout/nav-underline";
import { SignOutButton } from "@/components/sign-out-button";
```

Then change the trigger `Link` (the `aria-haspopup="menu"` one) className to:

```tsx
        className={navUnderline(false)}
```

(Leave the dropdown panel + its inner links unchanged.)

- [ ] **Step 3: Verify lint + typecheck.**

Run: `npm run lint && npm run typecheck`
Expected: may still error on `SiteNavMobile`'s new `zoneNav` prop until Task 6. Acceptable mid-sequence.

- [ ] **Step 4: Commit.**

```bash
git add src/components/site-header.tsx src/components/account-menu.tsx
git commit -m "feat(nav): global header — wordmark-as-admin, drop Admin link, underline account"
```

---

## Task 6: Merged mobile drawer + tabs use the helper

`SiteNavTabs` adopts `navUnderline`. `SiteNavMobile` gains `zoneNav` and renders zone sections first (rect active state), then marketing links, then account/admin/sign-in/out.

**Files:**

- Modify: `src/components/site-nav.tsx`

- [ ] **Step 1: Update imports** at the top of `site-nav.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActiveNav } from "@/components/layout/is-active-nav";
import { navUnderline } from "@/components/layout/nav-underline";
import { SignOutButton } from "@/components/sign-out-button";
import type { NavItem, ZoneNav } from "@/components/layout/nav-config";
```

- [ ] **Step 2: Simplify `SiteNavTabs`** to use the helper:

```tsx
/** Desktop-only centered tab row. */
export function SiteNavTabs({ links }: { links: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation">
      <ul className="flex items-center justify-center gap-7 text-sm">
        {links.map(({ href, label }) => {
          const active = isActiveNav(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={navUnderline(active)}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 3: Thread `zoneNav` through the mobile wrapper.** Replace `SiteNavMobile` and `SiteNavMobileDrawer` signatures + the drawer body:

```tsx
/** Mobile-only hamburger + slide-in drawer (merged: zone sections + marketing + account). */
export function SiteNavMobile({
  links,
  zoneNav,
  isSignedIn,
  isAdmin,
}: {
  links: NavItem[];
  zoneNav?: ZoneNav;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  // Remount on navigation so the drawer always starts closed (repo eslint bans
  // set-state-in-effect; key={pathname} is the sanctioned auto-close pattern).
  return (
    <SiteNavMobileDrawer
      key={pathname}
      links={links}
      zoneNav={zoneNav}
      pathname={pathname}
      isSignedIn={isSignedIn}
      isAdmin={isAdmin}
    />
  );
}

function SiteNavMobileDrawer({
  links,
  zoneNav,
  pathname,
  isSignedIn,
  isAdmin,
}: {
  links: NavItem[];
  zoneNav?: ZoneNav;
  pathname: string;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
      <Drawer.Trigger
        aria-label="Open menu"
        className="text-foreground inline-flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Menu className="size-5" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-foreground/20 fixed inset-0 z-50" />
        <Drawer.Popup className="bg-background fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto">
          <div className="flex items-center justify-between p-4">
            <span className="font-heading text-lg font-semibold">Menu</span>
            <Drawer.Close
              aria-label="Close menu"
              className="inline-flex size-11 items-center justify-center"
            >
              <X className="size-5" />
            </Drawer.Close>
          </div>

          {/* Zone sections first (account/admin only) */}
          {zoneNav ? (
            <nav aria-label={`${zoneNav.zoneLabel} sections`}>
              <p className="text-muted-foreground px-4 pt-1 pb-1 text-xs font-medium tracking-wide uppercase">
                {zoneNav.zoneLabel}
              </p>
              <ul className="flex flex-col px-2 pb-2">
                {zoneNav.items.map(({ href, label }) => {
                  const active = isActiveNav(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center rounded-lg px-3 text-base",
                          active
                            ? "bg-sidebar-active text-brand-strong font-semibold"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="border-border mx-4 my-1 border-t" />
            </nav>
          ) : null}

          {/* Marketing links */}
          <nav aria-label="Site navigation">
            <ul className="flex flex-col">
              {links.map(({ href, label }) => {
                const active = isActiveNav(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "border-border flex min-h-11 items-center border-b px-4 text-base",
                        active
                          ? "text-brand-strong border-l-brand-strong border-l-2 font-semibold"
                          : "text-foreground",
                      )}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-border my-2 border-t" />
            <ul className="flex flex-col">
              {isAdmin && (
                <li>
                  <Link
                    href="/admin"
                    className="border-border text-foreground flex min-h-11 items-center border-b px-4 text-base font-medium"
                  >
                    Admin
                  </Link>
                </li>
              )}
              {isSignedIn ? (
                <>
                  <li>
                    <Link
                      href="/account"
                      className="border-border text-foreground flex min-h-11 items-center border-b px-4 text-base"
                    >
                      Account
                    </Link>
                  </li>
                  <li>
                    <SignOutButton className="border-border text-foreground flex min-h-11 w-full items-center border-b px-4 text-base" />
                  </li>
                </>
              ) : (
                <li>
                  <Link
                    href="/login"
                    className="border-border text-foreground flex min-h-11 items-center border-b px-4 text-base"
                  >
                    Sign in
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

(`Admin` still appears in the mobile drawer's account list so admins on a phone retain a labeled path to `/admin` — the wordmark is small on mobile; the drawer entry is the discoverable one. This is intentional and not a contradiction of "drop the desktop Admin link".)

- [ ] **Step 4: Verify lint + typecheck + tests.**

Run: `npm run lint && npm run typecheck && npm test`
Expected: pass; existing `is-active-nav` + new `nav-underline` tests green.

- [ ] **Step 5: Commit.**

```bash
git add src/components/site-nav.tsx
git commit -m "feat(nav): merged mobile drawer (zone sections) + tabs use navUnderline"
```

---

## Task 7: Wire the three zone layouts to `PageShell`

**Files:**

- Modify: `src/app/(marketing)/layout.tsx`
- Modify: `src/app/(account)/layout.tsx`
- Modify: `src/app/(admin)/layout.tsx`

- [ ] **Step 1: Replace `(marketing)/layout.tsx`** entirely:

```tsx
/** Public marketing routes — global shell (header + sheet + footer) via PageShell. */
import { PageShell } from "@/components/layout/page-shell";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <main className="flex-1">{children}</main>
    </PageShell>
  );
}
```

- [ ] **Step 2: Update `(account)/layout.tsx`** — wrap the existing `AppShell` in `PageShell` and pass `zoneNav`. Replace the imports + the returned JSX:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { AppShell } from "@/components/layout/app-shell";
import { accountNav } from "@/components/layout/nav-config";
```

…and the `return`:

```tsx
return (
  <PageShell zoneNav={accountNav}>
    <AppShell nav={accountNav} identity={identity}>
      {children}
    </AppShell>
  </PageShell>
);
```

- [ ] **Step 3: Update `(admin)/layout.tsx`** identically with `adminNav`. Add the `PageShell` import and change the `return`:

```tsx
return (
  <PageShell zoneNav={adminNav}>
    <AppShell nav={adminNav} identity={identity}>
      {children}
    </AppShell>
  </PageShell>
);
```

- [ ] **Step 4: Full verify** (the cross-file `zoneNav` wiring is now complete).

Run: `npm run lint && npm run typecheck && npm run build`
Expected: all pass; 28 pages build.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/(marketing)/layout.tsx" "src/app/(account)/layout.tsx" "src/app/(admin)/layout.tsx"
git commit -m "feat(layout): render every zone through PageShell (global header + sheet)"
```

---

## Task 8: Button hover = deepen

**Files:**

- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Deepen `default` + `brand`.** In `buttonVariants`, change the two variant lines:

```tsx
        default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)]",
        brand: "bg-brand text-brand-foreground hover:bg-brand-strong",
```

(The existing base already presses 1px via `active:not-aria-[haspopup]:translate-y-px` — keep it.)

- [ ] **Step 2: Verify build.**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 3: Commit.**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(ui): button hover deepens (brand -> brand-strong, default darkens)"
```

---

## Task 9: PageHeader `<h1>` leading → token

**Files:**

- Modify: `src/components/layout/page-header.tsx`

- [ ] **Step 1: Replace `leading-tight` with the `typeScale.h1.leading` value (1.1).** Add the import and change the `<h1>`:

Change the imports to add `typeScale`:

```tsx
import { cn } from "@/lib/utils";
import { space, typeScale } from "@/lib/design-tokens";
```

Change the `<h1>`:

```tsx
<h1
  className="text-4xl font-semibold tracking-tight"
  style={{ lineHeight: typeScale.h1.leading }}
>
  {title}
</h1>
```

- [ ] **Step 2: Verify build.**

Run: `npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 3: Commit.**

```bash
git add src/components/layout/page-header.tsx
git commit -m "fix(layout): PageHeader h1 leading from typeScale token (1.1)"
```

---

## Task 10: `FormField` — children XOR inputProps

Make it a type error to pass both a custom `children` control and input props (`placeholder`/`type`/…), so props can no longer be silently dropped.

**Files:**

- Modify: `src/components/ui/form-field.tsx`

- [ ] **Step 1: Replace the prop type** with a discriminated union. Change the `type FormFieldProps` block and the function signature:

```tsx
type FormFieldBase = {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
};

// Either pass input props (rendered as a styled Input) OR a custom control via
// `children` — never both. The `children` branch forbids input props so they
// can't be silently dropped.
type FormFieldProps =
  | (FormFieldBase & { children: React.ReactNode } & {
      [K in keyof Omit<React.ComponentProps<typeof Input>, "name">]?: never;
    })
  | (FormFieldBase & { children?: undefined } & Omit<
        React.ComponentProps<typeof Input>,
        "name"
      >);
```

- [ ] **Step 2: Update the function** to split `children` out before spreading the rest as `inputProps` (unchanged runtime behavior, now type-safe):

```tsx
export function FormField(props: FormFieldProps) {
  const { label, name, hint, error, className, children, ...inputProps } =
    props as FormFieldBase & {
      children?: React.ReactNode;
    } & Omit<React.ComponentProps<typeof Input>, "name">;
  const isInvalid = Boolean(error);
  // …rest of the existing body unchanged…
```

(Keep the entire existing JSX body below this line exactly as-is.)

- [ ] **Step 3: Verify** no existing caller breaks.

Run: `npm run typecheck && npm run build`
Expected: pass. If a caller passed both `children` and input props, that is now a (correct) type error — fix that caller to use one branch.

- [ ] **Step 4: Commit.**

```bash
git add src/components/ui/form-field.tsx
git commit -m "fix(ui): FormField enforces children XOR inputProps at the type level"
```

---

## Task 11: `data-slot` on ConfirmDialog popup + Toast.Root

**Files:**

- Modify: `src/components/feedback/confirm-dialog.tsx`
- Modify: `src/components/feedback/toast.tsx`

- [ ] **Step 1: ConfirmDialog.** On `<AlertDialog.Popup`, add `data-slot="confirm-dialog"` as the first prop (before `className`).

- [ ] **Step 2: Toast.** On `<Toast.Root`, add `data-slot="toast"` (after `toast={toast}`, before `className`).

- [ ] **Step 3: Verify build.**

Run: `npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 4: Commit.**

```bash
git add src/components/feedback/confirm-dialog.tsx src/components/feedback/toast.tsx
git commit -m "fix(feedback): add data-slot to ConfirmDialog popup and Toast.Root"
```

---

## Task 12: `(auth)` layout + auth/onboarding shell adoption

`login`/`signup` get a new `(auth)/layout.tsx` (PageShell, **no** sidebar). All three pages drop hardcoded widths/min-h and compose `PageContainer width="read"`.

**Files:**

- Create: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`
- Modify: `src/app/(account)/onboarding/page.tsx`

- [ ] **Step 1: Create `(auth)/layout.tsx`** (global shell, no zoneNav → no sidebar, marketing-style header):

```tsx
/** Pre-auth routes (login, signup) — global shell with no zone sidebar. */
import { PageShell } from "@/components/layout/page-shell";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <main className="flex-1">{children}</main>
    </PageShell>
  );
}
```

- [ ] **Step 2: `login/page.tsx`** — replace the `return`'s outer `<main>` wrapper. Add the import:

```tsx
import { PageContainer } from "@/components/layout/page-container";
```

Change the outer wrapper from:

```tsx
    <main className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
```

to:

```tsx
    <PageContainer width="read" className="py-12">
      <div className="mx-auto w-full max-w-sm">
```

…and the matching closing tags from `</div>\n    </main>` to `</div>\n    </PageContainer>`. (The page stays a client component.)

- [ ] **Step 3: `signup/page.tsx`** — same change in **both** return branches (the `isSuccess` early-return and the main form). Add the same `PageContainer` import; replace each `<main className="bg-background flex min-h-screen items-center justify-center px-4"><div className="w-full max-w-sm">` with `<PageContainer width="read" className="py-12"><div className="mx-auto w-full max-w-sm">`, and each closing `</div></main>` with `</div></PageContainer>`.

- [ ] **Step 4: `onboarding/page.tsx`** — replace the outer `<main className="mx-auto max-w-lg px-4 py-10">` with `PageContainer`. Add the import, then change the open tag to:

```tsx
    <PageContainer width="read" className="py-10">
```

and its closing `</main>` to `</PageContainer>`.

- [ ] **Step 5: Verify build** (all auth pages now render inside the sheet + global header).

Run: `npm run lint && npm run typecheck && npm run build`
Expected: pass; 28 pages.

- [ ] **Step 6: Commit.**

```bash
git add "src/app/(auth)/layout.tsx" "src/app/(auth)/login/page.tsx" "src/app/(auth)/signup/page.tsx" "src/app/(account)/onboarding/page.tsx"
git commit -m "feat(auth): adopt global shell on login/signup/onboarding (no deep restyle)"
```

---

## Task 13: Docs (same-commit rule)

**Files:**

- Modify: `docs/FRONTEND.md`
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: FRONTEND.md** — in the "Shared chrome + component kit (Phase 1 …)" block, revise the **Navigation** bullet to state the new model: the global `SiteHeader` renders on **every** zone inside `PageShell`; account/admin keep the desktop sidebar below it; the wordmark is the admin affordance (clay tint, underline, → `/admin`); one merged mobile drawer (zone sections + marketing + account), hamburger flush-right; sheet full-bleed on mobile. Add a new bullet **"Interaction language"** documenting `nav-underline` (top-bar links, via `navUnderline`), the sidebar **rect** (`--sidebar-active`), and **button deepen** as the standing standard. Add a **"Shell"** note: `PageShell` = desk (`--canvas` + `.desk-grain`) + centered `bg-card` sheet (hairline side borders, full height); `PageContainer` still governs the inner content column. Update the `Last reviewed:` footer to `2026-06-05`.

- [ ] **Step 2: DESIGN.md** — add a short "Layout: desk + sheet" note to the brand/visual section: every page is one centered sheet on a warm accent desk (`--canvas`, faint grain), SEP-inspired; hairline edges. Update its `Last reviewed:` footer to `2026-06-05` if present.

- [ ] **Step 3: Commit.**

```bash
git add docs/FRONTEND.md docs/DESIGN.md
git commit -m "docs: document global-header shell, desk+sheet, interaction language"
```

---

## Task 14: Verification gate — automated + live 390px a11y walk

No code; this is the completion gate. Do **not** claim done until every check below passes (per superpowers:verification-before-completion).

- [ ] **Step 1: Automated gate.**

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: all green; build = 28 pages; tests include `is-active-nav` + `nav-underline`.

- [ ] **Step 2: Token-swap proof.** Temporarily change `--canvas` in `:root` to an obvious color (e.g. `#ff00ff`), run `npm run build`/dev, confirm every zone's desk recolors with zero component edits, then revert. Confirms the two-layer contract.

- [ ] **Step 3: Launch the app for the live walk.**

Run: `npm run dev` (note the local URL).

- [ ] **Step 4: Desktop walk (light + dark).** On a desktop viewport, visit `/`, `/about`, `/account`, `/account/pets`, `/admin`, `/admin/availability`, `/login`, `/onboarding`. Confirm for each: the global header shows on every page; the sheet is centered with hairline side borders on the accent desk; the desk grain is felt but not muddy (check dark too); footer sits at the sheet bottom; tabs/account/admin-wordmark show the underline on hover + active `aria-current`; sidebar items show the clay-soft rect when active and a neutral rect on hover; buttons deepen on hover and press on click. Toggle dark mode (`.dark` on `<html>`) and re-confirm contrast on every hover/active pairing.

- [ ] **Step 5: Mobile walk @ 390px.** Set the viewport to 390px. Confirm: the sheet is full-bleed (no side gutters, no side borders); the hamburger is flush to the right edge with no excess margin; opening the drawer shows zone sections first (in account/admin) then marketing + account/sign-out; **focus-trap + Esc** work on the drawer and on a `ConfirmDialog`; visible focus rings on every interactive element; no horizontal scroll on any route.

- [ ] **Step 6: Report.** Summarize the walk results (what was checked, anything adjusted). Only after all pass, state the phase is complete. Remind Alex the branch is **unpushed** by design.

---

## Self-review notes (author)

- **Spec coverage:** §A desk+sheet → T1+T3; grain → T1+T3; §B global header/wordmark/drop-Admin → T5; sidebar reduction → T4; §C interaction language (underline/rect/deepen) → T2,T4,T6,T8; §D tokens → T1; §E cleanups (PageHeader/FormField/data-slot) → T9,T10,T11; §F auth adoption → T12; §G merged drawer → T6; docs → T13; verification incl. 390px a11y walk → T14. All covered.
- **Mobile two-hamburger risk** resolved: AppShell's drawer removed (T4); only the header drawer remains (T6).
- **Type consistency:** `zoneNav?: ZoneNav` is the same name+type across PageShell (T3), SiteHeader (T5), SiteNavMobile (T6); `navUnderline`/`NAV_UNDERLINE_BASE` defined T2, consumed T5/T6; `--sidebar-active` defined T1, used T4/T6.
- **Known acceptable deferrals:** marketing page **bodies** (full-bleed `bg-background`/`bg-muted` sections inside the white sheet) are not restyled here — that is Phase 2; they render correctly, just not yet redesigned. `account-menu.tsx` stays a client component (server refactor deferred per spec).
