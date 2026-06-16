-- Generalize form_responses from account-only to entity-scoped (account | pet).
--
-- A form response was previously unique per (client_id, form_key). Pet-scoped
-- intake forms (form_key = 'pet') need one row PER pet, so we add a nullable
-- pet_id and make uniqueness scope-aware. Account-scoped forms (owner, home,
-- emergency) keep pet_id null; the nil-UUID sentinel collapses those NULLs into
-- a single distinct value so the unique index still enforces one-per-account.
--
-- Existing 'emergency' rows (pet_id null) are unaffected.
alter table form_responses
  add column if not exists pet_id uuid references pets(id) on delete cascade;

create unique index if not exists form_responses_client_key_pet_uniq
  on form_responses (
    client_id,
    form_key,
    (coalesce(pet_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );
