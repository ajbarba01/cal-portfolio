# Services + Booking Merge (Design)

> Status: approved direction, pending user review · 2026-06-07

## Why this exists

The current public marketing flow has two overlapping hub pages:

- `/services` explains active services, rates, metadata, and the sliding-cost-scale CTA.
- `/book` repeats the active service list as a service chooser.

That split makes the navigation heavier than the content needs. A visitor should first understand the services and prices, then open the right service's booking flow from the same page.

## Decision

Merge the two public hubs into one canonical page:

- Canonical route: `/services`
- Header and footer nav label: `Services`
- Page title: `Services & Booking`
- Compatibility fallback: `/book` redirects to `/services`
- Service booking flows remain at `/book/[serviceSlug]`

Users should never see a standalone `/book` hub page. They should see `/services`, then choose a service card to open the existing per-service booking flow.

## Visual Direction

The merged page must stay faithful to the current Services and Book pages. Do not introduce a new visual system or a more promotional layout.

Use the existing system exactly:

- `PageContainer width="app"` with current page padding.
- `PageHeader` rhythm and type treatment.
- Existing `Card`, `CardHeader`, `CardTitle`, and `CardContent` styling.
- Existing Book page whole-card link hover and focus behavior.
- Existing Services page rate and metadata treatment.
- Existing sliding-cost-scale section styling.
- Existing semantic tokens only:
  - page surface = `bg-background`
  - cards and chrome = `bg-card`
  - normal text = `text-foreground`
  - descriptions and subtitles = `text-muted-foreground`
  - rates/action cues = `text-brand-strong`
  - borders = `border-border`

The visual companion mockup validated this faithful composition: services stay card-based, the header keeps the compact `Services` label, and the fuller `Services & Booking` phrase appears only as the page title.

## Page Content

The page renders all active services dynamically from the existing active-service source. It must not hardcode service names, rates, order, durations, or pet capacity.

Each service card includes:

- service name
- headline rate
- database description, or a pricing-type-specific short-description `[[BODY: …]]` placeholder when absent
- default duration when present; House Sitting displays `Overnight`
- optional max-pets metadata
- a subtle `View availability →` action cue

The whole card links to `/book/[serviceSlug]`.

Cards render one per row on mobile and two per row from the small breakpoint upward.

The seeded service set includes House Sitting, Check-In, Walk, and Training. The design depends on active service data, so adding or deactivating a service in admin changes the page without code edits.

## Sliding Cost Scale

The sliding-cost-scale section remains on the merged page as informational content.

It must not include a `Book a service` button, because that would link back to the same page. The section should explain the pricing-flexibility message and how the client should raise that topic, using the existing copy-placeholder rules until Cal supplies final copy.

## Routing And Navigation

- Remove the separate `Book` item from the desktop and mobile marketing nav.
- Keep `Services` as the compact nav label.
- Update the footer and home-page service-booking CTAs that currently point to `/book` so they point to `/services`.
- Remove the home hero's adjacent `See services` button; after the merge it would duplicate the primary service-hub CTA.
- Keep per-service booking links on `/book/[serviceSlug]`.
- `/book` permanently redirects to `/services` as a compatibility fallback for stale links or manually typed URLs.
- Active navigation should treat `/services` as active on `/services`.
- Per-service booking routes highlight `Services` for continuity, since the user arrived from the services hub.

## Empty State

The merged page preserves the existing Services page behavior for active-service loading:

- If there are no active services, show the existing plain "Services coming soon" message.
- Preserve the existing service loader's behavior: an upstream loading failure produces the same empty result and message. Distinguishing load failure from no active services is outside this merge.

Do not add new backend behavior for this merge.

## Out Of Scope

- No changes to `/book/[serviceSlug]` booking interaction.
- No changes to Scheduler layers, pricing math, quote previews, auth gates, onboarding, payments, or service admin editing.
- No new inline availability preview on `/services`.
- No new service copy beyond existing `[[ ]]` placeholders.
- No new route name such as `/services-and-booking`.

## Acceptance Criteria

- The header nav has one service-related public item: `Services`.
- `/services` title reads `Services & Booking`.
- `/services` renders every active service, including Training when active.
- Service cards render one per row on mobile and two per row at wider breakpoints.
- House Sitting shows `Overnight`; other services show their configured default duration when present.
- Every card shows either its database description or the matching short-description copy placeholder.
- Each service card links to the correct `/book/[serviceSlug]` route.
- Service card rates and metadata come from existing service data and display helpers.
- The sliding-cost-scale section has no circular booking button.
- `/book` redirects to `/services`.
- No visible standalone `/book` hub remains.
- Existing per-service booking pages still work.
- Desktop, mobile at 390px, keyboard focus, light mode, and dark mode preserve the current design language.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- Manual visual walk:
  - `/services` desktop
  - `/services` at 390px mobile
  - `/book` redirect
  - one hourly service booking route
  - house-sitting booking route
  - light and dark mode contrast
  - keyboard focus across service cards and header/mobile drawer

## Docs To Update With Implementation

- `docs/DESIGN.md`: route map and booking-flow description should say `/services` is the public service/booking hub and `/book/[serviceSlug]` is the per-service flow.
- `docs/FRONTEND.md`: only update if implementation changes a reusable navigation or card pattern. If it only recomposes existing components, no frontend-system doc change is required.

---

_Last reviewed: 2026-06-07_
