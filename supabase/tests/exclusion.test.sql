-- pgTAP exclusion constraint tests
-- Verifies the no_same_class_overlap constraint on bookings.
-- Runs as superuser so RLS does not interfere with fixture setup.

begin;

select plan(3);

-- ============================================================
-- Fixture: create one client user (trigger auto-creates profile)
-- ============================================================
insert into auth.users (id, email, aud, role, is_sso_user, is_anonymous, encrypted_password, created_at, updated_at)
values ('dddddddd-0000-0000-0000-000000000001', 'excl_test@test.com', 'authenticated', 'authenticated', false, false, 'x', now(), now());

-- Insert first exclusive/confirmed booking (slot held)
insert into public.bookings (
  client_id, service_id, starts_at, ends_at,
  concurrency, status, payment_status,
  quote_inputs, quote_breakdown, discount_cents, final_cents
)
select
  'dddddddd-0000-0000-0000-000000000001',
  id,
  '2030-01-10 10:00:00+00',
  '2030-01-10 11:00:00+00',
  'exclusive', 'confirmed', 'unpaid',
  '{}'::jsonb, '{}'::jsonb, 0, 2500
from public.services where slug = 'walk' limit 1;

-- ============================================================
-- Test 1: Two overlapping 'confirmed' 'exclusive' bookings → throws
-- SQLSTATE 23P01 = exclusion_violation
-- ============================================================
select throws_ok(
  $sql$
    insert into public.bookings (
      client_id, service_id, starts_at, ends_at,
      concurrency, status, payment_status,
      quote_inputs, quote_breakdown, discount_cents, final_cents
    )
    select
      'dddddddd-0000-0000-0000-000000000001',
      id,
      '2030-01-10 10:30:00+00',
      '2030-01-10 11:30:00+00',
      'exclusive', 'confirmed', 'unpaid',
      '{}'::jsonb, '{}'::jsonb, 0, 2500
    from public.services where slug = 'walk' limit 1
  $sql$,
  '23P01',
  null,
  'two overlapping confirmed exclusive bookings are rejected (exclusion_violation)'
);

-- ============================================================
-- Test 2: exclusive + resident overlapping → allowed (cross-class)
-- ============================================================
select lives_ok(
  $sql$
    insert into public.bookings (
      client_id, service_id, starts_at, ends_at,
      concurrency, status, payment_status,
      quote_inputs, quote_breakdown, discount_cents, final_cents
    )
    select
      'dddddddd-0000-0000-0000-000000000001',
      id,
      '2030-01-10 08:00:00+00',
      '2030-01-12 12:00:00+00',
      'resident', 'confirmed', 'unpaid',
      '{}'::jsonb, '{}'::jsonb, 0, 10000
    from public.services where slug = 'house-sitting' limit 1
  $sql$,
  'exclusive + resident overlapping bookings are allowed (cross-class, different concurrency)'
);

-- ============================================================
-- Test 3: cancelled booking overlapping confirmed same-class → allowed
-- (terminal states excluded by the constraint WHERE clause)
-- ============================================================
select lives_ok(
  $sql$
    insert into public.bookings (
      client_id, service_id, starts_at, ends_at,
      concurrency, status, payment_status,
      quote_inputs, quote_breakdown, discount_cents, final_cents
    )
    select
      'dddddddd-0000-0000-0000-000000000001',
      id,
      '2030-01-10 10:30:00+00',
      '2030-01-10 11:30:00+00',
      'exclusive', 'cancelled', 'unpaid',
      '{}'::jsonb, '{}'::jsonb, 0, 2500
    from public.services where slug = 'walk' limit 1
  $sql$,
  'cancelled booking overlapping confirmed same-class allowed (terminal state released from constraint)'
);

select * from finish();

rollback;
