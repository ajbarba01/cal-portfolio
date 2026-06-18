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
-- pricing_config: modifier-list shape (see pricing-engine-core spec)
insert into services (slug, name, pricing_type, pricing_config, default_duration_min, max_pets, concurrency, active, sort_order)
values (
  'house-sitting',
  'House Sitting',
  'house_sitting',
  '{
    "modifiers": [
      { "kind": "base_per_night", "cents": 6000 },
      { "kind": "flat_per_night_toggle", "id": "cat_only", "label": "Cat-only home", "cents": -2500, "source": { "kind": "condition", "condition": "noDogs" } },
      { "kind": "flat_per_night_toggle", "id": "puppy_household", "label": "Puppy household", "cents": -1000, "source": { "kind": "condition", "condition": "anyDogUnder6mo" } },
      { "kind": "tiered_per_unit", "unit": "dog", "tiers": [{ "from": 2, "cents": 1500 }, { "from": 3, "cents": 1000 }] },
      { "kind": "flat_per_unit", "unit": "cat", "cents": 800 },
      { "kind": "flat_per_unit", "unit": "other", "cents": 500 },
      { "kind": "flat_per_night_toggle", "id": "needy", "label": "Needy pet care", "cents": 500, "source": { "kind": "ladder", "input": "needyTier", "maxTier": 4 } },
      { "kind": "allowance_then_per_unit", "unit": "exercise", "label": "Extra exercise", "freeUnits": 45, "cents": 500, "perScale": "perDogPerDay" },
      { "kind": "allowance_then_per_unit", "unit": "mile", "label": "Travel", "freeUnits": 5, "cents": 250 },
      { "kind": "pct_surcharge", "id": "premium", "label": "Premium night (+20%)", "pct": 20, "scope": "perPremiumNight", "condition": "premiumDays" },
      { "kind": "pct_discount", "id": "long_a", "label": "Long stay (-5%)", "pct": 5, "condition": "nightsOver4" },
      { "kind": "pct_discount", "id": "long_b", "label": "Extended stay (-5%)", "pct": 5, "condition": "nightsOver6" },
      { "kind": "pct_discount", "id": "kiche", "label": "Kiche discount (-15%)", "pct": 15, "condition": "always", "manual": true }
    ],
    "constraints": {
      "intervalMin": 15,
      "allowedSpecies": ["dog", "cat", "bird", "rodent", "reptile", "fish", "other"],
      "softDistanceWarnMiles": 15
    }
  }'::jsonb,
  null,
  null,
  'resident',
  true,
  1
);

-- Check-ins (exclusive concurrency)
-- pricing_config: modifier-list shape (see pricing-engine-core spec)
insert into services (slug, name, pricing_type, pricing_config, default_duration_min, max_pets, concurrency, active, sort_order)
values (
  'check-in',
  'Check-In',
  'check_in',
  '{
    "modifiers": [
      { "kind": "base_per_hour", "cents": 4500 },
      { "kind": "min_floor", "cents": 1500 },
      { "kind": "allowance_then_per_unit", "unit": "mile", "label": "Travel", "freeUnits": 5, "cents": 200 },
      { "kind": "pct_surcharge", "id": "premium", "label": "Premium day (+20%)", "pct": 20, "scope": "wholeBooking", "condition": "premiumDays" },
      { "kind": "pct_discount", "id": "recurring", "label": "Recurring discount (-5%)", "pct": 5, "condition": "recurringSeries" },
      { "kind": "pct_discount", "id": "puppy_training", "label": "Puppy training (-15%)", "pct": 15, "condition": "anyDogUnder6mo" }
    ],
    "constraints": {
      "intervalMin": 5,
      "minDurationMin": 15,
      "maxDurationMin": 60,
      "allowedSpecies": ["dog"]
    }
  }'::jsonb,
  30,
  null,
  'exclusive',
  true,
  2
);

-- Walks (exclusive concurrency)
-- pricing_config: modifier-list shape (see pricing-engine-core spec)
insert into services (slug, name, pricing_type, pricing_config, default_duration_min, max_pets, concurrency, active, sort_order)
values (
  'walk',
  'Walk',
  'walk',
  '{
    "modifiers": [
      { "kind": "base_per_hour", "cents": 2500 },
      { "kind": "tiered_per_unit", "unit": "dog", "tiers": [{ "from": 2, "pct": 50 }] },
      { "kind": "per_hour_addon", "id": "leash_manners", "label": "Leash manners (+$10/h)", "cents": 1000, "optIn": true },
      { "kind": "allowance_then_per_unit", "unit": "mile", "label": "Travel", "freeUnits": 5, "cents": 200 },
      { "kind": "min_floor", "cents": 1500 },
      { "kind": "pct_surcharge", "id": "premium", "label": "Premium day (+20%)", "pct": 20, "scope": "wholeBooking", "condition": "premiumDays" },
      { "kind": "pct_discount", "id": "recurring", "label": "Recurring discount (-5%)", "pct": 5, "condition": "recurringSeries" },
      { "kind": "pct_discount", "id": "kiche", "label": "Kiche discount (-15%)", "pct": 15, "condition": "always", "manual": true },
      { "kind": "pct_discount", "id": "off_leash", "label": "Off-leash discount (-15%)", "pct": 15, "condition": "always", "manual": true },
      { "kind": "pct_discount", "id": "vetted_2nd_dog", "label": "Vetted 2nd dog (-25%)", "pct": 25, "condition": "always", "manual": true }
    ],
    "constraints": {
      "intervalMin": 15,
      "minDurationMin": 30,
      "maxDurationMin": 180,
      "maxDogs": 2,
      "allowedSpecies": ["dog"]
    }
  }'::jsonb,
  60,
  null,
  'exclusive',
  true,
  3
);

-- Training (exclusive concurrency, max_pets = 1)
-- pricing_config: modifier-list shape (see pricing-engine-core spec)
insert into services (slug, name, pricing_type, pricing_config, default_duration_min, max_pets, concurrency, active, sort_order)
values (
  'training',
  'Training',
  'training',
  '{
    "modifiers": [
      { "kind": "base_per_hour", "cents": 2500 },
      { "kind": "min_floor", "cents": 1500 },
      { "kind": "allowance_then_per_unit", "unit": "mile", "label": "Travel", "freeUnits": 5, "cents": 150 },
      { "kind": "pct_surcharge", "id": "premium", "label": "Premium day (+20%)", "pct": 20, "scope": "wholeBooking", "condition": "premiumDays" },
      { "kind": "pct_discount", "id": "recurring", "label": "Recurring discount (-5%)", "pct": 5, "condition": "recurringSeries" },
      { "kind": "pct_discount", "id": "puppy_training", "label": "Puppy training (-15%)", "pct": 15, "condition": "anyDogUnder6mo" }
    ],
    "constraints": {
      "intervalMin": 5,
      "minDurationMin": 30,
      "maxDurationMin": 60,
      "maxDogs": 1,
      "allowedSpecies": ["dog"]
    }
  }'::jsonb,
  60,
  1,
  'exclusive',
  true,
  4
);
