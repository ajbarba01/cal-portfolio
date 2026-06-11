# SP5b — Admin awareness layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface "what needs Cal now" — wire the real `AttentionCounts` into the admin nav badges (AD5) and replace the bare stat-card dashboard with an actionable attention list + a read-only "Today" timeline.

**Architecture:** No schema. One server query computes the counts (`pendingApprovals`, `newInquiries`) reused by both the nav badges and the dashboard; `flaggedConflicts` stays 0 (AD1 re-routed to the recurring rework). The dashboard composes existing reads (`listBookingsInRange`, `listInquiries`, `listClients`, `listReviews`) into task rows + a read-only `<Scheduler.DayTimeline>` for today.

**Tech Stack:** Next.js App Router (RSC), TypeScript strict, `NavBadge` + `AttentionCounts` (SP3b primitives), `<Scheduler>`, lucide-react, Tailwind semantic tokens.

**Spec:** [`2026-06-11-sp5-admin-design.md`](../specs/2026-06-11-sp5-admin-design.md). **Visual contract:** `dashboard-v2.html` (current); `sp5b-attention.html` (nav badges; its conflict panel is superseded by the AD1 re-route — do not build it).

**Prereq:** SP5a merged (the bookings hub the badges/dashboard link into exists). Standing rules per SP5a (tokens, lucide, AA, mobile parity, subject-only commits, typecheck+lint gate per task).

---

## File map

- **Counts:** new `src/features/admin/attention-counts-query.ts` (+ test) — computes `AttentionCounts` from the DB; consumes the existing `attention-counts.ts` type.
- **Nav badges:** the admin nav component (confirm path: `src/components/layout/` `AppShell`/sidebar + `SiteHeader`) — mount `NavBadge` on the relevant items.
- **Dashboard:** `src/app/(admin)/admin/page.tsx` (rewrite) + new `src/app/(admin)/admin/_components/attention-list.tsx` + `today-timeline.tsx`.

> Confirm exact nav file at execution time (`Grep "NavBadge"` / `"AttentionCounts"`).

---

## Task 1: Attention counts query

**Files:**

- Create: `src/features/admin/attention-counts-query.ts`, `src/features/admin/attention-counts-query.test.ts`

- [ ] **Step 1: Failing test** — a pure reducer `computeAttentionCounts({ bookings, inquiries })` → `{ pendingApprovals, newInquiries, flaggedConflicts: 0 }`. Assert it counts `status === "pending_approval"` bookings and `status === "new"` inquiries, and always returns `flaggedConflicts: 0`.

```ts
import { describe, expect, it } from "vitest";
import { computeAttentionCounts } from "./attention-counts-query";

describe("computeAttentionCounts", () => {
  it("counts pending approvals and new inquiries; conflicts always 0", () => {
    const counts = computeAttentionCounts({
      bookings: [
        { status: "pending_approval" },
        { status: "confirmed" },
        { status: "pending_approval" },
      ],
      inquiries: [{ status: "new" }, { status: "resolved" }],
    });
    expect(counts).toEqual({
      pendingApprovals: 2,
      newInquiries: 1,
      flaggedConflicts: 0,
    });
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3:** Implement the pure `computeAttentionCounts` (typed to the minimal row shapes) returning `AttentionCounts`; add a thin `getAttentionCounts()` server function that fetches via the existing admin reads (current-window bookings + inquiries) and calls the reducer. Keep the fetch separate from the pure reducer (the reducer is what's unit-tested).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**

```bash
git add src/features/admin/attention-counts-query.ts src/features/admin/attention-counts-query.test.ts
git commit -m "feat: compute admin attention counts"
```

---

## Task 2: Nav badges (AD5)

**Files:**

- Modify: the admin nav (sidebar + merged mobile drawer) to mount `NavBadge` with counts from `getAttentionCounts()`.

**Visual contract:** `sp5b-attention.html` (badges only).

- [ ] **Step 1:** Thread `AttentionCounts` to the admin nav (server-fetched in the admin layout/shell, passed down). Mount `NavBadge` on **Bookings** (`pendingApprovals`) and **Inquiries** (`newInquiries`); render nothing when the count is 0. Do **not** add a conflicts badge (`flaggedConflicts` is 0; AD1 re-routed).
- [ ] **Step 2: A11y** — each badge's host link carries an `aria-label` including the count and meaning (e.g. `aria-label="Bookings, 2 awaiting approval"`); the numeric badge is `aria-hidden` with `sr-only` text, per the Material/PatternFly/W3C guidance. Gold fill token (the SP3b `--attention` token); restraint (only these two).
- [ ] **Step 3:** Manual check on the seeded `admin-demo`: badges show 2 / 3 (or seeded counts), disappear at 0, drawer shows them on mobile.
- [ ] **Step 4: Typecheck + lint, commit.**

```bash
git add src/components/layout
git commit -m "feat: wire admin nav attention badges"
```

---

## Task 3: Dashboard redesign — attention list + today timeline

**Files:**

- Create: `src/app/(admin)/admin/_components/attention-list.tsx`, `src/app/(admin)/admin/_components/today-timeline.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`

**Visual contract:** `dashboard-v2.html`.

- [ ] **Step 1:** Build `attention-list.tsx` — given the day's data (pending approvals, new inquiries, clients owing, reviews to moderate), render task rows (lucide icon + "N {thing}" + one-line context + an action link to the filtered hub view, e.g. `/admin/bookings?status=pending_approval`). When all four are zero, render a calm "All caught up ✓" state (token success colour). Owing uses the danger-warm token; everything else stays calm (red reserved per the badge research).
- [ ] **Step 2:** Build `today-timeline.tsx` — a read-only `<Scheduler.DayTimeline>` (inspect preset, no paint) for today's bookings; each block links to the booking on the Bookings page. Reuse the inspect capabilities preset from SP5a Task 8.
- [ ] **Step 3:** Rewrite `admin/page.tsx` to render `<AttentionList>` then `<TodayTimeline>` (drop the 5 stat cards). Keep the existing `Promise.all` data fetch; compute the owing/reviews/pending/new-inquiry figures from it.
- [ ] **Step 4:** Manual `verify` (desktop + mobile + breakpoint): attention rows link to the right filtered views; today's timeline shows seeded bookings and click-throughs land on the booking; empty state shows when nothing pends.
- [ ] **Step 5: Typecheck + lint, commit.**

```bash
git add "src/app/(admin)/admin/_components/attention-list.tsx" "src/app/(admin)/admin/_components/today-timeline.tsx" "src/app/(admin)/admin/page.tsx"
git commit -m "feat: attention-focused admin dashboard"
```

---

## Final gates + close-out

- [ ] `npm run typecheck` · `npm run lint` (0 errors) · `npx vitest run` (new reducer test green) · `next build`.
- [ ] Manual `verify` of nav badges (desktop sidebar + mobile drawer) + dashboard.
- [ ] Fresh-session `/code-review`; address findings.
- [ ] Prune **AD5** from the findings register. Confirm **AD1** is recorded as re-routed (planning commit) and **AD7** pruned (already shipped).
- [ ] Update HANDOFF Progress (SP5 DONE) + Session log.

## Handoff log

(append blockers/deviations during execution)
