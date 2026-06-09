-- Free onboarding meet-and-greet. Separate migration so the 'meet_greet' enum
-- value added in the previous migration is already committed and usable.
insert into services (slug, name, description, pricing_type, pricing_config,
                      default_duration_min, max_pets, concurrency,
                      form_key, requires_approval, active, sort_order)
values (
  'meet-greet',
  'Meet & Greet',
  'A free, in-person introduction before your first booking.',
  'meet_greet',
  '{}'::jsonb,
  30,
  null,
  'exclusive',
  null,
  false,
  true,
  -1            -- sorts ahead of paid services; it is onboarding-only
)
on conflict (slug) do nothing;
