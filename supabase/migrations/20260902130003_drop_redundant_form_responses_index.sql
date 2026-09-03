-- Drop an index that duplicates the leading column of a unique index.
--
-- form_responses_client_key_pet_uniq, added by
-- 20260616130000_form_responses_pet_scope.sql, is unique on
-- (client_id, form_key, coalesce(pet_id, ...)). Every lookup in the app filters
-- on client_id first, so that index already serves them, and Postgres can use
-- any left-most prefix of it. form_responses_client_id_idx from
-- 20260613120000_performance_indexes.sql adds nothing but write cost.

drop index if exists form_responses_client_id_idx;
