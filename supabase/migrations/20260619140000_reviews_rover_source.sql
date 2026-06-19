-- reviews: support Rover-sourced (imported) reviews alongside native ones.
--
-- Native reviews are written by signed-in clients (client_id = auth.uid()).
-- Rover reviews are imported from a code-owned file via the service-role
-- `rover:sync` script; they have no account, so client_id is null and the row
-- is keyed by a stable `external_key` from the file.
--
-- RLS is intentionally left unchanged: the existing insert policy requires
-- `client_id = auth.uid()`, which Rover rows (null client_id) can never satisfy
-- — so only the service role can mint them. The read policy is `status =
-- 'published'`, source-agnostic, so published Rover rows are publicly readable.

create type review_source as enum ('native', 'rover');

alter table reviews
  add column source review_source not null default 'native',
  add column external_key text;

-- Rover reviewers have no profile row.
alter table reviews
  alter column client_id drop not null;

-- Source invariants: native rows are account-backed; rover rows are key-backed.
alter table reviews
  add constraint reviews_source_shape check (
    (source = 'native' and client_id is not null and external_key is null)
    or (source = 'rover' and client_id is null and external_key is not null)
  );

-- One row per Rover review key (the sync script upserts ON CONFLICT here).
-- A plain UNIQUE (not a partial index): native rows carry a null external_key,
-- and Postgres treats nulls as distinct, so many native rows coexist. ON CONFLICT
-- inference requires a non-partial unique constraint, which this provides.
alter table reviews
  add constraint reviews_external_key_unique unique (external_key);
