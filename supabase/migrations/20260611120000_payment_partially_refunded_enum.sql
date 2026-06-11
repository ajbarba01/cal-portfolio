-- Add a partial-refund booking-level state. Additive + forward-only (Postgres
-- has no DROP VALUE). In its own migration because a new enum value cannot be
-- USED in the same transaction that adds it (repo precedent:
-- 20260608120000_onboarding_status_and_meet_greet_enum.sql).
alter type payment_status add value if not exists 'partially_refunded';
