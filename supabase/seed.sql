-- LOCAL-ONLY baseline: a login-able admin after every `supabase db reset`.
-- Never runs on prod (db push applies migrations only). Credentials are
-- intentionally well-known local dev values: admin@local.test / password123.
-- Must match ADMIN_EMAIL / SEED_PASSWORD in scripts/db-seed/constants.ts.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'admin@local.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now(),
  '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'email', 'admin@local.test',
    'email_verified', true,
    'phone_verified', false
  ),
  'email', '00000000-0000-0000-0000-000000000001',
  now(), now(), now()
);

-- handle_new_user trigger created the profile; promote it.
update profiles set
  role               = 'admin',
  onboarding_status  = 'approved',
  full_name          = 'Local Admin',
  lat                = 40.015,
  lng                = -105.27
where id = '00000000-0000-0000-0000-000000000001';

commit;
