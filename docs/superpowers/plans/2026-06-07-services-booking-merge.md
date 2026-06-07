# Services + Booking Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated public Services and Book hubs with one faithful `/services` hub whose active-service cards open the existing per-service booking flows.

**Architecture:** Keep `/services` on the existing validated `listActiveServices` read path and compose the existing Services card content with the Book hub's whole-card link behavior. Make `/book` a permanent compatibility redirect while preserving `/book/[serviceSlug]` and all booking/auth logic. Add one typed, tested marketing-nav alias so the Services tab remains active on per-service booking routes.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript strict, Tailwind semantic tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-services-booking-merge-design.md`

**Standing constraints:** Work on `main`; no worktree; TS strict/no `any`; use semantic design tokens only; preserve `[[ ]]` copy rules; stage files by name; conventional commit subject only; do not modify or stage unrelated dirty-worktree files.

---

## File Structure

**Modify:**

- `src/components/layout/nav-config.ts` — allow a marketing nav item to declare additional active route sections.
- `src/components/layout/is-active-nav.ts` — own the pure active-state rule for a typed nav item.
- `src/components/layout/is-active-nav.test.ts` — TDD coverage for Services being active on `/book/[serviceSlug]`.
- `src/components/site-nav.tsx` — use the shared nav-item active rule in desktop and mobile marketing navigation.
- `src/components/site-header.tsx` — remove the separate Book item and give Services the `/book` active alias.
- `src/components/layout/site-footer.tsx` — remove the separate Book footer link.
- `src/app/(marketing)/services/page.tsx` — become the merged Services & Booking hub.
- `src/app/(marketing)/book/page.tsx` — become a permanent redirect to `/services`.
- `src/app/(marketing)/book/[serviceSlug]/page.tsx` — send the “All services” back link to `/services`.
- `src/app/(marketing)/page.tsx` — consolidate the now-duplicate hero CTAs and route service-hub CTAs to `/services`.
- `docs/DESIGN.md` — update project-specific routes and booking-flow description.

**No new production files.** Existing `/book/[serviceSlug]` components, booking return-to validation, pricing, Scheduler, and auth gates remain untouched.

---

## Task 1: Add A Tested Marketing-Nav Alias And Remove Book Navigation

**Files:**

- Modify: `src/components/layout/nav-config.ts`
- Modify: `src/components/layout/is-active-nav.ts`
- Test: `src/components/layout/is-active-nav.test.ts`
- Modify: `src/components/site-nav.tsx`
- Modify: `src/components/site-header.tsx`
- Modify: `src/components/layout/site-footer.tsx`

- [ ] **Step 1: Write failing tests for aliased nav sections**

Add `isActiveNavItem` to the import and append this suite in `src/components/layout/is-active-nav.test.ts`:

```ts
import { isActiveNav, isActiveNavItem, isActiveSection } from "./is-active-nav";

describe("isActiveNavItem", () => {
  const servicesItem = {
    href: "/services",
    label: "Services",
    activeSections: ["/book"],
  };

  it("matches the item's primary section", () => {
    expect(isActiveNavItem("/services", servicesItem)).toBe(true);
  });

  it("matches a nested aliased section", () => {
    expect(isActiveNavItem("/book/training", servicesItem)).toBe(true);
  });

  it("does not match an unrelated section", () => {
    expect(isActiveNavItem("/reviews", servicesItem)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
npx vitest run src/components/layout/is-active-nav.test.ts
```

Expected: FAIL because `isActiveNavItem` is not exported.

- [ ] **Step 3: Add the typed active-section alias**

Replace the `NavItem` type in `src/components/layout/nav-config.ts`:

```ts
export type NavItem = {
  href: string;
  label: string;
  activeSections?: string[];
};
```

Add this export to `src/components/layout/is-active-nav.ts`:

```ts
import type { NavItem } from "./nav-config";

/** Marketing-nav matcher: primary section plus any explicitly owned route sections. */
export function isActiveNavItem(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.activeSections ?? [])].some((section) =>
    isActiveSection(pathname, section),
  );
}
```

- [ ] **Step 4: Use one active-state rule in desktop and mobile marketing nav**

In `src/components/site-nav.tsx`, import `isActiveNavItem` instead of `isActiveSection`.

Change both marketing-link maps to retain the whole item:

```tsx
{
  links.map((item) => {
    const active = isActiveNavItem(pathname, item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={navUnderline(active)}
        >
          {item.label}
        </Link>
      </li>
    );
  });
}
```

For the mobile marketing list, use the same `item`/`isActiveNavItem` pattern while preserving its existing classes.

- [ ] **Step 5: Remove Book from public navigation and alias booking routes to Services**

In `src/components/site-header.tsx`, replace the Services and Book entries with one item:

```ts
{ href: "/services", label: "Services", activeSections: ["/book"] },
```

Delete the separate `{ href: "/book", label: "Book" }`.

In `src/components/layout/site-footer.tsx`, delete the complete `<li>` containing the Book link. Keep About and Services unchanged.

- [ ] **Step 6: Run focused and static verification**

Run:

```bash
npx vitest run src/components/layout/is-active-nav.test.ts
npm run typecheck
npm run lint
```

Expected: all PASS. The focused suite includes the new alias cases; no desktop/mobile marketing nav path uses `isActiveSection` directly.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/nav-config.ts src/components/layout/is-active-nav.ts src/components/layout/is-active-nav.test.ts src/components/site-nav.tsx src/components/site-header.tsx src/components/layout/site-footer.tsx
git commit -m "feat(nav): merge book navigation into services"
```

---

## Task 2: Merge The Public Hubs And Update Hub Links

**Files:**

- Modify: `src/app/(marketing)/services/page.tsx`
- Modify: `src/app/(marketing)/book/page.tsx`
- Modify: `src/app/(marketing)/book/[serviceSlug]/page.tsx`
- Modify: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Turn each existing Services card into a whole-card booking link**

In `src/app/(marketing)/services/page.tsx`:

- Keep `listActiveServices`, `headlineRate`, and the current empty message.
- Remove imports for `buttonVariants` and `cn`.
- Keep `Link`.
- Change the page title to `Services & Booking`.
- Keep real service descriptions; when absent, render a pricing-type-specific short-description `[[BODY: …]]` placeholder.
- Show `Overnight` as House Sitting's duration label; other services show configured `default_duration_min` when present.
- Change the responsive grid to one column on mobile and two columns from `sm` upward.
- Replace `ServiceCard` with:

```tsx
function ServiceCard({ service }: { service: PublicService }) {
  const rate = headlineRate(service.pricingType, service.pricingConfig);

  return (
    <Link
      href={`/book/${service.slug}`}
      className="focus-visible:ring-ring/50 block h-full rounded-xl outline-none focus-visible:ring-3"
    >
      <Card className="hover:border-foreground/40 h-full transition-colors">
        <CardHeader>
          <CardTitle className="font-heading">{service.name}</CardTitle>
          <p className="text-brand-strong text-sm font-medium">{rate}</p>
        </CardHeader>
        {service.description ? (
          <CardContent className="text-muted-foreground leading-relaxed">
            {service.description}
          </CardContent>
        ) : null}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          {service.default_duration_min !== null ||
          service.max_pets !== null ? (
            <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {service.default_duration_min !== null ? (
                <>
                  <dt className="sr-only">Default duration</dt>
                  <dd>{service.default_duration_min} min</dd>
                </>
              ) : null}
              {service.max_pets !== null ? (
                <>
                  <dt className="sr-only">Max pets</dt>
                  <dd>
                    Up to {service.max_pets} pet
                    {service.max_pets !== 1 ? "s" : ""}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : (
            <span />
          )}
          <span className="text-brand-strong text-xs font-semibold">
            View availability →
          </span>
        </div>
      </Card>
    </Link>
  );
}
```

Keep the existing dynamic `services.map`, so Training and all future active services render without hardcoding.

- [ ] **Step 2: Remove the circular sliding-scale CTA**

In the sliding-scale section:

- Remove the `<Link href="/book">Book a service</Link>`.
- Remove `mb-6` from the paragraph because no button follows it.
- Change the placeholder to:

```tsx
[[BODY: pricing accessibility statement and how to ask about it]]
```

The section keeps its current `border-border bg-card` classes and `Eyebrow`.

- [ ] **Step 3: Replace the visible `/book` hub with a permanent redirect**

Replace `src/app/(marketing)/book/page.tsx` completely:

```tsx
import { permanentRedirect } from "next/navigation";

/** Compatibility fallback for stale public links to the retired booking hub. */
export default function BookPage() {
  permanentRedirect("/services");
}
```

Do not delete the `book/` directory because `/book/[serviceSlug]` remains the canonical per-service booking flow.

- [ ] **Step 4: Update the per-service back link**

In `src/app/(marketing)/book/[serviceSlug]/page.tsx`, change only:

```tsx
<Link
  href="/services"
  className="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm"
>
  ← All services
</Link>
```

Do not change any `/book/[serviceSlug]` auth return-to logic.

- [ ] **Step 5: Consolidate home-page CTAs**

In `src/app/(marketing)/page.tsx`:

- Change the hero's primary CTA destination from `/book` to `/services`.
- Change its label from `Book a service` to `Services & booking`.
- Remove the adjacent outline `See services` link because it would target the same merged hub.
- Change the closing CTA destination from `/book` to `/services`.
- Change the closing CTA label from `Book a service` to `Services & booking`.

After the edit, `MarketingHero.actions` contains one primary Link:

```tsx
<Link
  href="/services"
  className={cn(
    buttonVariants({ variant: "brand", size: "lg" }),
    "w-full sm:w-auto",
  )}
>
  Services &amp; booking
</Link>
```

- [ ] **Step 6: Verify routes and stale hub links**

Run:

```bash
rg 'href="/book"' src
npm run typecheck
npm run lint
npm run build
```

Expected:

- `rg` finds no exact public hub links; `/book/${service.slug}` and booking return-to paths remain.
- Typecheck, lint, and build PASS.
- Build still includes `/book/[serviceSlug]`; `/book` is the redirect route.

- [ ] **Step 7: Manual visual and route check**

Run `npm run dev` and verify:

- `/services` title is `Services & Booking`.
- All active services render, including Training.
- Rates and nullable metadata match service data.
- The grid is one column on mobile and two columns at wider breakpoints.
- House Sitting shows `Overnight`; every card has real or placeholder short-description copy.
- Every card opens its `/book/[serviceSlug]` page.
- Card hover/focus behavior matches the former Book cards.
- Sliding-scale section has no button.
- `/book` returns a permanent redirect to `/services`.
- The per-service `← All services` link returns to `/services`.
- Home has one hero service CTA and one closing service CTA, both targeting `/services`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(marketing)/services/page.tsx" "src/app/(marketing)/book/page.tsx" "src/app/(marketing)/book/[serviceSlug]/page.tsx" "src/app/(marketing)/page.tsx"
git commit -m "feat(marketing): merge services and booking hubs"
```

---

## Task 3: Update Project Route And Booking Documentation

**Files:**

- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Update the project-specific merge decision**

Make these focused edits in `docs/DESIGN.md`:

- In MVP scope, change sliding scale from a CTA to an informational section on Services & Booking.
- In the route map:
  - describe `/services` as the public services, rates, and booking chooser hub;
  - describe `/book` as a permanent compatibility redirect to `/services`;
  - keep `/book/[serviceSlug]` as the public-view/auth-to-book flow.
- In “Booking flow + deferred-auth gate,” state that `/services` lists active services and each card opens `/book/[serviceSlug]`.
- Change the availability-windows sentence from “`/book` reflects live state” to “`/book/[serviceSlug]` reflects live state.”
- Keep all return-to rules under `/book/` unchanged.
- Update the last-reviewed footer to `2026-06-07` with a short services/booking merge note.

- [ ] **Step 2: Check documentation consistency and formatting**

Run:

```bash
rg '`/book` is a public service chooser|Service chooser — cards|sliding scale → a CTA|`/book` reflects live state' docs/DESIGN.md
npx prettier --check docs/DESIGN.md
git diff --check -- docs/DESIGN.md
```

Expected: the stale statements return no matches; formatting and diff check PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: record merged services booking hub"
```

---

## Task 4: Full Verification And Handoff

**Files:** none unless verification reveals an in-scope defect.

- [ ] **Step 1: Run all automated gates**

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Expected: all PASS.

- [ ] **Step 2: Run cross-model code review**

Run the available `/code-review` or reviewer workflow on the implementation diff. Findings must lead the report and critical findings must be resolved before completion.

- [ ] **Step 3: Manual desktop and mobile verification**

Using the in-app Browser where available, verify desktop and 390px mobile in light and dark mode:

- Header and mobile drawer have one service-related item: Services.
- Services is active on `/services` and `/book/training`.
- Footer has About and Services, with no Book link.
- `/services` retains current Trail palette, PageHeader/Card typography, semantic colors, spacing, and responsive 3→2→1 card grid.
- Every service card is keyboard-focusable with a visible focus ring and at least the existing whole-card hit target.
- Training renders; nullable duration/max-pets metadata does not invent values.
- `/book` redirects to `/services`.
- `/book/training` and `/book/house-sitting` still render their existing booking flows.
- No horizontal scroll at 390px.

- [ ] **Step 4: Re-audit scope and stale references**

Run:

```bash
rg 'href="/book"|label: "Book"' src/components src/app
rg '`/book` is a public service chooser|Service chooser — cards|sliding scale → a CTA|`/book` reflects live state' docs/DESIGN.md
git diff --check
git status --short
```

Expected:

- No stale public hub link/nav label remains.
- No stale DESIGN statements remain.
- Diff check passes.
- Only intended implementation files plus pre-existing unrelated dirty files are present.

- [ ] **Step 5: Report completion**

Report changed behavior, automated gate results, manual route/a11y checks, review result, and any residual risk. Do not push unless the maintainer asks.

---

## Definition Of Done

- One visible public service hub exists at `/services`.
- `/book` permanently redirects to `/services`; `/book/[serviceSlug]` remains functional.
- `/services` dynamically renders all active services as faithful whole-card links, including Training when active.
- Service cards render 1→2 columns, show House Sitting as `Overnight`, and always include real or placeholder short-description copy.
- No circular sliding-scale CTA or duplicate adjacent home CTA remains.
- Services is the only service-related header/mobile/footer nav item and remains active on per-service booking routes.
- Project-specific documentation matches the new route model.
- Lint, typecheck, build, tests, cross-model review, and manual desktop/390px/light/dark/keyboard verification pass.

## Handoff Log

Append blocking or non-blocking implementation findings here per `docs/WORKFLOW.md`.

---

## Plan Self-Review

- **Spec coverage:** merged hub/card behavior/active service data/sliding-scale content → Task 2; compact nav/footer and per-service Services active state → Task 1; redirect/back links/home CTAs → Task 2; DESIGN route/flow updates → Task 3; automated/manual/a11y/dark/mobile gates → Task 4.
- **Scope:** one cohesive public-route/navigation recomposition; no booking core, schema, pricing, auth, or Scheduler change.
- **Type consistency:** `NavItem.activeSections?: string[]` is consumed only by `isActiveNavItem`; desktop and mobile use the same helper; zone nav continues using exact `isActiveNav`.
- **Placeholder scan:** no `TBD`, `TODO`, vague implementation step, or unspecified test remains. `[[ ]]` strings are intentional project copy placeholders.
