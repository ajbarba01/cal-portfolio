-- New onboarding lifecycle enum (replaces the onboarding_complete boolean).
create type onboarding_status as enum (
  'info_pending',
  'meet_greet_pending',
  'approved',
  'declined'
);

-- Add the column with the new-signup default.
alter table profiles
  add column onboarding_status onboarding_status not null default 'info_pending';

-- Backfill from the old boolean: completed → approved, else info_pending.
-- Existing onboarded clients become 'approved' and are never re-gated.
update profiles
  set onboarding_status = case
    when onboarding_complete then 'approved'::onboarding_status
    else 'info_pending'::onboarding_status
  end;

-- Re-point the auto-provision trigger at the new column.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role, onboarding_status)
  values (new.id, new.email, 'client', 'info_pending');
  return new;
end;
$$;

-- Column-level guard: onboarding_status is system/admin-set, NEVER client-writable
-- (a client must not self-approve).
--
-- The existing grant from 20260529205124_rls.sql reads:
--   grant update (full_name, email, phone, avatar_url, address, zip)
--     on profiles to authenticated;
--
-- onboarding_complete was already excluded from that list; onboarding_status must
-- be excluded too. The guard is "absence from the allow-list" — we never grant
-- update on onboarding_status, so a client session cannot write it. We re-issue
-- the column-scoped grant to record the authoritative writable set here now that
-- onboarding_complete is dropped. The revoke is column-scoped (not table-wide) so
-- it clears only the prior per-column grant and never a hypothetical future
-- table-level UPDATE grant.
revoke update (full_name, email, phone, avatar_url, address, zip)
  on profiles from authenticated;
grant update (full_name, email, phone, avatar_url, address, zip)
  on profiles to authenticated;

-- Drop the old boolean now that the trigger, guard, and all code readers move in
-- this same commit set.
alter table profiles drop column onboarding_complete;

-- Add the meet-and-greet pricing type. NOTE: a new enum value cannot be USED in
-- the same transaction that adds it — the seed lives in a separate migration.
alter type pricing_type add value if not exists 'meet_greet';
