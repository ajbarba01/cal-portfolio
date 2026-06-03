-- Explicit per-night overnight (house-sitting) availability.
--
-- night = Denver calendar day D (YYYY-MM-DD); Cal sleeps D → D+1.
-- Replaces the incorrect intraday-window derivation; this is now the sole
-- source of truth for when overnight stays are bookable.

create table overnight_nights (
  night      date primary key,           -- Denver calendar night (D → D+1) Cal sleeps over
  note       text,
  created_at timestamptz not null default now()
);
alter table overnight_nights enable row level security;

-- mirror availability_windows grant pattern: public + authenticated may SELECT;
-- all writes go through the service role (admin server actions), so no write grant to anon/authenticated.
revoke all on overnight_nights from anon, authenticated;
grant select on overnight_nights to anon, authenticated;

-- public read; admin write (defense-in-depth even though writes are service-role)
create policy "overnight_nights: public can read"
  on overnight_nights for select
  using (true);

create policy "overnight_nights: admin can insert"
  on overnight_nights for insert
  with check (is_admin());

create policy "overnight_nights: admin can update"
  on overnight_nights for update
  using (is_admin());

create policy "overnight_nights: admin can delete"
  on overnight_nights for delete
  using (is_admin());
