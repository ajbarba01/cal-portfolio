-- supabase/migrations/20260618130000_pets_birthdate.sql
-- Structured birth date for a pet, used to derive puppy pricing (any dog under
-- 6 months at a booking's start fires the puppy household / puppy training
-- modifiers). Distinct from the freeform `age` text column, which is display-only.
--
-- pets already grants table-level UPDATE/INSERT to `authenticated`; RLS
-- (client_id = auth.uid()) scopes writes to the owner, so no new grant is needed.
alter table pets
  add column if not exists birthdate date;
