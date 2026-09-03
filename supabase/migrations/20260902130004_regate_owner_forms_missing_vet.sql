-- Re-gate the owner forms that predate the vet fields.
--
-- Vet contact used to be collected by the legacy 'emergency' form and was then
-- meant to live on pets; the owner form now requires vet_name and vet_phone and
-- is the only surface that asks for them. An owner row submitted before that
-- change still reads as complete to the booking gate, which compares
-- submitted_at against the freshness window and never inspects the payload, so
-- those clients would reach a paid booking with no vet on file.
--
-- Ageing the row past the window marks it as needing reconfirming; reopening
-- the card prefills the saved values and re-runs the current schema on save, so
-- the vet fields have to be filled before it passes. The payload is left intact
-- for Cal to read in the meantime. Re-running this changes nothing further.
--
-- The gate this restores is advisory until form_responses writes move to the
-- service role: authenticated still holds a table-wide UPDATE grant on the
-- table, so submitted_at can be bumped over the REST API without the payload
-- changing. Revoking that grant belongs with the code change, not here.

update form_responses
set submitted_at = 'epoch'
where form_key = 'owner'
  and (
    coalesce(data ->> 'vet_name', '') = ''
    or coalesce(data ->> 'vet_phone', '') = ''
  );
