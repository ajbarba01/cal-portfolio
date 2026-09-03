-- Security: review inserts must flow through the service-role submitReview
-- server action, which resolves identity from getUser() and caps how many
-- reviews one client may post. The insert grant from 20260529205124_rls.sql
-- (relaxed to status = 'published' by 20260612120000_reviews_auto_publish.sql)
-- let any signed-in caller POST rows straight to the public REST API with the
-- publishable key, so the count check in the action was decorative and
-- author_name and body stayed attacker-controlled on a wall that is rendered
-- into static HTML and JSON-LD.
--
-- Remove the public insert path. The service role bypasses RLS, so the review
-- form keeps working through the action, and the Rover import script is
-- unaffected (it already runs as the service role).
--
-- Mirrors 20260607160000_inquiries_lock_insert.sql. Reads are untouched: anon
-- still selects published rows and a client still selects their own.

drop policy if exists "reviews: client can insert published" on reviews;
revoke insert on reviews from anon, authenticated;
