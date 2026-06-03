-- Booking Rules v2 — Phase 17: open-ended weekly recurrence.
-- A durable booking_series rule lets open-ended ("no end") series be
-- materialized forward by the series-roll cron instead of inserting infinite
-- rows up front. Occurrences are only ever materialized up to
-- recurrence_generation_horizon_days.

alter table settings
  add column recurrence_generation_horizon_days integer not null default 42;

-- booking_series: the recurrence rule + frozen quote inputs.
-- `step_interval` stores the rule's interval (DESIGN's `interval`); the literal
-- word `interval` is a Postgres type keyword, avoided as a column name.
create table booking_series (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references profiles(id) on delete cascade,
  service_id         uuid not null references services(id) on delete restrict,
  freq               text not null default 'weekly' check (freq = 'weekly'),
  step_interval      integer not null default 1 check (step_interval >= 1),
  count              integer check (count is null or count >= 1),
  until              timestamptz,
  open_ended         boolean not null default false,
  template_starts_at timestamptz not null,
  duration_min       integer not null check (duration_min > 0),
  quote_inputs       jsonb not null default '{}'::jsonb,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- bookings.series_id now FKs the series rule (was a bare uuid).
alter table bookings
  add constraint bookings_series_id_fkey
  foreign key (series_id) references booking_series(id) on delete set null;

-- RLS: clients read their own series; the rule is written only by server
-- actions + the series-roll cron under the service role (clients never write).
alter table booking_series enable row level security;
revoke all on booking_series from anon, authenticated;
grant select on booking_series to authenticated;

create policy "booking_series: client can read own"
  on booking_series for select
  using (client_id = auth.uid() or is_admin());
