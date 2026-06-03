-- Calendar-First Booking — Phase 20: generalize dogs → pets (+ species, photos),
-- add the booking_pets join table, and a private pet-photos storage bucket.

-- ── Species enum ──────────────────────────────────────────────────────────────
create type pet_species as enum ('dog', 'cat');

-- ── dogs → pets ───────────────────────────────────────────────────────────────
-- Table rename carries its grants, RLS enable flag, policies, FKs and indexes;
-- only the policy NAMES still say "dogs:", renamed below for hygiene. Existing
-- rows are dogs, so the new species column defaults to 'dog'.
alter table dogs rename to pets;
alter table pets add column species pet_species not null default 'dog';

alter policy "dogs: client can read own"   on pets rename to "pets: client can read own";
alter policy "dogs: client can insert own" on pets rename to "pets: client can insert own";
alter policy "dogs: client can update own" on pets rename to "pets: client can update own";
alter policy "dogs: client can delete own" on pets rename to "pets: client can delete own";
alter policy "dogs: admin can do all"      on pets rename to "pets: admin can do all";

-- ── booking_pets join ─────────────────────────────────────────────────────────
-- Which specific pets are on a booking. Written by the service role inside
-- booking creation; clients may read their own (for account/bookings detail).
-- on delete restrict on pet_id: a pet on a booking cannot be deleted out from
-- under it.
create table booking_pets (
  booking_id uuid not null references bookings(id) on delete cascade,
  pet_id     uuid not null references pets(id) on delete restrict,
  primary key (booking_id, pet_id)
);

create index booking_pets_pet_id_idx on booking_pets (pet_id);

alter table booking_pets enable row level security;
revoke all on booking_pets from anon, authenticated;
grant select on booking_pets to authenticated;

create policy "booking_pets: client can read own"
  on booking_pets for select
  using (
    exists (
      select 1 from bookings b
      where b.id = booking_id and b.client_id = auth.uid()
    )
    or is_admin()
  );

create policy "booking_pets: admin can do all"
  on booking_pets for all
  using (is_admin());

-- ── pet-photos storage bucket (private) ───────────────────────────────────────
-- Object path convention: {client_id}/{pet_id}/{filename}. Owner is the first
-- path segment. Reads are served via short-lived service-role signed URLs, so
-- no public read policy is needed.
insert into storage.buckets (id, name, public)
values ('pet-photos', 'pet-photos', false)
on conflict (id) do nothing;

create policy "pet-photos: owner can read"
  on storage.objects for select
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "pet-photos: owner can insert"
  on storage.objects for insert
  with check (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "pet-photos: owner can update"
  on storage.objects for update
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "pet-photos: owner can delete"
  on storage.objects for delete
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
