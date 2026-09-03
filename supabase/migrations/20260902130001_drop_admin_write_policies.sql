-- Drop the admin write policies that no role can ever reach.
--
-- Every table here revokes all privileges from anon and authenticated and then
-- re-grants only SELECT, so an admin holding an ordinary authenticated session
-- is refused at the grant long before RLS is consulted. The policies below were
-- written as defense in depth against a write grant that was never issued, and
-- reading them suggests an admin session can write these tables, which it
-- cannot. Cal's admin surfaces all write with the service role, which bypasses
-- RLS entirely.
--
-- Only INSERT/UPDATE/DELETE policies are dropped. The FOR ALL admin policies on
-- pets, bookings, form_responses, booking_pets and authorizations are left
-- alone: those tables do grant writes, or the policy is also an admin's read
-- path. Re-granting a write on any table below means restoring its policy in
-- the same migration, or the grant lands on a deny-by-default table.

drop policy if exists "services: admin can insert" on services;
drop policy if exists "services: admin can update" on services;
drop policy if exists "services: admin can delete" on services;

drop policy if exists "availability_windows: admin can insert" on availability_windows;
drop policy if exists "availability_windows: admin can update" on availability_windows;
drop policy if exists "availability_windows: admin can delete" on availability_windows;

drop policy if exists "overnight_nights: admin can insert" on overnight_nights;
drop policy if exists "overnight_nights: admin can update" on overnight_nights;
drop policy if exists "overnight_nights: admin can delete" on overnight_nights;

drop policy if exists "settings: admin can update" on settings;

drop policy if exists "inquiries: admin can update" on inquiries;

drop policy if exists "reviews: admin can update" on reviews;
drop policy if exists "reviews: admin can delete" on reviews;
