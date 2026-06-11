-- Cumulative refunded amount (cents) read from Stripe charge.amount_refunded.
-- A partially-refunded row stays 'succeeded' with refunded_cents > 0; it flips
-- to 'refunded' only when fully refunded.
alter table payments
  add column refunded_cents int not null default 0;

-- Dispute markers (PAY6). Orthogonal to payment_status — a disputed charge can
-- still be paid. Surfaced by SP5; this slice only persists + logs.
alter table payments
  add column disputed_at timestamptz,
  add column dispute_status text;
