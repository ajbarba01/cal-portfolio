-- reviews: allow accountless native reviews (manual testimonials, not Rover).
--
-- Some reviews come to Cal directly (text, email, in person) from a client with
-- no site account and no Rover listing. These are still "native" (not linked to
-- an external platform, no attribution badge) but can't satisfy the old
-- reviews_source_shape check, which required native rows to carry a client_id.
--
-- TODO(cal): once the admin pre-create-client feature ships, backfill these
-- accountless native rows to a real client_id and consider re-tightening this
-- constraint.

alter table reviews
  drop constraint reviews_source_shape;

alter table reviews
  add constraint reviews_source_shape check (
    (source = 'native' and external_key is null)
    or (source = 'rover' and client_id is null and external_key is not null)
  );
