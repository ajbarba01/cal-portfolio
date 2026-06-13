-- Add `profiles` to the realtime publication so the onboarding approval watcher
-- receives postgres_changes UPDATE events for the signed-in user. The existing
-- self-read RLS policy ("profiles: read own row") makes the user's own row
-- visible to the realtime authorization check.
alter publication supabase_realtime add table profiles;
