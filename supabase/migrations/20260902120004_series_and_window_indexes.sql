-- Two predicates left unindexed by 20260613120000_performance_indexes.sql.
--
-- bookings.series_id: the daily series-roll cron filters occurrences by series,
-- and the booking_series FK is `on delete set null`, which scans bookings for
-- every deleted rule. Postgres does not index the referencing side of a foreign
-- key on its own.
--
-- availability_windows.ends_at: the public calendar reads forward from now by
-- window end, which is a sequential scan of the whole table today.

create index if not exists bookings_series_id_idx on bookings (series_id);
create index if not exists availability_windows_ends_at_idx on availability_windows (ends_at);
