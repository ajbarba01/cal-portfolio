-- pgTAP RLS tests
-- Runs as superuser (postgres), which bypasses RLS.
-- We use SET LOCAL ROLE authenticated + SET LOCAL request.jwt.claims to exercise policies.
-- The entire test is a single transaction that rolls back at the end.

begin;

select plan(14);

-- ============================================================
-- Fixture setup (runs as postgres/superuser, bypasses RLS)
-- ============================================================
do $$
declare
  v_client_a_id uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_client_b_id uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  v_admin_id    uuid := 'cccccccc-0000-0000-0000-000000000003';
begin
  -- Insert auth users (trigger auto-creates profiles)
  insert into auth.users (id, email, aud, role, is_sso_user, is_anonymous, encrypted_password, created_at, updated_at)
  values
    (v_client_a_id, 'client_a@test.com', 'authenticated', 'authenticated', false, false, 'x', now(), now()),
    (v_client_b_id, 'client_b@test.com', 'authenticated', 'authenticated', false, false, 'x', now(), now()),
    (v_admin_id,    'admin@test.com',    'authenticated', 'authenticated', false, false, 'x', now(), now());

  -- Promote admin via service role (superuser direct update, not client UPDATE)
  update public.profiles set role = 'admin' where id = v_admin_id;
end;
$$;

-- Insert a published review as superuser for anon-read tests
insert into public.reviews (client_id, author_name, rating, body, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Client A', 5, 'Great!', 'published');

-- Insert bookings for both clients as superuser
do $$
declare
  v_client_a_id uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_client_b_id uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  v_walk_id     uuid;
  v_train_id    uuid;
begin
  select id into v_walk_id  from public.services where slug = 'walk'     limit 1;
  select id into v_train_id from public.services where slug = 'training' limit 1;

  insert into public.bookings (
    client_id, service_id, starts_at, ends_at,
    concurrency, status, payment_status,
    quote_inputs, quote_breakdown, discount_cents, final_cents
  ) values (
    v_client_a_id, v_walk_id,
    now() + interval '2 days',
    now() + interval '2 days' + interval '1 hour',
    'exclusive', 'confirmed', 'unpaid',
    '{}'::jsonb, '{}'::jsonb, 0, 2500
  );

  insert into public.bookings (
    client_id, service_id, starts_at, ends_at,
    concurrency, status, payment_status,
    quote_inputs, quote_breakdown, discount_cents, final_cents
  ) values (
    v_client_b_id, v_train_id,
    now() + interval '3 days',
    now() + interval '3 days' + interval '1 hour',
    'exclusive', 'confirmed', 'unpaid',
    '{}'::jsonb, '{}'::jsonb, 0, 3500
  );
end;
$$;

-- ============================================================
-- Tests 1-3: Anon role
-- ============================================================
set local role anon;
set local request.jwt.claims = '';

-- Test 1: anon can read all services
select is(
  (select count(*)::int from public.services),
  4,
  'anon can read all services'
);

-- Test 2: anon can read published reviews
select is(
  (select count(*)::int from public.reviews where status = 'published'),
  1,
  'anon can read published reviews'
);

-- Test 3: anon is denied access to bookings (no SELECT grant)
select throws_ok(
  $sql$ select count(*) from public.bookings $sql$,
  '42501',
  'permission denied for table bookings',
  'anon is denied access to bookings table'
);

reset role;
set local request.jwt.claims = '';

-- ============================================================
-- Tests 4-6: Client isolation
-- ============================================================

-- Test 4: Client A reads own bookings only (1 booking)
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.bookings),
  1,
  'client A sees exactly 1 booking (own)'
);

-- Test 5: Client A sees 0 of client B's bookings
select is(
  (select count(*)::int from public.bookings
    where client_id = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid),
  0,
  'client A sees 0 of client B bookings'
);

reset role;
set local request.jwt.claims = '';

-- Test 6: Client B sees own booking only
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.bookings),
  1,
  'client B sees exactly 1 booking (own)'
);

reset role;
set local request.jwt.claims = '';

-- ============================================================
-- Tests 7-8: Column guard — client cannot self-promote role
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

-- Test 7: attempt to UPDATE role column → permission denied for table profiles
select throws_ok(
  $sql$ update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $sql$,
  '42501',
  'permission denied for table profiles',
  'client cannot update role column — permission denied (column-level guard)'
);

reset role;
set local request.jwt.claims = '';

-- Test 8: role is still client after the failed attempt
select is(
  (select role::text from public.profiles
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'client',
  'client A role is still client after attempted self-promotion'
);

-- ============================================================
-- Tests 9-10: Booking column guard
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

-- Test 9: cannot update bookings.status
select throws_ok(
  $sql$ update public.bookings set status = 'completed'
        where client_id = 'aaaaaaaa-0000-0000-0000-000000000001' $sql$,
  '42501',
  'permission denied for table bookings',
  'client cannot update bookings.status (column-level guard)'
);

-- Test 10: cannot update bookings.final_cents
select throws_ok(
  $sql$ update public.bookings set final_cents = 0
        where client_id = 'aaaaaaaa-0000-0000-0000-000000000001' $sql$,
  '42501',
  'permission denied for table bookings',
  'client cannot update bookings.final_cents (column-level guard)'
);

reset role;
set local request.jwt.claims = '';

-- ============================================================
-- Tests 11-12: Admin reads all clients' data
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';

-- Test 11: admin sees all 2 bookings
select is(
  (select count(*)::int from public.bookings),
  2,
  'admin sees all bookings (both clients)'
);

-- Test 12: admin sees all 3 profiles
select is(
  (select count(*)::int from public.profiles),
  3,
  'admin sees all 3 profiles'
);

reset role;
set local request.jwt.claims = '';

-- ============================================================
-- Test 13: Client reads own profile only
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles),
  1,
  'client A sees only own profile (not all 3)'
);

reset role;
set local request.jwt.claims = '';

-- ============================================================
-- Test 14: Client cannot insert review with status != 'pending'
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $sql$
    insert into public.reviews (client_id, author_name, rating, body, status)
    values (
      'aaaaaaaa-0000-0000-0000-000000000001',
      'Client A', 5, 'Auto-published hack', 'published'
    )
  $sql$,
  '42501',
  'new row violates row-level security policy for table "reviews"',
  'client cannot insert review with status=published (RLS WITH CHECK)'
);

reset role;
set local request.jwt.claims = '';

select * from finish();

rollback;
