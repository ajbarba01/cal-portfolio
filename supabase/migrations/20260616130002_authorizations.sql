-- Append-only audit trail for click-to-accept e-signatures (the Owner form's
-- Emergency Expense Authorization). Each accepted version is a new immutable row:
-- typed legal name + the exact text VERSION accepted + a timestamp. The booking
-- gate re-prompts only when the current version is newer than the latest
-- accepted row for that client + kind.
--
-- Append-only is enforced by granting authenticated SELECT + INSERT only (no
-- UPDATE/DELETE). Admin acts via the service role.
create table if not exists authorizations (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references profiles(id) on delete cascade,
  kind          text not null,
  version       text not null,
  accepted_name text not null,
  accepted_at   timestamptz not null default now()
);

alter table authorizations enable row level security;
revoke all on authorizations from anon, authenticated;
grant select, insert on authorizations to authenticated;

create policy "authorizations: client can read own"
  on authorizations for select
  using (client_id = auth.uid() or is_admin());

create policy "authorizations: client can insert own"
  on authorizations for insert
  with check (client_id = auth.uid());

create policy "authorizations: admin can do all"
  on authorizations for all
  using (is_admin());

create index if not exists authorizations_client_kind_idx
  on authorizations (client_id, kind);
