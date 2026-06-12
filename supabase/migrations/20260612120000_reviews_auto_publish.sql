-- reviews: switch to auto-publish on submit (reactive moderation)
--
-- Previously reviews defaulted to 'pending' and required admin approval before
-- appearing publicly. Maintainer decision 2026-06-11: reviews are now published
-- immediately; admins moderate reactively (reject/delete after the fact).
--
-- Changes:
--   1. Column default: 'pending' → 'published'
--   2. RLS insert policy: relax status check to allow 'published' on insert
--      (the action now inserts 'published'; the WITH CHECK is updated to match)

-- 1. Change column default
alter table reviews
  alter column status set default 'published';

-- 2. Drop old insert policy and replace with one that allows 'published'
drop policy "reviews: client can insert pending" on reviews;

create policy "reviews: client can insert published"
  on reviews for insert
  with check (client_id = auth.uid() and status = 'published');
