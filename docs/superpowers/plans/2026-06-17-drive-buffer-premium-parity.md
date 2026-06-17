# Drive-time blocking, premium parity, and range-click fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface premium days on hourly calendars, reserve calendar space for Cal's driving time around every time-based booking, and fix the unreliable second click in the house-sitting range picker.

**Architecture:** A pure `driveBufferMinutes` helper turns origin↔client distance into a blocking buffer. The service-role busy-range query pre-widens each booking's range by its own buffer (identity-free preserved). The booking page passes the viewer's own buffer into the scheduler; the existing slot derivers (`startOptions`, `hourlyAvailableDayKeys`) gain a `bufferMin` param so a candidate's full `[start−buf, end+buf]` span must fit a window and not overlap any (already-widened) busy range. A submit-time guard re-checks this server-side. The range-click fix stabilizes the day-button identity so hover-preview re-renders stop remounting the grid.

**Tech Stack:** Next.js (App Router) + TypeScript strict · Supabase (service-role busy source) · Vitest · Tailwind/shadcn. Spec: [docs/superpowers/specs/2026-06-17-drive-buffer-premium-parity-design.md](../specs/2026-06-17-drive-buffer-premium-parity-design.md).

## Global Constraints

- **TypeScript `strict`, no `any`.** Validate at the DB edge with Zod (ENGINEERING #11).
- **Core logic is pure and unit-tested.** No clock reads inside pure fns — `now`/origin/settings are passed in (ENGINEERING #5).
- **Identity-free public busy source is law.** `PublicBusyRange` / `BusyRange` must never gain a coordinate or owner field. Buffers are computed server-side and collapse to widened start/end only.
- **Design tokens only** in UI (no hardcoded colors). New markers reuse existing token classes.
- **Commits: subject line only**, Conventional Commits, no body, no trailers, no internal identifiers.
- **Edit source files with the Edit/Write tools only** (PowerShell mangles UTF-8). Run commands via the Bash tool.
- **Buffer math uses minutes throughout; multiply by 60000 only when widening Date-based ranges.** The percentage (`drive_buffer_pct`, default 120) applies ONLY to the blocking buffer, never to price.
- **House-sitting (`concurrency === "resident"`) is excluded from buffers** — unchanged behavior.
- Run all tests with: `npm run test -- run <file>` (vitest). Typecheck: `npm run typecheck`.

---

## PHASE 1 — Premium visual parity (independent PR, no schema change)

### Task 1: Thread `premiumDays` into the hourly SchedulerData

**Files:**

- Modify: `src/features/booking/hourly-scheduler-data.ts`
- Test: `src/features/booking/hourly-scheduler-data.test.ts`

**Interfaces:**

- Consumes: `SchedulerData` (already has optional `premiumDays?: Set<string>` — see [scheduler-context.tsx:48](../../../src/features/booking/scheduler-context.tsx)).
- Produces: `hourlySchedulerData(input)` now accepts `premiumDays: Set<string>` and returns it on the data object.

- [ ] **Step 1: Write the failing test** — add to `hourly-scheduler-data.test.ts`:

```ts
it("passes premiumDays through to the scheduler data", () => {
  const premiumDays = new Set(["2026-07-04"]);
  const data = hourlySchedulerData({
    now: new Date("2026-07-01T12:00:00Z"),
    openWindows: [],
    busy: [],
    durationMin: 60,
    rules: {
      bookingOpenMinute: 540,
      bookingCloseMinute: 1020,
      minLeadTimeHours: 2,
      hardMaxAdvanceDays: 60,
    },
    myBookings: new Set(),
    premiumDays,
  });
  expect(data.premiumDays).toBe(premiumDays);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test -- run src/features/booking/hourly-scheduler-data.test.ts`
Expected: FAIL — `premiumDays` not assignable to input / `data.premiumDays` undefined.

- [ ] **Step 3: Add the param + output.** In `hourly-scheduler-data.ts`:
  - Add to `HourlySchedulerDataInput`: `premiumDays: Set<string>;`
  - Destructure `premiumDays` in the function args.
  - Add `premiumDays,` to the returned object (after `now,`).

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test -- run src/features/booking/hourly-scheduler-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the caller.** In `src/features/booking/use-booking-scheduler.ts`, the `schedulerData` memo's `week-slots` branch calls `hourlySchedulerData({...})`. Add `premiumDays,` to that call (the hook already destructures `premiumDays` from `usePremiumDays` at line ~327). Add `premiumDays` to the memo dependency array.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add src/features/booking/hourly-scheduler-data.ts src/features/booking/hourly-scheduler-data.test.ts src/features/booking/use-booking-scheduler.ts
git commit -m "feat(booking): carry premium days into hourly scheduler data"
```

---

### Task 2: Render the premium star in the week grid

**Files:**

- Modify: `src/features/booking/_components/scheduler/grid-cell.tsx` (the per-cell button) and/or `week-grid.tsx`
- Test: manual (component render); see verification step.

**Interfaces:**

- Consumes: `data.premiumDays` from `useScheduler()`; the `Star` icon from `lucide-react`; the existing month-grid star markup (mirror it).

- [ ] **Step 1: Read `grid-cell.tsx`** to find where the cell button renders its children, and confirm whether `GridCellInfo` carries `dayKey` (it does — `cell.dayKey`). Decide insertion point: the star overlays the cell when `data.premiumDays?.has(cell.dayKey)`.

- [ ] **Step 2: Add the star.** Mirror the month-grid markup exactly ([month-grid.tsx:254-260](../../../src/features/booking/_components/scheduler/month-grid.tsx)). In `grid-cell.tsx`, import `Star` from `lucide-react` and `useScheduler`, then inside the cell button (positioned `relative`), render:

```tsx
{
  isPremium && (
    <Star
      aria-hidden="true"
      size={10}
      className="text-warning-foreground pointer-events-none absolute top-0.5 right-0.5 fill-current"
    />
  );
}
```

where `const isPremium = useScheduler().data.premiumDays?.has(cell.dayKey) ?? false;`. If `GridCell` is `React.memo`'d on props only, read `premiumDays` via `useScheduler()` inside the cell so the memo still holds (context reads bypass the props comparison). Ensure the button has `relative` positioning (week cells already fill a grid track; add `relative` to the button className if absent).

- [ ] **Step 3: Verify visually.** Run the app and open a walk/check-in booking calendar with a configured premium date. Confirm a star appears on that day's column header cells / slots. (Use the `run` skill or `npm run dev`.)

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/booking/_components/scheduler/grid-cell.tsx
git commit -m "feat(booking): show premium star on week grid cells"
```

---

### Task 3: Render the premium star in the day timeline

**Files:**

- Modify: `src/features/booking/_components/scheduler/day-timeline.tsx`

**Interfaces:**

- Consumes: `data.premiumDays`, the `dayKey` already derived in `DayTimeline`.

- [ ] **Step 1: Add a premium flag.** In `DayTimeline`, after `dayKey` is derived, add:

```tsx
const isPremiumDay = data.premiumDays?.has(dayKey ?? "") ?? false;
```

- [ ] **Step 2: Show it in the header.** In `DayHeader` (or inline next to `formatDayHeader(dayKey)`), when `isPremiumDay`, render a small star + "Premium day" label using token classes:

```tsx
{
  isPremiumDay && (
    <span className="text-warning-foreground inline-flex items-center gap-1 text-xs font-medium">
      <Star aria-hidden="true" size={12} className="fill-current" />
      Premium day
    </span>
  );
}
```

Pass `isPremiumDay` into `DayHeader` as a prop (it currently takes `dayKey`, `intervalMinutes`). Import `Star` from `lucide-react`.

- [ ] **Step 3: Verify visually** that selecting a premium day shows the marker in the timeline header.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/booking/_components/scheduler/day-timeline.tsx
git commit -m "feat(booking): show premium marker in day timeline header"
```

---

### Task 4: Verify `holiday_surcharge_cents` is configured in prod

**Files:** none (operational check).

- [ ] **Step 1: Read the prod value.** Per the deploy-topology note, curl the prod settings (service-role) or query via the Supabase dashboard for project `mvrbmrzrifamkbnjfrvd`:

```bash
# Example shape — confirm the exact endpoint/key from docs/DEV_NOTES.md deploy topology.
# Goal: read settings.holiday_surcharge_cents from prod.
```

- [ ] **Step 2: If `0`,** tell Cal: set a non-zero "Premium day surcharge" in **/admin/settings** (the field already exists). The hourly premium line only renders when `holiday_surcharge_cents > 0`. This is a config action, not code.
- [ ] **Step 3: Record the confirmed value** in the PR description so item 1 is provably complete.

---

## PHASE 2 — Settings, buffer math, server-side widening

### Task 5: Add `drive_buffer_pct` setting (migration + schemas + editor)

**Files:**

- Create: a new SQL migration (follow the existing `supabase/migrations/` naming — `<timestamp>_add_drive_buffer_pct.sql`)
- Modify: `src/features/admin/settings-actions.ts` (`settingsRowSchema` + select string), `src/features/admin/settings-schema.ts` (`settingsUpdateSchema`), the settings editor component (find it under `src/app/.../admin/settings` or `src/features/admin`).

**Interfaces:**

- Produces: `settings.drive_buffer_pct: number` (integer, default 120), surfaced in `SettingsRow` and editable via `settingsUpdateSchema`.

- [ ] **Step 1: Confirm the migrations dir + an example file** for exact format:
      Run: `ls supabase/migrations | tail -5` and read the most recent one.

- [ ] **Step 2: Write the migration.** New file in `supabase/migrations/`:

```sql
alter table public.settings
  add column if not exists drive_buffer_pct integer not null default 120;
comment on column public.settings.drive_buffer_pct is
  'Percent of estimated one-way drive time reserved as blocking buffer around each time-based booking (e.g. 120 = 1.2x). Scheduling only; never affects price.';
```

- [ ] **Step 3: Add to `settingsRowSchema`** in `settings-actions.ts`: `drive_buffer_pct: z.number(),` and add `"drive_buffer_pct"` to the `.select(...)` column string.

- [ ] **Step 4: Add to `settingsUpdateSchema`** in `settings-schema.ts`:

```ts
drive_buffer_pct: z.number().int().nonnegative().max(1000).optional(),
```

(Allow >100 — a buffer can be 120% or more; cap at 1000 as a sanity bound.)

- [ ] **Step 5: Add the editor field.** In the settings editor component, add a numeric input bound to `drive_buffer_pct` with a label like "Drive-time buffer (%)" and helper text "Calendar space reserved for driving around each booking. 120 = 1.2× the estimate." Mirror an adjacent numeric field's markup.

- [ ] **Step 6: Apply the migration to prod** per the deploy-topology note, then typecheck.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/features/admin/settings-actions.ts src/features/admin/settings-schema.ts <editor-file>
git commit -m "feat(admin): add drive-time buffer percentage setting"
```

---

### Task 6: Pure `driveBufferMinutes` helper

**Files:**

- Create: `src/features/booking/drive-buffer.ts`
- Test: `src/features/booking/drive-buffer.test.ts`

**Interfaces:**

- Consumes: `haversineMiles` from `@/lib/haversine`; `estimateDrivingMinutes` + `LatLng` from `@/features/pricing`.
- Produces:

  ```ts
  export interface DriveBufferConfig {
    roadFactor: number;
    avgSpeedMph: number;
    pct: number;
  }
  export function driveBufferMinutes(
    origin: LatLng,
    client: { lat: number | null; lng: number | null },
    cfg: DriveBufferConfig,
  ): number; // whole minutes; 0 when client coords missing
  ```

- [ ] **Step 1: Write the failing test** (`drive-buffer.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { driveBufferMinutes } from "./drive-buffer";

const cfg = { roadFactor: 1.3, avgSpeedMph: 30, pct: 120 };
const origin = { lat: 40.0, lng: -105.0 };

describe("driveBufferMinutes", () => {
  it("returns 0 when client coords are missing", () => {
    expect(driveBufferMinutes(origin, { lat: null, lng: null }, cfg)).toBe(0);
  });

  it("scales one-way drive minutes by the buffer percentage", () => {
    // Same point → 0 miles → 0 minutes → 0 buffer.
    expect(driveBufferMinutes(origin, { lat: 40.0, lng: -105.0 }, cfg)).toBe(0);
  });

  it("is positive and rounded to whole minutes for a distant client", () => {
    const buf = driveBufferMinutes(origin, { lat: 40.2, lng: -105.0 }, cfg);
    expect(buf).toBeGreaterThan(0);
    expect(Number.isInteger(buf)).toBe(true);
  });

  it("a higher percentage yields a larger buffer", () => {
    const a = driveBufferMinutes(
      origin,
      { lat: 40.2, lng: -105.0 },
      { ...cfg, pct: 100 },
    );
    const b = driveBufferMinutes(
      origin,
      { lat: 40.2, lng: -105.0 },
      { ...cfg, pct: 200 },
    );
    expect(b).toBeGreaterThan(a);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test -- run src/features/booking/drive-buffer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`drive-buffer.ts`):

```ts
/**
 * Blocking-buffer math for drive-time-aware scheduling.
 *
 * Model A (home-based round trips): every time-based booking reserves the
 * one-way drive time from Cal's origin to the client, scaled by a buffer
 * percentage, applied symmetrically before AND after the service window.
 * Pure — no IO, no clock reads (ENGINEERING #5). Coords are ZIP-centroid;
 * the percentage absorbs the coarseness.
 */
import { haversineMiles } from "@/lib/haversine";
import { estimateDrivingMinutes } from "@/features/pricing";
import type { LatLng } from "@/features/pricing";

export interface DriveBufferConfig {
  roadFactor: number;
  avgSpeedMph: number;
  /** Percent of one-way drive time to reserve (e.g. 120 = 1.2x). */
  pct: number;
}

/**
 * One-way blocking buffer in WHOLE minutes. Returns 0 when the client has no
 * coordinates (degrade gracefully — the booking routes to manual approval).
 */
export function driveBufferMinutes(
  origin: LatLng,
  client: { lat: number | null; lng: number | null },
  cfg: DriveBufferConfig,
): number {
  if (client.lat === null || client.lng === null) return 0;
  const miles = haversineMiles(origin, { lat: client.lat, lng: client.lng });
  const oneWayMin = estimateDrivingMinutes(miles, {
    roadFactor: cfg.roadFactor,
    avgSpeedMph: cfg.avgSpeedMph,
  });
  return Math.round((oneWayMin * cfg.pct) / 100);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test -- run src/features/booking/drive-buffer.test.ts`
Expected: PASS.

- [ ] **Step 5: Export** from the booking barrel if one re-exports domain helpers (check `index.ts`); otherwise leave module-scoped. Typecheck.

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/features/booking/drive-buffer.ts src/features/booking/drive-buffer.test.ts
git commit -m "feat(booking): add drive-time blocking-buffer helper"
```

---

### Task 7: Widen server busy ranges by each booking's buffer

**Files:**

- Modify: `src/features/booking/booking-repository.ts` (`getActiveBusyRanges` query + `publicBusyRowSchema`), `src/features/booking/busy-ranges.ts` (`getPublicBusyRangesCore` / `getPublicBusyRanges` to apply the buffer).
- Test: `src/features/booking/busy-ranges` core test (DI-testable — see existing pattern) — create `src/features/booking/busy-ranges.test.ts` if absent, else extend.

**Interfaces:**

- Consumes: `driveBufferMinutes` (Task 6); `settings` origin + road/speed + `drive_buffer_pct` (Task 5).
- The repo `BusyRange` gains internal fields for widening; `PublicBusyRange` shape is UNCHANGED.

- [ ] **Step 1: Confirm the join columns.** The `bookings` row carries `client_id` and `concurrency` ("exclusive" | "resident"). Confirm the FK from `bookings.client_id` to `profiles` and that `profiles` has `lat`,`lng`:
      Run: `npm run test -- run src/features/booking/booking-repository` (or inspect the schema) and grep the repo for `profiles(`.

- [ ] **Step 2: Extend the busy query.** In `getActiveBusyRanges`, change the `.select(...)` to also pull `concurrency` and the owner coords:

```ts
.select(
  "starts_at, ends_at, concurrency, " +
  "profiles!bookings_client_id_fkey(lat, lng), " +
  "booking_pets(pets(species, photo_url))"
)
```

(Confirm the exact FK constraint name for the `profiles!...` hint via the schema; if unsure, use `profiles(lat, lng)` and verify the join resolves the booking's owner, not a nested relation.) Extend `publicBusyRowSchema` to parse `concurrency: z.enum(["exclusive","resident"])` and `profiles: z.object({ lat: z.number().nullable(), lng: z.number().nullable() }).nullable()`. Map these onto the returned `BusyRange` as `concurrency` and `clientLat`/`clientLng` (repo-internal only — NOT part of `PublicBusyRange`).

- [ ] **Step 3: Widen in the core.** In `getPublicBusyRangesCore`, accept the origin + buffer cfg, and for each range widen ONLY when `concurrency !== "resident"`:

```ts
const bufMin = range.concurrency === "resident"
  ? 0
  : driveBufferMinutes(origin, { lat: range.clientLat, lng: range.clientLng }, cfg);
const bufMs = bufMin * 60_000;
return {
  startsAt: new Date(range.startsAt.getTime() - bufMs).toISOString(),
  endsAt: new Date(range.endsAt.getTime() + bufMs).toISOString(),
  pets: [...],
};
```

The output `PublicBusyRange` still has only `startsAt`/`endsAt`/`pets`. Load origin + cfg from `repo.getSettings()` inside the `getPublicBusyRanges` wrapper and pass them into the core.

- [ ] **Step 4: Test the widening (DI core).** Add a test that feeds two fake ranges (one resident, one exclusive with distant coords) through `getPublicBusyRangesCore` with a stub repo + signer, and asserts the exclusive range is widened on both sides while the resident range is unchanged. Assert the output objects expose no `lat`/`lng`/`concurrency` keys (`expect(Object.keys(out[0])).toEqual(["startsAt","endsAt","pets"])`).

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- run src/features/booking/busy-ranges.test.ts && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/booking/booking-repository.ts src/features/booking/busy-ranges.ts src/features/booking/busy-ranges.test.ts
git commit -m "feat(booking): widen public busy ranges by drive-time buffer"
```

---

### Task 8: Compute the viewer's own buffer on the booking page

**Files:**

- Modify: the booking page server component that seeds the scheduler wrapper (find via `grep -r "initialBusy" src/app`), and the wrapper that calls `useBookingScheduler`.

**Interfaces:**

- Produces: a `viewerDriveBufferMin: number` passed from the server page → the booking scheduler wrapper.

- [ ] **Step 1: Locate the seam.** Run `grep -rn "getPublicBusyRanges\|initialBusy\|useBookingScheduler" src/app src/features/booking/_components` to find the server page + the client wrapper.

- [ ] **Step 2: Compute server-side.** In the server page, load `settings` (origin + road/speed + `drive_buffer_pct`) and the viewer's profile lat/lng (a repo method `getProfileLatLng` exists), then:

```ts
const viewerDriveBufferMin = driveBufferMinutes(
  { lat: settings.origin_lat, lng: settings.origin_lng },
  viewerLatLng,
  {
    roadFactor: settings.road_factor,
    avgSpeedMph: settings.avg_speed_mph,
    pct: settings.drive_buffer_pct,
  },
);
```

Pass `viewerDriveBufferMin` as a prop down to the booking scheduler wrapper. For the house-sitting page, pass 0 (or omit — see Task 9 default).

- [ ] **Step 3: Typecheck + commit** (wiring only; behavior lands in Task 9).

Run: `npm run typecheck`

```bash
git add src/app <wrapper-file>
git commit -m "feat(booking): pass viewer drive buffer into scheduler"
```

---

## PHASE 3 — Buffered slot rule + submit guard

### Task 9: `bufferMin` in `startOptions` (window fit)

**Files:**

- Modify: `src/features/booking/day-timeline-model.ts`
- Test: `src/features/booking/day-timeline-model.test.ts`

**Interfaces:**

- Produces: `startOptions({ windows, durationMin, granularityMin, bufferMin? })` — `bufferMin` defaults to 0 (back-compat). A start is valid only if `[start − bufferMin, start + durationMin + bufferMin]` fits the window.

- [ ] **Step 1: Write the failing test** (add to `day-timeline-model.test.ts`):

```ts
it("buffer shrinks the window on both ends", () => {
  // Window 9:00–11:00 (540–660), 60-min duration, 15-min granularity.
  // No buffer: starts 540,555,570,585,600.
  expect(
    startOptions({
      windows: [[540, 660]],
      durationMin: 60,
      granularityMin: 15,
    }),
  ).toEqual([540, 555, 570, 585, 600]);
  // 30-min buffer: earliest start 570 (540+30), latest end ≤ 660−30=630 → last start 570.
  expect(
    startOptions({
      windows: [[540, 660]],
      durationMin: 60,
      granularityMin: 15,
      bufferMin: 30,
    }),
  ).toEqual([570]);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test -- run src/features/booking/day-timeline-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Replace `startOptions` body:

```ts
export function startOptions(args: {
  windows: MinuteWindow[];
  durationMin: number;
  granularityMin: number;
  bufferMin?: number;
}): number[] {
  const { windows, durationMin, granularityMin, bufferMin = 0 } = args;
  const out = new Set<number>();
  for (const [open, close] of windows) {
    const earliest = open + bufferMin;
    const first = Math.ceil(earliest / granularityMin) * granularityMin;
    for (
      let s = first;
      s + durationMin + bufferMin <= close;
      s += granularityMin
    ) {
      if (s >= earliest) out.add(s);
    }
  }
  return [...out].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test -- run src/features/booking/day-timeline-model.test.ts`
Expected: PASS (existing no-buffer tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/day-timeline-model.ts src/features/booking/day-timeline-model.test.ts
git commit -m "feat(booking): buffer-aware start options"
```

---

### Task 10: `bufferMin` in `hourlyAvailableDayKeys` (month-grid green)

**Files:**

- Modify: `src/features/booking/calendar-model.ts` (`hourlyAvailableDayKeys`), `src/features/booking/hourly-scheduler-data.ts` (pass buffer), `src/features/booking/use-booking-scheduler.ts` (provide buffer)
- Test: `src/features/booking/calendar-model.test.ts`

**Interfaces:**

- Consumes: `viewerDriveBufferMin` (Task 8).
- Produces: `hourlyAvailableDayKeys` gains `bufferMin?: number` (default 0); a day qualifies only if it has a start whose buffered span fits a window AND whose buffered `[start−buf, end+buf]` does not overlap any busy range.

- [ ] **Step 1: Write the failing test** (`calendar-model.test.ts`): a day with a single open window narrow enough that it qualifies with no buffer but NOT with a large buffer; assert the day-key set excludes it once `bufferMin` is applied. Also a busy-overlap case: a free start that becomes blocked once the candidate's buffer is added near an adjacent busy range.

```ts
it("buffer removes a day whose only start no longer fits the window", () => {
  const day = denverMidnight("2026-07-10");
  const win = {
    // 9:00–10:30 Denver that day, as absolute instants
    startsAt: new Date(day.getTime() + 540 * 60_000),
    endsAt: new Date(day.getTime() + 630 * 60_000),
  };
  const base = hourlyAvailableDayKeys({
    days: [day],
    windows: [win],
    busy: [],
    durationMin: 60,
    granularityMin: 15,
  });
  expect(base.has("2026-07-10")).toBe(true);
  const buffered = hourlyAvailableDayKeys({
    days: [day],
    windows: [win],
    busy: [],
    durationMin: 60,
    granularityMin: 15,
    bufferMin: 30,
  });
  expect(buffered.has("2026-07-10")).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test -- run src/features/booking/calendar-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `hourlyAvailableDayKeys`:
  - Add `bufferMin?: number;` to `HourlyAvailableDayKeysArgs`, destructure with default 0.
  - Pass `bufferMin` into the `startOptions({...})` call.
  - In the `hasFree` predicate, widen the candidate for the busy test:

```ts
const bufMs = bufferMin * 60_000;
const candidate: TimeRange = {
  startsAt: new Date(candidateStartMs - bufMs),
  endsAt: new Date(startMs + (s + durationMin) * MS_PER_MIN + bufMs),
};
```

(Keep the lead-time check on the UN-buffered `candidateStartMs`.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test -- run src/features/booking/calendar-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the buffer through.**
  - `hourly-scheduler-data.ts`: add `bufferMin: number` to `HourlySchedulerDataInput`, pass it into `hourlyAvailableDayKeys`, and also set `viewerDriveBufferMin: bufferMin` on the returned `SchedulerData` (add that optional field to `SchedulerData` in `scheduler-context.tsx`: `viewerDriveBufferMin?: number;`).
  - `use-booking-scheduler.ts`: accept `viewerDriveBufferMin` via `UseBookingSchedulerInput` (default 0), pass it into the `hourlySchedulerData` call. House-sitting branch ignores it.

- [ ] **Step 6: Run all booking model tests + typecheck**

Run: `npm run test -- run src/features/booking/calendar-model.test.ts src/features/booking/hourly-scheduler-data.test.ts && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/booking/calendar-model.ts src/features/booking/calendar-model.test.ts src/features/booking/hourly-scheduler-data.ts src/features/booking/scheduler-context.tsx src/features/booking/use-booking-scheduler.ts
git commit -m "feat(booking): buffer-aware month availability"
```

---

### Task 11: Apply the buffer in the day timeline candidate starts

**Files:**

- Modify: `src/features/booking/_components/scheduler/day-timeline.tsx`

**Interfaces:**

- Consumes: `data.viewerDriveBufferMin` (Task 10).

- [ ] **Step 1: Read the buffer.** In `DayTimeline`, add `const bufferMin = data.viewerDriveBufferMin ?? 0;`.

- [ ] **Step 2: Pass it to `startOptions`.** In the `candidateStarts` memo, add `bufferMin` to the `startOptions({...})` call, and widen the busy-overlap candidate:

```ts
const bufMs = bufferMin * 60_000;
const candidateRange = {
  startsAt: new Date(midnight + startMin * 60_000 - bufMs),
  endsAt: new Date(midnight + endMin * 60_000 + bufMs),
};
```

Add `bufferMin` to the memo dependency array.

- [ ] **Step 3: Verify** that the day timeline now offers fewer/later starts near busy ranges and window edges, consistent with the month grid. Manual run.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/booking/_components/scheduler/day-timeline.tsx
git commit -m "feat(booking): buffer-aware day timeline starts"
```

---

### Task 12: Server-side submit guard (`skipBufferGuard`)

**Files:**

- Modify: `src/features/booking/mutation-policy.ts` (add `skipBufferGuard`), the create path that enforces window-fit (find via `grep -rn "skipWindowFit" src/features/booking`), `src/features/booking/booking-repository.ts` (a method to load active buffered ranges for a concurrency class if not reusable).
- Test: the create/edit core test that already exercises the window-fit guard.

**Interfaces:**

- Consumes: `driveBufferMinutes`; the buffered busy ranges; the candidate's own buffer (computed from the booking client's coords — `profileLatLng` is already loaded in `computeBookingArtifacts`).
- Produces: a hard refuse (`{ kind: "refuse" }` or the existing guard's refuse shape) when the candidate's buffered span overlaps another booking's buffered span or doesn't fit a window-with-buffer; admin policy with `skipBufferGuard` downgrades to a warning.

- [ ] **Step 1: Read the existing window-fit guard** to match its structure, refuse shape, and where `openWindows` + active bookings are loaded. Confirm whether a buffered-overlap check belongs in `computeBookingArtifacts` or the create core (it must run for create; quote-preview may surface it as a warning).

- [ ] **Step 2: Add the policy flag.** In `mutation-policy.ts`, add `skipBufferGuard: boolean;` to the policy type; set `false` in `CLIENT_POLICY`, `true` in the admin policy (mirror `skipWindowFit`).

- [ ] **Step 3: Write the failing test.** In the create-core test, construct a booking whose buffered span overlaps an existing exclusive booking's buffered span (same day, gap smaller than the sum of buffers) under `CLIENT_POLICY`; assert the result is a refuse. Add a second case under the admin policy asserting it succeeds with a warning.

- [ ] **Step 4: Run it, verify it fails**

Run: `npm run test -- run <create-core-test-file>`
Expected: FAIL.

- [ ] **Step 5: Implement the guard.** In the chosen location, after distance is known:
  - Compute the candidate buffer: `const candBufMin = service is resident ? 0 : driveBufferMinutes(origin, profileLatLng, cfg);`
  - Load active bookings for the candidate's concurrency class; widen each by ITS own buffer (resident → 0) using the same `driveBufferMinutes`.
  - Reject if the candidate's `[start − candBuf, end + candBuf]` half-open-overlaps any widened existing range, OR doesn't fit any open window with `candBuf` on both ends (reuse the buffered window-fit logic — you may extract a shared pure `bufferedFits(window, candidate, bufMin)` helper).
  - Under `policy.skipBufferGuard`, push a warning instead of returning refuse (mirror the `skipWindowFit` branch).

- [ ] **Step 6: Run the test, verify it passes**

Run: `npm run test -- run <create-core-test-file> && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/booking/mutation-policy.ts <create-core-file> <test-file> src/features/booking/booking-repository.ts
git commit -m "feat(booking): enforce drive-time spacing at submit"
```

---

## PHASE 4 — Range-picker second-click fix

### Task 13: Confirm the root cause, then stabilize the day-button identity

**Files:**

- Modify: `src/features/booking/_components/scheduler/month-grid.tsx`

**Interfaces:**

- No public interface change. Internal: `CustomDayButton` / `SchedulerDayButton` read volatile preview/selection state from context or refs so the `components` prop passed to `<Calendar>` stops changing identity on hover.

- [ ] **Step 1: Reproduce + confirm (systematic-debugging).** Run the app, open a house-sitting calendar, arm a boundary, move the pointer (triggering `setPreviewDays`), and click the second boundary. Add a temporary `console.count("CustomDayButton identity")`/render log and confirm day buttons remount on each hover move (identity churn). Confirm `onDayClick` does NOT fire on the lost clicks. Only proceed once the hypothesis is verified or corrected.

- [ ] **Step 2: Write a guard test** (if feasible): a React Testing Library test mounting `MonthGrid` in range mode that arms a boundary, fires a `pointerenter` (preview update), then asserts the same day-button DOM node identity persists across the update (e.g. capture the node, trigger preview, assert `document.contains(node)` / same ref). If a DOM-identity assertion is impractical, document the manual repro steps in the test file as a comment and rely on Step 5's manual verification.

- [ ] **Step 3: Stabilize identity.** Refactor so `CustomDayButton` no longer closes over `cellClasses`/`previewDays`/`previewMode`/`hoveredBookingId`:
  - Keep `CustomDayButton`'s `useCallback` deps limited to STABLE values (e.g. `byKey`, `cellKind`, handler refs).
  - Move the volatile fill/outline computation INSIDE `SchedulerDayButton`, reading preview/selection/hover state from `SchedulerContext` (extend the context value with the transient preview state, or expose it via a ref/subscription) instead of receiving it as a prop computed by the parent each render.
  - Net effect: the `components={{ DayButton: CustomDayButton }}` prop identity stays stable across hover-preview updates, so react-day-picker stops remounting the grid.

- [ ] **Step 4: Run any month-grid tests + typecheck**

Run: `npm run test -- run src/features/booking && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Manual verification.** Arm a boundary, sweep the pointer across many cells, and confirm the second click commits the range on the FIRST click every time, across a month-nav too. Remove temporary logs.

- [ ] **Step 6: Commit**

```bash
git add src/features/booking/_components/scheduler/month-grid.tsx
git commit -m "fix(booking): make range second-click reliable"
```

---

## Self-Review

**Spec coverage:**

- §1 premium parity → Tasks 1–4. ✔
- §2 settings + buffer math + server widening → Tasks 5–8. ✔
- §2 slot rule (Rule B) across derivers → Tasks 9–11. ✔
- §2 submit guard → Task 12. ✔
- §3 range second-click → Task 13. ✔
- Decisions 4 (house-sitting excluded) enforced in Tasks 7 (`resident` skip) + 12; 6 (missing coords → 0) in Task 6; 7 (pct blocking-only) in Tasks 6/12 (never touches `quote`); 8 (compute-on-read, GiST unchanged) — no persisted buffer column, no constraint change. ✔

**Placeholder scan:** Two tasks (7 join column name, 8/12 file locations) include an explicit `grep`/schema-confirm STEP rather than a guessed value — these are verification actions, not vague placeholders. All pure-logic tasks carry full code + tests.

**Type consistency:** `driveBufferMinutes` returns whole minutes everywhere; ms conversion is local (`* 60_000`) in Tasks 7/10/11. `bufferMin` is the param name in `startOptions` and `hourlyAvailableDayKeys`; `viewerDriveBufferMin` is the prop/field name end-to-end (Task 8 → 10 → 11). `SchedulerData.premiumDays` (existing) and new `SchedulerData.viewerDriveBufferMin` are both optional with `?? 0`/`?? false` reads.

## Known risks to watch during execution

- Task 7's `profiles!...fkey` hint syntax — confirm the FK name; fall back to a verified relationship alias.
- Task 13's root cause is a hypothesis — Step 1 gates the fix on empirical confirmation.
- `GridCell` memo (Task 2) — read premium via context inside the cell so the memo boundary holds.
