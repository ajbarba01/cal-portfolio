-- Security: inquiries inserts must flow through the service-role submitInquiry
-- server action, which enforces the honeypot, per-email rate-limit, and Zod
-- validation. The original migration granted anon/authenticated a direct INSERT
-- with `with check (true)`, which let a caller bypass every app-level guard via
-- the public REST API and forge client_id / status / replied_at / resolved_at.
-- Remove the public insert path; the service role bypasses RLS, so the contact
-- form keeps working through the action.

drop policy if exists "inquiries: anyone can submit" on inquiries;
revoke insert on inquiries from anon, authenticated;
