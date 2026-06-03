-- Booking Rules v2 — Phase 14: gate booking approval on miles, not driving minutes.
-- The driving-minutes estimate survives only as the travel-cost input
-- (road_factor / avg_speed_mph); it no longer gates approval.

alter table settings
  add column auto_approve_threshold_miles double precision not null default 8,
  add column hard_cutoff_miles            double precision not null default 50,
  add column gate_use_road_miles          boolean          not null default false;

alter table settings
  drop column auto_approve_threshold_min,
  drop column hard_cutoff_min;
