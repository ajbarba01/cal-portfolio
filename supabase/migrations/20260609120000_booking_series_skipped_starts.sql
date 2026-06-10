-- EXDATE skip-set for series-occurrence edits.
-- When an occurrence is edited (time or pets), it detaches from its series
-- (series_id -> null) and its original cadence start is recorded here so the
-- series-roll cron never refills the vacated slot. Without this, moving or
-- detaching a future occurrence erases its (series_id, starts_at) claim and the
-- cron re-creates a duplicate at the original cadence time.
alter table booking_series
  add column skipped_starts timestamptz[] not null default '{}';

comment on column booking_series.skipped_starts is
  'Cadence start instants removed from the series (RFC 5545 EXDATE). The roll cron excludes these when materializing.';
