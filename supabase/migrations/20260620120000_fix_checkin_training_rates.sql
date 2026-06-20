-- Correct two pricing-config mistakes Cal flagged:
--  1. Check-in and training base hourly rates were swapped. Check-ins bill
--     $25/hr; training bills $45/hr.
--  2. The puppy-training discount (−15%) was attached to check-ins; it belongs
--     to training only. Drop it from check-in.
-- Surgical jsonb edits (not whole-config replacement) so later targeted
-- migrations on these rows — e.g. check-in's widened allowedSpecies — stand.
-- base_per_hour is the first modifier in both rows (seed + modifier-config
-- migration), so index 0 is stable.

-- check_in: base_per_hour 4500 -> 2500 (rate was swapped with training)
update services
set pricing_config = jsonb_set(pricing_config, '{modifiers,0,cents}', '2500'::jsonb, false)
where pricing_type = 'check_in';

-- check_in: drop the puppy_training discount (training-only perk)
update services
set pricing_config = jsonb_set(
  pricing_config,
  '{modifiers}',
  (
    select jsonb_agg(m order by ord)
    from jsonb_array_elements(pricing_config -> 'modifiers') with ordinality as t(m, ord)
    where m ->> 'id' is distinct from 'puppy_training'
  ),
  false
)
where pricing_type = 'check_in';

-- training: base_per_hour 2500 -> 4500 (rate was swapped with check-in)
update services
set pricing_config = jsonb_set(pricing_config, '{modifiers,0,cents}', '4500'::jsonb, false)
where pricing_type = 'training';
