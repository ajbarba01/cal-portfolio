-- The house-sitting "Cat-only home" discount (−$25/night) is keyed on `noDogs`,
-- which also holds for a stay that has no cat in it at all: a bird, a rabbit or
-- a reptile takes the discount and reads a label naming a household it is not.
-- `catsOnly` — at least one cat and no dogs — is the condition the label has
-- always described, and the quote engine already evaluates it, so this is a
-- data fix rather than a code one. No other modifier or rate moves.
--
-- Rebuilt with jsonb_agg rather than a positional '{modifiers,N,...}' path
-- because the house-sitting modifier list has been appended to since it was
-- seeded, so `cat_only`'s index is not stable. `with ordinality` preserves the
-- stacking order, and every other modifier passes through untouched. Guarded on
-- the condition being the old one, so a re-run is a no-op.

update services
set pricing_config = jsonb_set(
  pricing_config,
  '{modifiers}',
  (
    select jsonb_agg(
      case
        when m ->> 'id' = 'cat_only'
          then jsonb_set(m, '{source,condition}', '"catsOnly"'::jsonb, false)
        else m
      end
      order by ord
    )
    from jsonb_array_elements(pricing_config -> 'modifiers') with ordinality as t(m, ord)
  ),
  false
)
where pricing_type = 'house_sitting'
  and pricing_config -> 'modifiers'
      @> '[{ "id": "cat_only", "source": { "condition": "noDogs" } }]'::jsonb;
