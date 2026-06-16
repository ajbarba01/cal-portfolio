-- Structured identity columns Cal wants on a pet (the "Per Animal" intake form's
-- Pet Information section). Kept as text because a non-technical owner enters
-- freeform values ('6 months', '45 lbs', 'female, spayed'); app-layer Zod
-- validates. Rich medical / behavior / feeding / meds live in a pet-scoped
-- form_responses row (form_key = 'pet'), NOT in wide columns here.
--
-- pets inherited dogs' table-level UPDATE grant to `authenticated`, so these new
-- columns are owner-writable without a new grant; RLS (client_id = auth.uid())
-- still scopes writes to the owner.
alter table pets
  add column if not exists age              text,
  add column if not exists sex              text,
  add column if not exists spayed_neutered  boolean,
  add column if not exists weight           text,
  add column if not exists vet_name         text,
  add column if not exists vet_phone        text,
  add column if not exists vet_address      text,
  add column if not exists emergency_vet    text;
