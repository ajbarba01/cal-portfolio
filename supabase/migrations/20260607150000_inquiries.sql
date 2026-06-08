-- Inquiries: public contact-form submissions feeding the admin inquiries queue.
-- Guests submit (client_id null) or signed-in clients (client_id set). Cal reads
-- + updates via the admin role. App-level honeypot + rate-limit guard the insert;
-- RLS keeps reads admin/owner-only.

create table inquiries (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references profiles(id) on delete set null,
  name        text not null,
  email       text not null,
  phone       text,
  subject     text,
  message     text not null,
  status      text not null default 'new' check (status in ('new', 'resolved')),
  replied_at  timestamptz,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index inquiries_status_created_idx on inquiries (status, created_at desc);
create index inquiries_email_created_idx on inquiries (email, created_at desc);

alter table inquiries enable row level security;
revoke all on inquiries from anon, authenticated;

-- Anyone may submit (guest contact form). Defense-in-depth: the server action
-- also runs honeypot + per-email rate-limit before inserting.
grant insert on inquiries to anon, authenticated;
create policy "inquiries: anyone can submit"
  on inquiries for insert
  with check (true);

-- Signed-in clients may read their own; admin reads/updates all.
grant select on inquiries to authenticated;
create policy "inquiries: owner or admin can read"
  on inquiries for select
  using (client_id = auth.uid() or is_admin());

create policy "inquiries: admin can update"
  on inquiries for update
  using (is_admin())
  with check (is_admin());
