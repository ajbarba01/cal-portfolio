-- Security: pin the search path on the two SECURITY DEFINER functions.
--
-- Both run as the function owner, so an unqualified name inside the body is
-- resolved against the *caller's* search_path. Any role that can create objects
-- in a schema the caller happens to list first can shadow `profiles` with its
-- own table and have privileged code read or write it instead.
--
-- The fix is `set search_path = ''` on the function plus schema-qualifying every
-- reference in the body. `is_admin()` referenced a bare `profiles`, which would
-- resolve to nothing under an empty search path and break every RLS policy that
-- calls it, so its body is re-created qualified in the same statement.
-- `handle_new_user()` was already writing `public.profiles`; it is re-created
-- only to attach the setting. Signatures, volatility and the
-- `on_auth_user_created` trigger binding are unchanged.
--
-- Operators and casts still resolve because pg_catalog is always implicitly
-- searched, and the enum literals are coerced from the target column types.
--
-- `set_updated_at()` is deliberately untouched: it is SECURITY INVOKER and
-- references only the trigger's NEW record.

create or replace function is_admin()
returns boolean language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role, onboarding_status)
  values (new.id, new.email, 'client', 'info_pending');
  return new;
end;
$$;
