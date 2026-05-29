-- Enable RLS on all tables (deny-by-default)
alter table profiles             enable row level security;
alter table dogs                 enable row level security;
alter table services             enable row level security;
alter table availability_windows enable row level security;
alter table settings             enable row level security;
alter table bookings             enable row level security;
alter table form_responses       enable row level security;
alter table payments             enable row level security;
alter table reviews              enable row level security;

-- ============================================================
-- Revoke all auto-granted privileges (Supabase auto_expose_new_tables
-- grants all privileges to anon/authenticated by default).
-- We re-grant only what each role actually needs.
-- ============================================================

-- Strip everything from anon and authenticated first
revoke all on profiles             from anon, authenticated;
revoke all on dogs                 from anon, authenticated;
revoke all on services             from anon, authenticated;
revoke all on availability_windows from anon, authenticated;
revoke all on settings             from anon, authenticated;
revoke all on bookings             from anon, authenticated;
revoke all on form_responses       from anon, authenticated;
revoke all on payments             from anon, authenticated;
revoke all on reviews              from anon, authenticated;

-- ============================================================
-- Re-grant: anon (public, unauthenticated)
-- ============================================================
grant select on services             to anon;
grant select on availability_windows to anon;
-- reviews: anon reads published only (enforced by policy below)
grant select on reviews              to anon;

-- ============================================================
-- Re-grant: authenticated
-- ============================================================
-- profiles: select + insert; UPDATE is column-scoped below
grant select, insert on profiles to authenticated;

-- dogs: full CRUD for own rows
grant select, insert, update, delete on dogs to authenticated;

-- services, availability_windows: read-only for clients
grant select on services             to authenticated;
grant select on availability_windows to authenticated;

-- settings: read-only
grant select on settings to authenticated;

-- bookings: select + insert; UPDATE is column-scoped below
grant select, insert on bookings to authenticated;

-- form_responses: select + insert + update
grant select, insert, update on form_responses to authenticated;

-- payments: read-only (writes go via service role / Stripe webhook)
grant select on payments to authenticated;

-- reviews: select + insert (status forced to pending by policy)
grant select, insert on reviews to authenticated;

-- ============================================================
-- Column-level UPDATE grants (security-critical).
-- Because we revoked table-level UPDATE, these column grants are
-- the ONLY update path for authenticated users.
-- ============================================================

-- profiles: clients may update ONLY these columns.
-- Excluded (system/admin-set): id, role, lat, lng, kiche_allowed,
--   onboarding_complete, created_at.
grant update (full_name, email, phone, avatar_url, address, zip)
  on profiles to authenticated;

-- bookings: clients may update ONLY comments and quote_inputs.
-- Excluded: status, payment_status, final_cents, discount_cents,
--   concurrency, distance_miles, quote_breakdown, requires_approval,
--   reminder_sent_at, series_id, starts_at, ends_at, client_id,
--   service_id, created_at, updated_at.
grant update (comments, quote_inputs)
  on bookings to authenticated;

-- ============================================================
-- Helper: is the current user an admin?
-- security definer so it can read profiles bypassing RLS;
-- auth.uid() still reads from the session GUC (request.jwt.claims).
-- ============================================================
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- profiles policies
-- ============================================================
create policy "profiles: client can read own"
  on profiles for select
  using (id = auth.uid() or is_admin());

create policy "profiles: client can insert own"
  on profiles for insert
  with check (id = auth.uid());

-- Client UPDATE: column-level grant above restricts which columns
create policy "profiles: client can update own"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles: admin can update any"
  on profiles for update
  using (is_admin());

-- ============================================================
-- dogs policies
-- ============================================================
create policy "dogs: client can read own"
  on dogs for select
  using (client_id = auth.uid() or is_admin());

create policy "dogs: client can insert own"
  on dogs for insert
  with check (client_id = auth.uid());

create policy "dogs: client can update own"
  on dogs for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "dogs: client can delete own"
  on dogs for delete
  using (client_id = auth.uid());

create policy "dogs: admin can do all"
  on dogs for all
  using (is_admin());

-- ============================================================
-- services — anon read; admin write
-- ============================================================
create policy "services: public can read"
  on services for select
  using (true);

create policy "services: admin can insert"
  on services for insert
  with check (is_admin());

create policy "services: admin can update"
  on services for update
  using (is_admin());

create policy "services: admin can delete"
  on services for delete
  using (is_admin());

-- ============================================================
-- availability_windows — anon read; admin write
-- ============================================================
create policy "availability_windows: public can read"
  on availability_windows for select
  using (true);

create policy "availability_windows: admin can insert"
  on availability_windows for insert
  with check (is_admin());

create policy "availability_windows: admin can update"
  on availability_windows for update
  using (is_admin());

create policy "availability_windows: admin can delete"
  on availability_windows for delete
  using (is_admin());

-- ============================================================
-- settings — authenticated read; admin update
-- ============================================================
create policy "settings: authenticated can read"
  on settings for select
  using (auth.role() = 'authenticated');

create policy "settings: admin can update"
  on settings for update
  using (is_admin());

-- ============================================================
-- bookings policies
-- ============================================================
create policy "bookings: client can read own"
  on bookings for select
  using (client_id = auth.uid() or is_admin());

create policy "bookings: client can insert own"
  on bookings for insert
  with check (client_id = auth.uid());

-- Client UPDATE: column-level grant above restricts which columns
create policy "bookings: client can update own"
  on bookings for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "bookings: admin can do all"
  on bookings for all
  using (is_admin());

-- ============================================================
-- form_responses policies
-- ============================================================
create policy "form_responses: client can read own"
  on form_responses for select
  using (client_id = auth.uid() or is_admin());

create policy "form_responses: client can insert own"
  on form_responses for insert
  with check (client_id = auth.uid());

create policy "form_responses: client can update own"
  on form_responses for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "form_responses: admin can do all"
  on form_responses for all
  using (is_admin());

-- ============================================================
-- payments — client read own; no client writes via SQL
-- ============================================================
create policy "payments: client can read own"
  on payments for select
  using (client_id = auth.uid() or is_admin());

-- ============================================================
-- reviews policies
-- ============================================================
-- Anon reads published reviews
create policy "reviews: anon can read published"
  on reviews for select
  using (status = 'published');

-- Authenticated clients also read their own (any status)
create policy "reviews: client can read own"
  on reviews for select
  using (client_id = auth.uid());

-- Client insert — WITH CHECK forces status = 'pending'
create policy "reviews: client can insert pending"
  on reviews for insert
  with check (client_id = auth.uid() and status = 'pending');

-- Admin moderates: update status
create policy "reviews: admin can update"
  on reviews for update
  using (is_admin());

create policy "reviews: admin can delete"
  on reviews for delete
  using (is_admin());
