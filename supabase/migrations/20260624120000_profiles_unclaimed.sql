-- supabase/migrations/20260624120000_profiles_unclaimed.sql
-- Pre-created ("unclaimed") clients: Cal mints a real auth user with no
-- password and manages it on the client's behalf until they claim it.
--
-- `unclaimed` defaults FALSE so every existing signup/OAuth path is unaffected
-- (those rows are born claimed). Only the admin create-client action flips a
-- row to TRUE. These columns are intentionally absent from the profiles client
-- UPDATE column grant, so RLS makes them admin/service-role-write-only with no
-- policy change required.

alter table profiles
  add column if not exists unclaimed boolean not null default false,
  add column if not exists claimed_at timestamptz,
  add column if not exists invited_at timestamptz;

comment on column profiles.unclaimed is
  'True = Cal-created shadow account not yet claimed by the client. No password; password-login impossible. Notifications suppressed.';
comment on column profiles.claimed_at is
  'When the client claimed the account (set a password). Null while unclaimed.';
comment on column profiles.invited_at is
  'When Cal last generated a claim link. Drives the "invite generated" admin UI.';
