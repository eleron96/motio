-- Ensure the avatars bucket is marked public.
-- Migration 0059 may have created the bucket without the public flag if the
-- storage.buckets.public column did not yet exist at migration time (the
-- storage-api adds that column on its own first startup). This migration
-- unconditionally sets public = true so public URL reads work correctly.
update storage.buckets
set    public = true
where  id = 'avatars';
