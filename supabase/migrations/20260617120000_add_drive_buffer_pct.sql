alter table public.settings
  add column if not exists drive_buffer_pct integer not null default 120;
comment on column public.settings.drive_buffer_pct is
  'Percent of estimated one-way drive time reserved as blocking buffer around each time-based booking (e.g. 120 = 1.2x). Scheduling only; never affects price.';
