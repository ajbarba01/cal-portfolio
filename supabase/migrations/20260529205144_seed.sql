-- Seed: settings (single config row)
insert into settings (
  origin_label,
  origin_lat,
  origin_lng,
  road_factor,
  avg_speed_mph,
  auto_approve_threshold_min,
  hard_cutoff_min,
  booking_open_hour,
  booking_close_hour,
  min_lead_time_hours,
  max_advance_days,
  recurring_discount_pct,
  recurring_min_occurrences,
  holiday_surcharge_cents,
  holiday_dates
) values (
  'Boulder',
  40.015,
  -105.27,
  1.3,
  40,
  60,
  120,
  8,
  18,
  24,
  90,
  10,
  3,
  1000,
  '[]'::jsonb
);

-- Seed: services
-- House Sitting (resident concurrency)
-- pricing_config shape for house_sitting:
--   base_dog_cents_per_night: 5000   ($50/night if any dog)
--   base_cat_cents_per_night: 3000   ($30/night if cat-only)
--   extra_dog_cents_per_night: 1500  (+$15/night per extra dog)
--   extra_cat_cents_per_night: 1000  (+$10/night per cat)
--   cant_be_left_alone_cents_per_day: 1000  (+$10/day)
--   extra_walk_15min_cents_per_day: 500     (+$5/day per extra 15 min)
--   holiday_cents_per_day: 1000             (+$10/day)
--   kiche_discount_pct: 20                  (20% Kiche discount)
insert into services (slug, name, pricing_type, pricing_config, default_duration_min, max_pets, concurrency, active, sort_order)
values (
  'house-sitting',
  'House Sitting',
  'house_sitting',
  '{
    "base_dog_cents_per_night": 5000,
    "base_cat_cents_per_night": 3000,
    "extra_dog_cents_per_night": 1500,
    "extra_cat_cents_per_night": 1000,
    "cant_be_left_alone_cents_per_day": 1000,
    "extra_walk_15min_cents_per_day": 500,
    "holiday_cents_per_day": 1000,
    "kiche_discount_pct": 20
  }'::jsonb,
  null,
  null,
  'resident',
  true,
  1
);

-- Check-ins (exclusive concurrency)
-- pricing_config shape for check_in:
--   rate_cents_per_hour: 3000  ($30/hour incl. driving time)
--   minimum_cents: 1500        ($15 minimum)
insert into services (slug, name, pricing_type, pricing_config, default_duration_min, max_pets, concurrency, active, sort_order)
values (
  'check-in',
  'Check-In',
  'check_in',
  '{
    "rate_cents_per_hour": 3000,
    "minimum_cents": 1500
  }'::jsonb,
  30,
  null,
  'exclusive',
  true,
  2
);

-- Walks (exclusive concurrency)
-- pricing_config shape for walk:
--   rate_cents_per_hour: 2500   ($25/hour)
--   per_dog_cents: 1000         (+$10/dog for behavior)
--   kiche_discount_pct: 25      (25% Kiche discount)
insert into services (slug, name, pricing_type, pricing_config, default_duration_min, max_pets, concurrency, active, sort_order)
values (
  'walk',
  'Walk',
  'walk',
  '{
    "rate_cents_per_hour": 2500,
    "per_dog_cents": 1000,
    "kiche_discount_pct": 25
  }'::jsonb,
  60,
  null,
  'exclusive',
  true,
  3
);

-- Training (exclusive concurrency, max_pets = 1)
-- pricing_config shape for training:
--   rate_cents_per_hour: 3500  ($35/hour)
insert into services (slug, name, pricing_type, pricing_config, default_duration_min, max_pets, concurrency, active, sort_order)
values (
  'training',
  'Training',
  'training',
  '{
    "rate_cents_per_hour": 3500
  }'::jsonb,
  60,
  1,
  'exclusive',
  true,
  4
);
