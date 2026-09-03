# Persistent Site Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the header, footer, sidebar, and cursor effects from remounting on every cross-zone navigation, so switching between marketing / account / admin keeps the chrome stable (no auth-query flash, no cursor swoop) and sidebar tab switches are instant.

**Architecture:** Today each route group (`(marketing)`, `(account)`, `(admin)`) is a sibling with its own `layout.tsx` that rebuilds the whole `PageShell` chrome — so the App Router unmounts and remounts everything on a zone switch. We introduce a shared parent group `app/(site)/` whose `layout.tsx` owns the persistent chrome (sheet + `SiteHeader` + `SiteFooter`); the three zones move underneath it and keep only their thin responsibilities (gate + sidebar). Because the shared layout sits _above_ the navigated segment, it renders once and is preserved across all in-`(site)` navigation. `SiteHeader` can no longer receive zone-specific props from below, so it self-sources `zoneNav` (from `usePathname`, client) and admin badges (self-fetch, React-`cache`-deduped). `(auth)` and `(onboarding)` stay at the root, chrome-free.

**Tech Stack:** Next.js App Router (route groups, nested layouts, streaming Suspense), React Server Components + `cache()`, Supabase SSR, Tailwind v4, Vitest.

---

## File Structure

**New:**

- `src/app/(site)/layout.tsx` — persistent shell; renders `PageShell` around `{children}`.

**Moved (via `git mv`, preserving history; URLs unchanged because route groups don't affect paths):**

- `src/app/(marketing)/**` → `src/app/(site)/(marketing)/**`
- `src/app/(account)/**` → `src/app/(site)/(account)/**`
- `src/app/(admin)/**` → `src/app/(site)/(admin)/**`

**Modified:**

- `src/components/layout/page-shell.tsx` — drop `zoneNav`/`navBadgesPromise` props; render chrome only.
- `src/components/site-header.tsx` — self-source zone + badges instead of props.
- `src/components/site-nav.tsx` (`SiteNavMobile`) — derive `zoneNav` from `usePathname`.
- `src/app/(site)/(marketing)/layout.tsx` — drop `PageShell` wrapper (now `<main>` only).
- `src/app/(site)/(account)/layout.tsx` — drop `PageShell` wrapper (keep gate + `AppShell`).
- `src/app/(site)/(admin)/layout.tsx` — drop `PageShell` wrapper (keep gate + badges + `AppShell`).
- `src/features/admin/<attention module>` — export a `cache()`-wrapped `getAttentionCounts`.
- `src/components/effects/cursor-parallax.tsx`, `src/components/effects/cursor-ring.tsx` — snap to first pointer position on mount (kill the off-screen swoop).

**Unchanged but relevant:** `src/app/layout.tsx` (root — keeps `CursorParallax`, fonts, providers), `src/lib/supabase/proxy.ts` (auth gate stays in middleware), `src/components/layout/app-shell.tsx` (sidebar; already renders directly when no badges promise), `src/components/layout/nav-config.ts` (nav data the mobile drawer will import).

---

## Pre-flight (read before Task 1)

- Repo policy: work on `main`, no worktree unless asked, **commit messages subject-line only** (Conventional Commits, no body/trailer). A husky pre-commit hook runs `tsc --noEmit` over the whole project — keep the tree green.
- An untracked, incomplete file `src/features/booking/_components/notes-for-cal-field.tsx` references a not-yet-existing `BOOKING_COMMENTS_MAX` and **fails `tsc`**. It is imported nowhere. If it is still present on disk it will block every commit. Before starting, stash it: `git stash push -u -- "src/features/booking/_components/notes-for-cal-field.tsx"` and `git stash pop` when the plan is done (or leave it stashed). Do NOT commit it and do NOT complete that feature here.
- Verification commands used throughout: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run dev` for manual checks.

---

### Task 1: Scaffold `(site)` group and move the three zones

**Files:**

- Create: `src/app/(site)/layout.tsx`
- Move: `src/app/(marketing)` → `src/app/(site)/(marketing)`; `(account)` → `src/app/(site)/(account)`; `(admin)` → `src/app/(site)/(admin)`

- [ ] **Step 1: Confirm `(auth)` and `(onboarding)` are self-contained**

Run: `ls "src/app/(auth)" "src/app/(onboarding)"`
Expected: each contains its own `layout.tsx` (they do not depend on a zone `PageShell`). They will NOT be moved.

- [ ] **Step 2: Create the `(site)` directory and move the three zones with history preserved**

Run:

```bash
cd "src/app"
mkdir -p "(site)"
git mv "(marketing)" "(site)/(marketing)"
git mv "(account)" "(site)/(account)"
git mv "(admin)" "(site)/(admin)"
```

Expected: `find "(site)" -maxdepth 1 -type d` lists `(marketing)`, `(account)`, `(admin)`. `(auth)`, `(onboarding)`, `api`, `layout.tsx`, `globals.css`, `not-found.tsx` remain at `src/app/`.

- [ ] **Step 3: Add the persistent shell layout**

Create `src/app/(site)/layout.tsx`. At this point `PageShell` still takes optional props; we pass none (Task 4 removes them). This renders chrome ONCE for all three zones.

```tsx
/**
 * Persistent site shell. This layout sits above the (marketing) / (account) /
 * (admin) groups, so the App Router renders it ONCE and preserves it across every
 * navigation between those zones — the header, footer, and sheet never remount,
 * which is what kills the cross-zone auth-query flash and cursor swoop. Each zone
 * keeps only its own thin layout below (gate + sidebar). Auth/onboarding routes
 * live outside this group and stay chrome-free.
 */
import { PageShell } from "@/components/layout/page-shell";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
```

- [ ] **Step 4: Strip the `PageShell` wrapper from the marketing layout**

Modify `src/app/(site)/(marketing)/layout.tsx` — the shell now comes from the parent; marketing only supplies its full-width `<main>`.

```tsx
/** Public marketing routes. Chrome (header/footer/sheet) is provided by the
 *  parent (site) shell; this layout only supplies the full-width content main. */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="flex-1">{children}</main>;
}
```

- [ ] **Step 5: Strip the `PageShell` wrapper from the account layout**

Modify `src/app/(site)/(account)/layout.tsx` — keep the unauth backstop + `AppShell`; drop `PageShell` and the now-unused `zoneNav` prop pass-through.

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { accountNav } from "@/components/layout/nav-config";

/**
 * Account zone shell. The real auth + onboarding gate lives in middleware
 * (`src/lib/supabase/proxy.ts`); this keeps a thin unauthenticated backstop and
 * renders the persistent account sidebar. Header/footer come from the (site) shell.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_status")
    .eq("id", user.id)
    .single();
  const identity = profile?.full_name ?? user.email ?? "Signed in";
  const locked = profile?.onboarding_status !== "approved";

  return (
    <AppShell nav={accountNav} identity={identity} locked={locked}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 6: Strip the `PageShell` wrapper from the admin layout**

Modify `src/app/(site)/(admin)/layout.tsx` — keep the role gate + badges promise + `AppShell`; drop `PageShell`. (The badges promise is still used by the sidebar; the header's copy is added in Task 5.)

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { adminNav, type NavBadges } from "@/components/layout/nav-config";
import { getAttentionCounts } from "@/features/admin";

/** Guard for all (admin) routes: unauthenticated or non-admin role → redirect. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  const identity = `${profile?.full_name ?? user.email ?? "Admin"} · admin`;

  // Don't await — pass the promise so AppShell's badge loader resolves it inside
  // its own Suspense boundary and the admin loading.tsx can paint immediately.
  const attentionPromise = getAttentionCounts().then((attention) => {
    const badges: NavBadges = {
      "/admin/bookings": {
        count: attention.pendingApprovals,
        label: "awaiting approval",
      },
      "/admin/inquiries": { count: attention.newInquiries, label: "new" },
    };
    return badges;
  });

  return (
    <AppShell
      nav={adminNav}
      identity={identity}
      navBadgesPromise={attentionPromise}
    >
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 7: Typecheck — expect failures only in `page-shell.tsx` / `site-header.tsx`**

Run: `npm run typecheck`
Expected: errors are limited to `PageShell` being called without `zoneNav` where TS still thinks it's needed (it's optional, so likely none) and any `zoneNav` references; the route move itself should produce NO import errors (all cross-folder imports use `@/`). If any moved file shows a broken relative import, fix it to the `@/` alias. Do not proceed to commit until the only remaining concerns are the intended Task 4–5 refactors.

- [ ] **Step 8: Build to confirm routes still resolve at the same URLs**

Run: `npm run build`
Expected: the route manifest lists `/`, `/about`, `/services`, `/account`, `/admin`, etc. — unchanged paths. If the build passes, the move is structurally sound.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: introduce persistent (site) shell above zone groups"
```

---

### Task 2: Make `PageShell` chrome-only (drop zone props)

**Files:**

- Modify: `src/components/layout/page-shell.tsx`

- [ ] **Step 1: Simplify `PageShell` to render chrome around children with no zone props**

Replace the component (keep the existing doc comment's "sheet on a desk" explanation, trimmed). `SiteHeader`/`SiteFooter` now take no zone props.

```tsx
import * as React from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "./site-footer";

/**
 * The "sheet on a desk" shell, rendered ONCE by the (site) layout and preserved
 * across all in-site navigation. The desk (canvas + texture) is painted on <html>
 * and shows through the gutters; one centered sheet holds the global header, the
 * zone content, and the footer. Header/footer self-source any auth/zone data, so
 * this shell takes no props beyond children.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="bg-background dark:border-border relative mx-auto flex w-full max-w-6xl flex-1 flex-col sm:shadow-[0_4px_40px_-8px_rgba(28,24,19,0.16)] dark:shadow-none dark:sm:border-x">
        <SiteHeader />
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck — `SiteHeader` prop errors are expected next**

Run: `npm run typecheck`
Expected: errors now point at `SiteHeader` (still declares `zoneNav`/`navBadgesPromise` props). Proceed to Task 3.

---

### Task 3: Derive `zoneNav` from the pathname in the mobile drawer

**Files:**

- Modify: `src/components/site-nav.tsx` (`SiteNavMobile`)
- Test: `src/components/layout/zone-for-path.test.ts` (new pure helper + test)

- [ ] **Step 1: Write a failing test for a pure `zoneNavForPath` helper**

Create `src/components/layout/zone-for-path.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { zoneNavForPath } from "./zone-for-path";
import { accountNav, adminNav } from "./nav-config";

describe("zoneNavForPath", () => {
  it("returns the admin nav inside /admin", () => {
    expect(zoneNavForPath("/admin")).toBe(adminNav);
    expect(zoneNavForPath("/admin/bookings")).toBe(adminNav);
  });
  it("returns the account nav inside /account", () => {
    expect(zoneNavForPath("/account")).toBe(accountNav);
    expect(zoneNavForPath("/account/pets")).toBe(accountNav);
  });
  it("returns undefined on marketing routes", () => {
    expect(zoneNavForPath("/")).toBeUndefined();
    expect(zoneNavForPath("/services")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- zone-for-path`
Expected: FAIL — `zone-for-path` module not found.

- [ ] **Step 3: Implement the helper**

Create `src/components/layout/zone-for-path.ts`:

```ts
import { accountNav, adminNav, type ZoneNav } from "./nav-config";

/**
 * Pick the zone nav for a pathname. Used by the mobile drawer in the persistent
 * header, which can no longer receive a zone prop from a per-zone layout (the
 * header lives above the zones now) and instead derives the zone client-side.
 */
export function zoneNavForPath(pathname: string): ZoneNav | undefined {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return adminNav;
  if (pathname === "/account" || pathname.startsWith("/account/"))
    return accountNav;
  return undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- zone-for-path`
Expected: PASS (3 tests).

- [ ] **Step 5: Make `SiteNavMobile` derive its own `zoneNav`**

Modify `src/components/site-nav.tsx`. Locate the `SiteNavMobile` component. Remove `zoneNav` from its props and compute it from `usePathname()` (the component is already `"use client"`; confirm it imports `usePathname` from `next/navigation`). `navBadges` stays a prop (server-fetched, passed by `HeaderAuth` in Task 5).

Replace the prop destructure and add the derivation. Example shape (adapt to the file's exact prop list — keep `links`, `navBadges`, `isSignedIn`, `isAdmin`):

```tsx
// before: export function SiteNavMobile({ links, zoneNav, navBadges, isSignedIn, isAdmin }: SiteNavMobileProps) {
export function SiteNavMobile({
  links,
  navBadges,
  isSignedIn,
  isAdmin,
}: SiteNavMobileProps) {
  const pathname = usePathname();
  const zoneNav = zoneNavForPath(pathname);
  // ...rest unchanged; `zoneNav` is now a local, used exactly as before.
```

Add the import at the top of the file:

```tsx
import { zoneNavForPath } from "@/components/layout/zone-for-path";
```

Update the `SiteNavMobileProps` type to drop `zoneNav`. If `usePathname` isn't already imported, add it: `import { usePathname } from "next/navigation";`

- [ ] **Step 6: Typecheck + test**

Run: `npm run typecheck` then `npm run test -- zone-for-path`
Expected: `site-nav.tsx` no longer errors on `zoneNav`; remaining typecheck errors are in `site-header.tsx` (Task 5). Tests pass.

---

### Task 4: Cache the admin attention-counts fetch

**Files:**

- Modify: the module that exports `getAttentionCounts` (find with `grep -rn "export .*getAttentionCounts" src/features/admin`)

- [ ] **Step 1: Wrap `getAttentionCounts` in React `cache()` for same-request dedupe**

Because both the admin sub-layout (sidebar badges) and the header (drawer badges, Task 5) call `getAttentionCounts` during the same initial render, wrap it so they share one query per request. Locate the export and wrap it:

```ts
import { cache } from "react";

// Rename the existing implementation to an inner function, then export a cached
// wrapper with the SAME name/signature so all call sites are unchanged:
const _getAttentionCounts = async (): Promise<AttentionCounts> => {
  // ...existing body unchanged...
};

export const getAttentionCounts = cache(_getAttentionCounts);
```

Keep the exported name `getAttentionCounts` and its return type identical so the barrel `@/features/admin` and existing imports are unaffected.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from this change (signature preserved). `site-header.tsx` errors remain (Task 5).

- [ ] **Step 3: Commit progress (Tasks 2–4)**

```bash
git add -A
git commit -m "refactor: make page shell chrome-only and derive zone nav from path"
```

---

### Task 5: Self-source zone + badges in `SiteHeader`

**Files:**

- Modify: `src/components/site-header.tsx`

- [ ] **Step 1: Remove the header's zone props and fetch badges when admin**

Edit `src/components/site-header.tsx`:

1. Change the exported `SiteHeader` signature to take **no props**:

```tsx
export function SiteHeader() {
  return (
    <header className="bg-card border-border border-b">
      {/* ...existing inner markup unchanged, but the Suspense child no longer
          forwards zoneNav/navBadgesPromise: */}
      <Suspense fallback={<HeaderAuthSkeleton />}>
        <HeaderAuth />
      </Suspense>
      {/* ...tab row unchanged... */}
    </header>
  );
}
```

2. Make `HeaderAuth` take no props and fetch badges itself when the user is admin. The mobile drawer (`SiteNavMobile`) no longer receives `zoneNav` (it derives it); it still receives `navBadges`.

```tsx
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
  // this resolves once on load (not per navigation). The call is React-cache'd,
  // so it dedupes with the admin sidebar's identical fetch on initial render.
  // Freshness after mutations rides on the existing router.refresh() calls.
  const navBadges = isAdmin ? await getNavBadges() : undefined;

  const authCluster = (
    <div className="flex items-center gap-5 text-sm">
      {user ? <AccountMenu /> : <SignInLink />}
    </div>
  );

  return (
    <>
      <div className="col-start-1 row-start-1 min-w-0 justify-self-start">
        <Wordmark isAdmin={isAdmin} />
      </div>
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
```

3. Add a small `getNavBadges()` helper in this file (or inline) that shapes counts into `NavBadges`, reusing the cached `getAttentionCounts`:

```tsx
import { getAttentionCounts } from "@/features/admin";
import type { NavBadges } from "@/components/layout/nav-config";

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
```

4. Remove the now-unused `ZoneNav` / `NavBadges` prop types from `SiteHeader`/`HeaderAuth` signatures and any leftover `navBadgesPromise` references. Keep `HeaderAuthSkeleton` rendering `<Wordmark />` (no `isAdmin`) as it is.

> **DRY note:** the badge-shaping logic now exists in both the admin sub-layout and `getNavBadges`. If you prefer, extract a single `attentionToNavBadges(attention)` helper in the admin feature and call it from both. Optional; not required for correctness.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck` then `npm run lint`
Expected: PASS. No remaining references to header `zoneNav`/`navBadgesPromise` props anywhere (grep to confirm: `grep -rn "navBadgesPromise" src/components/site-header.tsx` → no matches).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: self-source auth and zone data in persistent header"
```

---

### Task 6: Kill the cursor swoop on mount

**Files:**

- Modify: `src/components/effects/cursor-ring.tsx`
- Modify: `src/components/effects/cursor-parallax.tsx`

- [ ] **Step 1: Snap the ring to its first real position instead of easing from off-screen**

In `src/components/effects/cursor-ring.tsx`, the effect initializes `let instant = false;` and only sets it `true` after a window exit. On a fresh mount the ring sits at its off-screen default (`lastX = -800`) and the first pointermove EASES across the page — the swoop. Initialize it to snap on the first move after mount:

Change:

```tsx
let instant = false;
```

to:

```tsx
// Snap (don't ease) the first move after mount, so a freshly-mounted ring
// (e.g. entering the account/admin zone) appears at the cursor instead of
// swooping in from its off-screen default.
let instant = true;
```

- [ ] **Step 2: Apply the same snap to the background parallax**

In `src/components/effects/cursor-parallax.tsx`, change:

```tsx
let jump = false;
```

to:

```tsx
// Snap the first move after mount (see cursor-ring) so the texture doesn't
// glide from center on a fresh mount.
let jump = true;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: snap cursor effects to pointer on mount"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Automated suite**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all green. (The stashed `notes-for-cal-field.tsx` must be absent from disk or the hook/typecheck will fail — keep it stashed.)

- [ ] **Step 2: Manual — chrome stability across zones**

Run: `npm run dev`. Sign in as an admin. Then:

- Navigate marketing → account → admin → marketing.
- Confirm: the header does NOT flash/re-skeleton; the wordmark stays clay (admin) the whole time; the footer doesn't blink; the background texture doesn't swoop; if the cursor ring is visible, it does not zoom in from off-screen.

- [ ] **Step 3: Manual — instant sidebar nav**

Within `/account` (and `/admin`), click between sidebar tabs.
Expected: the active highlight moves to the clicked tab IMMEDIATELY; only the page content area shows the loading spinner while its data loads. The sidebar itself never re-skeletons or re-mounts.

- [ ] **Step 4: Manual — auth pages stay chrome-free**

Visit `/login` and `/onboarding`.
Expected: no marketing header/footer/sidebar (they are outside `(site)`), exactly as before the refactor.

- [ ] **Step 5: Manual — admin badges**

As admin, confirm attention badges still render on the sidebar and in the mobile drawer (resize to mobile width). Trigger a mutation that changes a count (or call `router.refresh()` via an action) and confirm the count updates. Note: counts refresh on mutation/refresh, not merely on navigation (the persistent header fetches once) — this is expected.

- [ ] **Step 6: Restore the stashed WIP file**

Run: `git stash list` — if the notes file is stashed, `git stash pop` to return it to the working tree (it stays untracked/uncommitted).

- [ ] **Step 7: Update the docs footer if touched**

If any doc under `docs/` references the old per-zone shell structure (grep `docs` for `PageShell`/zone-layout descriptions), update it in the same spirit. Per repo rules, a structural change updates the relevant doc in the same commit.

---

## Self-Review Notes

- **Spec coverage:** persistent chrome (Tasks 1–2, 5), instant sidebar (consequence of Task 1 — sub-layout persists within zone; verified Task 7 Step 3), cursor swoop (Task 6), no auth flash (Task 5 — header renders once), auth pages chrome-free (Task 1 — zones moved, `(auth)`/`(onboarding)` untouched).
- **Badge freshness tradeoff:** the persistent header fetches admin badges once per load instead of per navigation. Accepted; refresh rides on existing `router.refresh()` after mutations. Documented in Task 5 and verified in Task 7 Step 5.
- **Type consistency:** `getAttentionCounts` keeps its name/signature (Task 4); `NavBadges`/`ZoneNav` types are unchanged in `nav-config.ts`; `zoneNavForPath` returns `ZoneNav | undefined` matching `SiteNavMobile`'s now-local `zoneNav`.
- **Open follow-up (out of scope):** if the cursor ring should also wash over the persistent header, decide its final placement inside the `(site)` shell separately — the user is actively iterating on cursor-ring design (see root-level `cursor-*.html` mockups).
