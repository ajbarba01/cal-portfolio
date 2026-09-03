-- Narrow the client write grants to the columns a client actually writes.
--
-- 20260529205124_rls.sql column-scoped UPDATE on profiles and bookings, left
-- pets on the table-wide grant it inherited from dogs, and granted INSERT at
-- table level everywhere, so several values a client has no business setting
-- were writable straight through the REST API with the publishable key. RLS
-- only ever checked row ownership; it never restricted which columns of an
-- owned row the caller may name.
--
-- pets: photo_url is a storage object path the server signs and republishes,
-- including onto the public calendar, so a table-wide grant let a client point
-- it at any object in the bucket — on UPDATE, and equally on the INSERT that
-- creates the pet. runUploadPetPhoto now records the path it just wrote with
-- the service role, so the client grant no longer needs the column at all. The
-- columns below are exactly what runCreatePet and runUpdatePet name; the admin
-- on-behalf writes go through the service role, which bypasses grants. SELECT
-- and DELETE keep their table-wide grants, and RLS still scopes every
-- statement to client_id = auth.uid().
--
-- bookings: quote_inputs is the priced input a re-quote reads back, so a client
-- could rewrite their own price after the booking was quoted and, once paid,
-- turn the difference into a refund; INSERT was worse still, because the
-- policy checked only client_id, leaving status, payment_status and
-- final_cents attacker-supplied on a row Cal's queues treat as real. Nothing
-- writes bookings through a session client — create, edit, approval, cron and
-- the Stripe webhook all build the repository over the service client — so
-- both grants go, mirroring 20260607160000_inquiries_lock_insert.sql and
-- 20260902120000_reviews_lock_insert.sql. The two client write policies go with
-- them: a policy left behind on a revoked grant reads as though the write is
-- allowed and, worse, would silently permit it again the day someone re-grants.
-- Re-granting a write on bookings means writing its ownership check back in the
-- same migration.
--
-- profiles: email drives outbound mail and identity lookups and is written once
-- by handle_new_user(); no client surface edits it. That leaves full_name,
-- phone, avatar_url, address and zip, of which runUpdateProfile writes four.

revoke insert, update on pets from authenticated;
grant insert (client_id, name, species, breed, notes, birthdate) on pets to authenticated;
grant update (name, species, breed, notes, birthdate) on pets to authenticated;

revoke insert, update on bookings from authenticated;
drop policy if exists "bookings: client can insert own" on bookings;
drop policy if exists "bookings: client can update own" on bookings;

revoke update (email) on profiles from authenticated;
