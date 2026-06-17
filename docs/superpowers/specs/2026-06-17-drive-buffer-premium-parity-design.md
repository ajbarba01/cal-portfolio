# Drive-time blocking, premium parity, and range-click fix

Status: approved design (2026-06-17). Awaiting implementation plan.

## Summary

Three booking-flow changes, bundled because they touch the same scheduler/availability
surface:

1. **Premium visual parity** — surface premium (holiday-surcharge) days on the hourly
   booking calendars (walk / check-in / training), not just house-sitting. Pricing already
   bills premium for every paid type; this is a UI + config gap only.
2. **Drive-time blocking** — reserve calendar space for Cal's driving time around every
   time-based booking, so the green ("available") slots reflect not just Cal's availability
   windows but also existing bookings, their drive buffers, and the to-be-booking's own
   drive buffer. Driving is treated as part of Cal's working hours.
3. **Range-picker second-click fix** — the house-sitting two-click date-range selection
   sometimes needs several clicks to register the second boundary.

## Background (current state)

- **Premium pricing already applies to all paid types.** `quote.ts` adds a "Premium day(s)"
  line for `walk`, `check_in`, `training`, and `house_sitting`; `booking-service-shared.ts`
  server-derives `holidayDays` and injects `holiday_surcharge_cents` for the hourly types.
  The only visible gap is the calendar star icon and (possibly) `holiday_surcharge_cents`
  being unset in production.
- **Coordinates are ZIP-centroid.** At onboarding, the client's ZIP is geocoded to a
  centroid lat/lng (offline geocoder) and stored on the profile. Every onboarded client —
  including meet-greet — normally has coordinates; a missing value only occurs when the ZIP
  is unrecognized. `lat`/`lng` are system-set (clients cannot write them).
- **Cal's origin already exists in settings** (`origin_lat`, `origin_lng`, `origin_label`),
  along with `road_factor` and `avg_speed_mph`. `estimateDrivingMinutes(miles, cfg)` and
  `haversineMiles` already exist.
- **Busy ranges are identity-free.** `getPublicBusyRanges` (service-role) returns only
  start/end + pet thumbnails — no client identity or location. The pure `markSlotsBusy`,
  `deriveOpenSlots`, `hourlyAvailableDayKeys`, and the day-timeline `startOptions` already
  drive slot/day availability; today they consider Cal's windows + raw busy ranges, but no
  drive time.
- **The Postgres GiST exclusion constraint** enforces exact `[)` overlap on the real
  service time and remains the hard double-booking arbiter.

## Decisions (resolved during design)

| #   | Decision                   | Choice                                                                                                                                                                                                                                 |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Item 1 scope               | Visual + config only. No pricing-engine change.                                                                                                                                                                                        |
| 2   | Routing model              | **Model A — home-based round trips.** Cal departs/returns to origin around every booking. Each booking occupies `[start − drive, end + drive]`.                                                                                        |
| 3   | Where buffers are computed | **Server-side.** Busy ranges are pre-widened by each booking's own buffer before leaving the server; coordinates never reach the browser. The candidate's own buffer is computed from the viewer's coords and passed as a server prop. |
| 4   | House-sitting              | **Excluded** from drive buffers (whole-day block, Cal resident on-site). Unchanged.                                                                                                                                                    |
| 5   | Window-fit semantics       | **Rule B** — the entire buffered span (drive + service + drive) must fit inside one availability window. Driving counts as working time.                                                                                               |
| 6   | Missing coordinates        | Degrade gracefully to buffer = 0 (for that party) + manual approval (existing behavior). Never an error or a blocked calendar.                                                                                                         |
| 7   | The percentage knob        | Applies **only to the blocking buffer**, never to the billed travel cost.                                                                                                                                                              |
| 8   | Persistence / enforcement  | Compute-on-read (no persisted buffer, no backfill). App-level submit guard hard-refuses under client policy, admin-skippable. GiST constraint unchanged.                                                                               |
| 9   | Range UX                   | Keep two-click model; fix the implementation defect.                                                                                                                                                                                   |
| 10  | Settings                   | Add `drive_buffer_pct` (default 120). Origin entered via ZIP→centroid, consistent with clients.                                                                                                                                        |

## Architecture

### §1 Premium visual parity

- Add a `premiumDays: Set<string>` field to the hourly `SchedulerData` produced by
  `hourlySchedulerData` (the month-range path already carries it). `useBookingScheduler`
  already holds `premiumDays` from `usePremiumDays`; thread it into the week-slots branch.
- Render the existing `Star` marker in the **week-grid** and **day-timeline** cells whose
  day-key is in `premiumDays`, mirroring `month-grid.tsx`.
- Configuration: confirm `holiday_surcharge_cents > 0` in production settings (no code).

### §2 Drive-time blocking

**Settings & migration**

- New column `settings.drive_buffer_pct` (integer, default `120`). Add to
  `settingsRowSchema`, `settingsUpdateSchema`, and the admin settings editor.
- Verify the admin editor exposes origin editing; if not, add a ZIP field that geocodes to
  `origin_lat`/`origin_lng` via the existing offline geocoder, with `origin_label`.

**Pure buffer math (unit-tested)**

- `bookingDriveBufferMs(clientLatLng, origin, { roadFactor, avgSpeedMph, pct })`
  = `estimateDrivingMinutes(haversineMiles(origin, clientLatLng), …) × 60000 × pct/100`.
- Returns `0` when `clientLatLng` is null/missing. Used for both ends (model A: the one-way
  drive is the buffer applied symmetrically before and after).

**Server: widen busy ranges (identity-free preserved)**

- Extend the service-role busy-range query (`getActiveBusyRanges` / its core) to join each
  booking to its owner's `lat`/`lng` and the service's `pricing_type`. For **time-based**
  bookings, widen the returned range to `[start − buf, end + buf]`. House-sitting and
  missing-coord bookings return the raw range.
- `PublicBusyRange` keeps its current shape (`startsAt`, `endsAt`, `pets`) — only the
  timestamps change. No coordinates or identity are added.

**Client: candidate's own buffer**

- The booking page (server component) computes the **viewer's** own `viewerDriveBufferMs`
  (origin → viewer coords × pct) and passes it as a prop into the scheduler. House-sitting
  pages pass 0 / ignore it.

**Slot rule (Rule B) — the precise statement**

> A candidate booking occupies `[start − viewerBuf, end + viewerBuf]`. It is bookable only
> when **(1)** that entire buffered span fits inside one availability window — i.e.
> `windowOpen ≤ start − viewerBuf` and `end + viewerBuf ≤ windowClose` — **and (2)** the
> buffered span does not half-open-overlap any busy range (busy ranges already widened by
> their own buffer server-side). Widening both sides and testing overlap is exactly
> model A: the gap between two bookings must cover Cal's drive home from one plus the drive
> out to the next.

- Wire the rule into the three existing derivers so they never disagree:
  - `deriveOpenSlots` (use-availability) — week-slot candidates.
  - `hourlyAvailableDayKeys` (calendar-model) — which days qualify (month-grid green +
    "no-free-time days go grey").
  - day-timeline `startOptions` — the per-day start list.
- Changing the booking duration re-derives all of the above (already the case).

**Server guard (submit-time)**

- Add a buffer-spacing guard in `computeBookingArtifacts` / the create path that re-checks
  Rule B against the current set of active bookings. Under client policy it hard-refuses a
  conflicting booking (same severity as the existing window-fit / overlap guards). A new
  policy flag `skipBufferGuard` lets admin on-behalf override with a warning, mirroring
  `skipWindowFit` / `skipDistanceRefuse`.
- Compute-on-read; no persisted buffer; GiST exclusion constraint unchanged.

### §3 Range-picker second-click fix

- **Confirm the root cause empirically first** (systematic-debugging), do not assume it.
  Leading hypothesis: in `month-grid.tsx`, an armed boundary makes every hover move call
  `setPreviewDays`, which churns the identity of `cellClasses` → `CustomDayButton` →
  the `components` prop, causing react-day-picker to remount every day button. A second
  click whose `pointerup` lands on a just-remounted button never synthesizes a `click`,
  so `onDayClick` does not fire.
- **Fix direction:** stabilize the `DayButton` component identity so hover-preview
  re-renders do not remount the grid — have the button read volatile preview/selection
  state from `SchedulerContext` (or refs) instead of closing over it in a regenerated
  factory. Keep the two-click UX.

## Testing

- Pure unit tests: `bookingDriveBufferMs`; buffered `deriveOpenSlots`; buffered
  `hourlyAvailableDayKeys`; buffered day-timeline starts; the submit-time buffer guard;
  premium-star presence in week-grid / day-timeline.
- Item 3: manual verification of reliable second click, plus a render-identity guard test
  if feasible (assert the DayButton/components identity is stable across a preview update).
- Migration applied to the production project per the deploy-topology note.

## Suggested implementation split (PRs)

1. **Premium parity + range-click fix** — small, independent, no schema change.
2. **Settings + server buffer + busy-range widening** — migration, buffer math, identity-
   free widening, admin knob.
3. **Client slot-rule + submit guard** — buffered derivers, viewer-buffer prop, server
   guard + `skipBufferGuard`.

## Known limitations (accepted)

- **ZIP-centroid coarseness** — drive estimates are origin-centroid to client-centroid, not
  street-level. The 120% knob absorbs the slop; street-level geocoding is a future provider
  swap behind the existing `Geocoder` interface.
- **Model A double-counts** drive for two bookings in the same area scheduled back-to-back
  (Cal "returns home" between them). Acceptable MVP simplification; the buffer percentage is
  the slack knob.
- **Simultaneous-insert race** — two clients booking near-adjacent slots at the same instant
  can both pass the app-level guard (the GiST constraint only blocks exact overlap). Rare;
  Cal resolves at approval. Same class of race as other app-level guards.
- **House-sitting is unbuffered** by design.
