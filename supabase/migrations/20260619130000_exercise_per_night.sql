-- Extra exercise is a per-night add-on for the whole stay, not per pet. The
-- house-sitting "Extra exercise" modifier previously carried `perScale:
-- "perDogPerDay"`, which multiplied the charge by the dog count. That option is
-- removed from the engine, so strip the now-unknown key from every stored config
-- (mapping over the modifiers array; `elem - 'perScale'` is a no-op where absent).
update services
set pricing_config = jsonb_set(
  pricing_config,
  '{modifiers}',
  (
    select jsonb_agg(elem - 'perScale' order by ord)
    from jsonb_array_elements(pricing_config -> 'modifiers')
      with ordinality as t(elem, ord)
  )
)
where pricing_config ? 'modifiers'
  and exists (
    select 1
    from jsonb_array_elements(pricing_config -> 'modifiers') as elem
    where elem ? 'perScale'
  );
