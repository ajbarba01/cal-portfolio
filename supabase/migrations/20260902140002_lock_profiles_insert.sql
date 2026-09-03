-- profiles carries the same defect 20260902130000_client_write_grants.sql
-- removed from bookings: a table-wide INSERT grant to authenticated, whose
-- policy checks only `id = auth.uid()`. Every column is therefore
-- attacker-supplied on the row the whole app treats as identity — role would
-- mint an admin, kiche_allowed a discount, onboarding_status a booking-gate
-- bypass, and lat/lng a service-area bypass.
--
-- No client surface inserts a profile. Self-serve signup rows come from the
-- handle_new_user() trigger on auth.users, which is security definer and so
-- unaffected by this grant, and admin-created clients come from
-- auth.admin.createUser() firing the same trigger; every later write is an
-- UPDATE, either through the column-scoped client grant or through the service
-- role. The policy goes with the grant, per the precedent set on bookings: a
-- policy left behind on a revoked grant reads as though the write is allowed,
-- and would silently permit it again the day someone re-grants. Re-granting
-- INSERT on profiles means writing its column list back in the same migration.

revoke insert on profiles from authenticated;
drop policy if exists "profiles: client can insert own" on profiles;
