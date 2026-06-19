-- Check-in drop-ins apply to any pet, not just dogs. Widening allowedSpecies to
-- dog+cat makes cats selectable and flips the pet-step heading to "Which pets?".
-- (System pets are dog|cat only; allowedSpeciesOf narrows to that avatar set.)
update services
set pricing_config = jsonb_set(
  pricing_config,
  '{constraints,allowedSpecies}',
  '["dog", "cat"]'::jsonb,
  true
)
where pricing_type = 'check_in';
