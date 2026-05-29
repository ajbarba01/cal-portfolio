-- No-double-booking exclusion constraint
-- Prevents two bookings of the same concurrency class from overlapping
-- while either is in an active (slot-holding) status.
-- Cross-class overlaps are allowed (e.g. resident house-sit + exclusive walk).
-- Terminal states (declined, cancelled, completed) are excluded from the constraint.
alter table bookings add constraint no_same_class_overlap
  exclude using gist (
    concurrency with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending_approval', 'confirmed'));
