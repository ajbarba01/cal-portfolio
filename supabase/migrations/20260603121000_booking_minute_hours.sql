-- Booking Rules v2 — Phase 15: half-hour booking hours, bounded at start and end.
-- Hours-of-day move from integer hours to minutes-since-midnight so Cal can set
-- 6:30am–10:00pm windows. The guard now bounds both the start (>= open) and the
-- end (<= close) of a booking.

alter table settings
  add column booking_open_minute  integer not null default 390,  -- 6:30am
  add column booking_close_minute integer not null default 1320; -- 10:00pm

alter table settings
  add constraint booking_minute_range check (
    booking_open_minute >= 0
    and booking_close_minute <= 1440
    and booking_open_minute < booking_close_minute
  );

alter table settings
  drop column booking_open_hour,
  drop column booking_close_hour;
