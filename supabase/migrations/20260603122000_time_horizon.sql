-- Booking Rules v2 — Phase 16: soft time-approval horizon.
-- Within auto_confirm_horizon_days a booking auto-confirms; beyond it pends for
-- Cal's review (no longer refused). Only the renamed hard_max_advance_days
-- (a generous sanity cap) refuses outright.

alter table settings
  add column auto_confirm_horizon_days integer not null default 30;

alter table settings
  rename column max_advance_days to hard_max_advance_days;

-- Soft cap (90) is gone; the surviving column is the hard sanity cap (365).
alter table settings
  alter column hard_max_advance_days set default 365;

update settings set hard_max_advance_days = 365;
