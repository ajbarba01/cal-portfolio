-- Per-booking Kiche flags (replaces the deprecated per-account profiles.kiche_allowed).
--
-- Two distinct concepts, kept separate so client consent never auto-discounts:
--   kiche_welcome — client consent set in the booking Details step ("OK for Cal's
--                   dog Kiche to tag along"). Default true. Client-writable at create.
--   kiche_applied — Cal's admin decision that Kiche is actually coming, which
--                   triggers the service's kiche_discount_pct. Admin/service-role
--                   only (NOT granted to authenticated). Only valid when
--                   kiche_welcome = true and the service carries a Kiche rate.
--
-- profiles.kiche_allowed is left in place but deprecated; its admin toggle is
-- removed and pricing no longer reads it.
alter table bookings
  add column kiche_welcome boolean not null default true,
  add column kiche_applied boolean not null default false;
