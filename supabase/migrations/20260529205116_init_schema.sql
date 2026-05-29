-- Extensions
create extension if not exists btree_gist;
create extension if not exists pgtap;

-- Enums
create type user_role as enum ('client', 'admin');
create type pricing_type as enum ('house_sitting', 'check_in', 'walk', 'training');
create type concurrency_class as enum ('exclusive', 'resident');
create type booking_status as enum (
  'pending_approval',
  'confirmed',
  'completed',
  'declined',
  'cancelled'
);
create type payment_status as enum ('unpaid', 'paid', 'refunded');
create type payment_txn_status as enum (
  'requires_payment',
  'succeeded',
  'refunded',
  'failed'
);
create type review_status as enum ('pending', 'published', 'rejected');

-- profiles (1:1 auth.users)
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text,
  email               text,
  phone               text,
  avatar_url          text,
  address             text,
  zip                 text,
  lat                 double precision,
  lng                 double precision,
  kiche_allowed       boolean not null default false,
  onboarding_complete boolean not null default false,
  role                user_role not null default 'client',
  created_at          timestamptz not null default now()
);

-- dogs
create table dogs (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references profiles(id) on delete cascade,
  name       text not null,
  breed      text,
  photo_url  text,
  notes      text,
  created_at timestamptz not null default now()
);

-- services
create table services (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  description          text,
  pricing_type         pricing_type not null,
  pricing_config       jsonb not null default '{}'::jsonb,
  default_duration_min integer,
  max_pets             integer,
  concurrency          concurrency_class not null,
  form_key             text,
  requires_approval    boolean not null default false,
  active               boolean not null default true,
  sort_order           integer not null default 0
);

-- availability_windows
create table availability_windows (
  id        uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  note      text
);

-- settings (single config row)
create table settings (
  id                         uuid primary key default gen_random_uuid(),
  origin_label               text not null default 'Boulder',
  origin_lat                 double precision not null default 40.015,
  origin_lng                 double precision not null default -105.27,
  road_factor                double precision not null default 1.3,
  avg_speed_mph              double precision not null default 40,
  auto_approve_threshold_min integer not null default 60,
  hard_cutoff_min            integer not null default 120,
  booking_open_hour          integer not null default 8,
  booking_close_hour         integer not null default 18,
  min_lead_time_hours        integer not null default 24,
  max_advance_days           integer not null default 90,
  recurring_discount_pct     integer not null default 10,
  recurring_min_occurrences  integer not null default 3,
  holiday_surcharge_cents    integer not null default 1000,
  holiday_dates              jsonb not null default '[]'::jsonb
);

-- bookings
create table bookings (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references profiles(id) on delete restrict,
  service_id        uuid not null references services(id) on delete restrict,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  series_id         uuid,
  comments          text,
  status            booking_status not null default 'pending_approval',
  payment_status    payment_status not null default 'unpaid',
  concurrency       concurrency_class not null,
  distance_miles    double precision,
  quote_inputs      jsonb not null default '{}'::jsonb,
  quote_breakdown   jsonb not null default '{}'::jsonb,
  discount_cents    integer not null default 0,
  final_cents       integer not null default 0,
  requires_approval boolean not null default false,
  reminder_sent_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- set_updated_at trigger function
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- form_responses
create table form_responses (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references profiles(id) on delete cascade,
  form_key     text not null,
  booking_id   uuid references bookings(id) on delete set null,
  data         jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

-- payments
create table payments (
  id                       uuid primary key default gen_random_uuid(),
  booking_id               uuid not null references bookings(id) on delete restrict,
  client_id                uuid not null references profiles(id) on delete restrict,
  stripe_payment_intent_id text not null unique,
  amount_cents             integer not null,
  currency                 text not null default 'usd',
  status                   payment_txn_status not null default 'requires_payment',
  created_at               timestamptz not null default now()
);

-- reviews
create table reviews (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references profiles(id) on delete cascade,
  author_name text not null,
  rating      integer not null check (rating between 1 and 5),
  body        text not null,
  status      review_status not null default 'pending',
  created_at  timestamptz not null default now()
);

-- Profile auto-provision trigger
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role, onboarding_complete)
  values (new.id, new.email, 'client', false);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
