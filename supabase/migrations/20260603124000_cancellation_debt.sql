-- Booking Rules v2 — Phase 18: cancellation/refund policy, no-show, debt gate.

-- Cancellation/refund policy values (all Cal-tunable).
alter table settings
  add column cancellation_full_refund_hours integer not null default 48,
  add column late_cancel_refund_pct         integer not null default 50,
  add column no_show_charge_pct             integer not null default 100;

-- New terminal booking status: a Cal-marked no-show. (ADD VALUE is not used in
-- this same migration, so it commits cleanly.)
alter type booking_status add value 'no_show';

-- client_debits: outstanding balances that gate re-booking. System/admin-set
-- only — never client-writable (same column-guard rule as bookings.status).
create table client_debits (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references profiles(id) on delete cascade,
  booking_id   uuid references bookings(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  reason       text not null check (reason in ('late_cancel', 'no_show')),
  settled_at   timestamptz,
  created_at   timestamptz not null default now()
);

alter table client_debits enable row level security;
revoke all on client_debits from anon, authenticated;
-- Clients may read their own debits; all writes go through the service role.
grant select on client_debits to authenticated;

create policy "client_debits: client can read own"
  on client_debits for select
  using (client_id = auth.uid() or is_admin());
