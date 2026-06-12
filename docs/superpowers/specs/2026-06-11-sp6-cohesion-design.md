# SP6 — Cohesion + feedback + responsiveness sweep — design

> Sitewide polish pass: every surface cohesive, every action visibly acknowledged, mobile as intentional as desktop, as far from generic "vibe-coded" aesthetics as the Trail system allows. Companion artifacts: [findings register §SP6](2026-06-10-audit-findings.md) (U1–U31), signed-off mockups in [`mockups/sp6/`](../mockups/sp6/NOTES.md). Schema-free.

## Sequencing decision (maintainer, 2026-06-11)

The roadmap slotted booking-mutation P2–P4 + the cancellation/debt system before SP6; they were never built (program went SP4→SP5). **Decision: SP6 runs now.** P2–P4/debt surfaces inherit SP6 conventions at build time — their specs must carry an "SP6 conventions" checklist (form recipe, button hierarchy, feedback rules, width system) — and get a small-delta re-sweep, not a second full pass. U6 renders from existing settings now; AD4 stays with the debt spec.

## Maintainer decisions (grilling, 2026-06-11)

| Topic              | Decision                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking options UI | Dedicated page stays (no popup). **Stacked single column, all viewports** — step cards, summary card inline after the steps; **no sticky side receipt**. Calendar keeps its current visual ("looks nice") — only behavior/affordance additions (U2 grey lead-time, premium-day dot + legend).                                                                    |
| Loading            | Zone `loading.tsx` skeletons (marketing/account/admin) + targeted `Suspense` on data-heavy widgets. **Constraint (Next.js docs):** a layout doing cookie/auth work blocks the fallback — `SiteHeader`'s auth cluster must move behind its own `Suspense` (header shell renders static) or skeletons never paint. SP7 owns making marketing actually static (P1). |
| Contact page       | Single centered card. **No public email/phone — the form is the contact channel**; footer mail icon links to `/contact`, never `mailto:`. Fields stacked single-column (Baymard). U13 closed by decision: route already exists, this is its design.                                                                                                              |
| Plan split         | **Plan A** (system: conventions + primitives + shared fixes) / **Plan B** (per-surface sweep + U11 walkthrough). B consumes A.                                                                                                                                                                                                                                   |
| Forms gate         | "Required forms don't block booking" confirmed real (gate checks `profiles.onboarding_status` only) → **SP6 Plan A bug bucket**: define "required forms complete" from existing tables, gate in `computeBookingArtifacts`, surface as unavailability-style messaging with a link, not an error.                                                                  |
| Kiche discount     | Per-booking Kiche = data-model + pricing change → **routed to the feature lane** (booking-mutation roadmap). Out of SP6.                                                                                                                                                                                                                                         |
| Reviews            | **Auto-publish + admin unpublish** (reactive moderation; admin reviews surface stays). Submit feedback copy updated to match.                                                                                                                                                                                                                                    |
| Attention badge    | Gold rejected. **Re-token `--attention` to slate `#3c5566`** (blue-deep family; white text ≈7.9:1; no collision with clay active rows or danger red).                                                                                                                                                                                                            |

## Audit findings (Fable 5 pass, 2026-06-11)

Live screenshots (headless Chrome, 1440px + 390px, all public pages) + static audit. New findings U14–U31 appended to the [register](2026-06-10-audit-findings.md); highlights:

- **U14 (M, systemic)** — mobile horizontal overflow at 390px on **at least five surfaces**: /book/[service] (stepper + sign-in card), /services (cards clip "View availability"), /reviews (cards + stars clip), /contact (inputs run off-edge), home (CTA heading). One shared layout root cause suspected (sheet/container width math) — Plan A investigates once, fixes once, then every page is re-verified in the U11 walk. (Headless-capture caveat: confirm on real device emulation first.)
- **U15 (M)** — primary-action buttons inconsistent: login/signup/contact submit near-black `primary`, booking CTAs brand clay.
- **U16 (m)** — footer content has no max-width container; header is boxed at `max-w-6xl` — misaligned edges. Footer links also missing U12 icons.
- **U17 (m)** — Select popup `min-w-[8rem]` only; doesn't match trigger width ([select.tsx](../../../src/components/ui/select.tsx)). Fix: `min-w-(--anchor-width)` (Base UI).
- **U18 (m)** — home trust points: three unanchored text blocks; tight title→body spacing vs large column gaps.
- **U20 (m)** — header: 88px tall, bare text tabs, mobile burger sits ~12px in from the content edge (44px hit-target padding).
- **U21 (m)** — review stars are unicode ★ glyphs → lucide `Star` (lucide-over-emoji rule).
- **U22 (m, live-verify)** — home mobile CTA heading appears to clip at the right edge at 390px.
- **U23 (m)** — near-empty sheets (login/contact/reviews) render a full-height empty page below sparse content; vertical-rhythm/min-height strategy needed.

Pages audited with no dedicated finding (Plan B light-touch only): **about** (sound structure; long text wall — apply measure + eyebrow rhythm), **gallery** (solid; lightbox perf is SP7/P5), **resources** (dense but coherent; mobile fits), **signup** (inherits the login form-on-card recipe + U15 brand button). Account/admin zones: not screenshot-auditable (auth) — SP5 just shipped them against approved mockups; the U11 `busy-week` walk covers them at execution.

## Design contracts (signed-off mockups — the visual law for execution)

1. **[contact-preview.html](../mockups/sp6/previews/contact-preview.html)** — centered white card on the sand sheet; intro line + "reply within a day" note; stacked fields; textarea matches the input primitive; brand submit; inline success state with next-step links (never a dead end). Establishes the **form-on-card recipe**: `bg-card` + border + radius-2xl; inputs `bg-background` fill + `border-input` + clay focus ring. Login/signup adopt the same recipe.
2. **[booking-flow-preview.html](../mockups/sp6/previews/booking-flow-preview.html)** — `<BookingFlow>` contract (public + admin create/edit): step cards in one stacked column (max-w ~560px), summary card inline above the CTA with live quote + U6 policy line rendered from settings; U2 lead-time days grey with one quiet "contact Cal" note; premium-day dot + legend; U1 terminal success panel ("View my bookings" / "Book another"; pending-approval copy variant); mobile overflow fixed (stepper clamped).
3. **[home-chrome-preview.html](../mockups/sp6/previews/home-chrome-preview.html)** — trust points as cards: lucide icon in clay-soft disc + title row, long-form real copy left-aligned, clay inline links; header trimmed to ~60px with tab hover surface + tucked active underline; burger optically flush right (negative margin, 44px target kept); footer inner container aligned to header width, socials row (Instagram/TikTok hidden until Cal supplies URLs) + mail icon → `/contact`.
4. **[system-preview.html](../mockups/sp6/previews/system-preview.html)** — the Plan A conventions: `--attention` → slate; select `--anchor-width`; **button hierarchy** (brand = THE action of a surface, one per view; outline = secondary; ghost = tertiary/inline; destructive behind `useConfirm`; near-black `primary` retires from forms, stays for neutral chrome); zone skeleton + widget-Suspense loading; toast type tagging (U7) at every call site; confirm-dialog pattern for consequential silent actions (e.g. mark-balance-settled).

## Conventions (Plan A outputs, documented in FRONTEND.md at execution)

- **Width system:** `read` 65ch (prose) · `narrow` ~36rem (forms/booking flow, new `PageContainer` variant) · `app` max-w-6xl (tables/hubs) · header **and footer** inner containers at max-w-6xl. Marketing bands full-bleed bg + inner container. 50–75 CPL for body text (WCAG <80).
- **Feedback rule:** every user action produces visible feedback — hover/active states, toast (typed), inline state swap, or redirect. Nothing silent. Confirm dialogs on destructive/consequential actions, named object in the title (NN/g), never on routine ones.
- **Icons:** lucide everywhere; no emoji/unicode glyphs (review stars, any decorative emoji). Admin sidebar tabs get lucide icons (SP5 carry-over).
- **Mobile parity:** compressing desktop→mobile reorganizes as little as possible and stays neat; filter rows stack centered, full-width controls; breakpoint transitions checked at 768/1024 in the U11 walk.

## DEV_NOTES "Now" triage (all items dispositioned)

| Item                                                | Disposition                                       |
| --------------------------------------------------- | ------------------------------------------------- |
| Reviews auto-publish                                | SP6 (decision above)                              |
| Kiche per-booking                                   | Feature lane (register note)                      |
| Overnight weird in bookings calendar                | SP6 Plan B live-verify (U27)                      |
| Remove holiday-days from details + reword           | SP6 Plan B — premium-day wording sweep (U28)      |
| Reschedule-overnight zod error (`nights` undefined) | SP6 Plan A BookingFlow bug bucket (U24)           |
| Onboarding info takes two tries                     | SP6 Plan A investigation (U25, root cause first)  |
| Long client names break clients list                | U5 instance, Plan B                               |
| Remove no-show                                      | Already done (SP5a UI strip; backend → debt spec) |
| Required forms don't block booking                  | SP6 Plan A (decision above, U26)                  |
| Inquiry date-click doesn't open                     | SP6 Plan B (U29)                                  |
| Burger not flush right                              | SP6 (U20)                                         |
| Badge color                                         | SP6 (slate re-token, U31)                         |
| Sidebar lucide icons                                | SP6 Plan B (U30)                                  |

## Verification

- Seed extension: scenario client with **incomplete required forms** (forms-gate states); premium days already seeded.
- U11 entry activity (Plan B): full walk on `busy-week` at 390/768/1024/1440 incl. breakpoint transitions, desktop + mobile, public + account + admin.
- **Live-walkthrough tooling (recommendation, maintainer-requested):** headless-Chrome screenshot matrix (used for this audit; zero install) for coverage sweeps, + **Playwright MCP** (or `@playwright/test` devDep) in execution sessions for interactive walks (auth'd account/admin flows, breakpoint resize, focus/keyboard checks). Mailpit for email states.

## Industry sources

- Next.js `loading.js` file convention — instant loading states, layout-blocking caveat: nextjs.org/docs/app/api-reference/file-conventions/loading
- Base UI Select `--anchor-width` popup sizing: base-ui.com/react/components/select
- NN/g, "Confirmation Dialogs Can Prevent User Errors (If Not Overused)": nngroup.com/articles/confirmation-dialog/
- Baymard line-length research (50–75 CPL; WCAG <80) + single-column form findings: baymard.com/blog/line-length-readability

## Out of scope

Copy placeholders (`[[…]]`) — copy-sync with Cal owns them. Social URLs + logo — Cal. P1/P2/P4/P5 perf root causes — SP7. Kiche per-booking, cancel-reason (AD4), no-show backend rip-out — feature lane / debt spec. Schema changes — none.

---

_Last reviewed: 2026-06-11_
