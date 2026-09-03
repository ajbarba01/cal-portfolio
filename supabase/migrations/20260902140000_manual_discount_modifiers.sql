-- Cal-adjustable price: two manual discounts Cal can toggle from a booking,
-- replacing the one-off per-booking Kiche mechanism with a general list.
--
-- Both follow the shape of the existing `kiche` modifier: `pct_discount` with
-- `condition: "always"` and `manual: true`, so they never apply on their own —
-- the quote engine only applies a manual modifier whose id the booking's
-- enabledManualIds names, and pricingBreakdown() drops manual modifiers, which
-- keeps them off the customer-facing /services receipt.
--
-- Complimentary is a 100% discount; zeroing travel on top of it is the engine's
-- job, not the config's.
--
-- Appended with a jsonb concat inside jsonb_set so the rest of each config —
-- rates, constraints and every later targeted edit — stands untouched. Guarded
-- on the id so a re-run appends nothing.

update services
set pricing_config = jsonb_set(
  pricing_config,
  '{modifiers}',
  (pricing_config -> 'modifiers') || '[
    { "kind": "pct_discount", "id": "friends_family", "label": "Friends & Family (−50%)", "pct": 50, "condition": "always", "manual": true },
    { "kind": "pct_discount", "id": "complimentary", "label": "Complimentary", "pct": 100, "condition": "always", "manual": true }
  ]'::jsonb,
  false
)
where pricing_type in ('walk', 'check_in', 'training', 'house_sitting')
  and not exists (
    select 1
    from jsonb_array_elements(pricing_config -> 'modifiers') as m
    where m ->> 'id' in ('friends_family', 'complimentary')
  );
