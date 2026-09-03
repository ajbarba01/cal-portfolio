-- pgTAP was installed into the public schema by the init migration for a SQL
-- test suite that no longer exists. Its roughly forty helper functions and two
-- views live alongside the application's own objects, so every `supabase gen
-- types typescript` run copies them into the generated Database type, where
-- they show up as callable RPCs and selectable relations that nothing in the
-- app may use. Nothing outside the extension depends on it — no migration
-- calls a pgTAP function and no .sql test file remains — so the drop is
-- non-cascading on purpose: a hidden dependency should fail this migration
-- loudly rather than be silently dropped with it.

drop extension if exists pgtap;
