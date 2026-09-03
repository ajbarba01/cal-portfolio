-- bookings.status is the one hot predicate 20260613120000_performance_indexes.sql
-- left on a sequential scan. The admin hub's attention counts and the nav badge
-- each count `status = 'pending_approval'` unwindowed on every admin request,
-- and the availability, overnight and client-detail reads all filter
-- `status in ('pending_approval', 'confirmed')`. The existing
-- bookings_active_ends_at_idx carries that pair only as a partial predicate, so
-- it cannot answer a query for one status without rechecking the heap.

create index if not exists bookings_status_idx on bookings (status);
