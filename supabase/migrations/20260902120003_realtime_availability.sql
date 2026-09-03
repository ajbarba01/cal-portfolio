-- Add the two availability tables to the realtime publication.
--
-- The booking calendar subscribes to postgres_changes on availability_windows
-- and overnight_nights, but only `profiles` was ever published
-- (20260613130000_realtime_profiles.sql), so those subscriptions never fired.
-- The intraday view silently fell back to its 60-second poll and the overnight
-- view had no fallback at all: a night Cal opened or closed did not reach an
-- open booking page until the visitor reloaded.
--
-- Both tables are anon-readable with a `using (true)` select policy, so the
-- realtime authorization check passes for every subscriber and no private data
-- is broadcast. `bookings` is deliberately left out of the publication — its
-- rows carry client identity, and the public calendar already derives busy
-- ranges through a narrowed server read.

alter publication supabase_realtime add table availability_windows, overnight_nights;
