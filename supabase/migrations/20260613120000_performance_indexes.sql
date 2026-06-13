create index if not exists bookings_client_id_starts_at_idx on bookings (client_id, starts_at desc);
create index if not exists bookings_starts_at_idx on bookings (starts_at);
create index if not exists bookings_active_ends_at_idx on bookings (ends_at)
  where status in ('pending_approval', 'confirmed');
create index if not exists bookings_reminder_due_idx on bookings (starts_at)
  where status = 'confirmed' and reminder_sent_at is null;
create index if not exists bookings_service_id_idx on bookings (service_id);
create index if not exists pets_client_id_idx on pets (client_id);
create index if not exists payments_booking_id_idx on payments (booking_id);
create index if not exists form_responses_client_id_idx on form_responses (client_id);
create index if not exists inquiries_client_id_idx on inquiries (client_id);
create index if not exists client_debits_client_id_idx on client_debits (client_id);
create index if not exists reviews_status_created_idx on reviews (status, created_at desc);
create index if not exists profiles_role_created_idx on profiles (role, created_at desc);
