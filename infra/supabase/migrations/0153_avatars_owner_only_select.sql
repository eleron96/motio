-- Found on production 2026-10-13: anyone holding the public anon key could
-- LIST the avatars bucket (POST /storage/v1/object/list/avatars) and read the
-- folder names — one per user who ever set an avatar, named by user id. The
-- cause is 0059's "Public read access for avatars": SELECT on storage.objects
-- for every role. Showing avatars never needed it: the bucket is public, and
-- /storage/v1/object/public/avatars/... is served without consulting RLS.
--
-- What does need SELECT is the owner's own file: avatar upload runs with
-- upsert (storage checks the existing object first) and removal looks the
-- object up before deleting it. So the policy becomes "a signed-in user sees
-- only their own folder", matching the INSERT/UPDATE/DELETE policies from 0060.
--
-- Unchanged: public avatar URLs, upload, replace and delete of one's own avatar.
--
-- Rollback: drop the new policy and re-create 0059's public SELECT policy
-- (this re-opens the listing).

drop policy if exists "Public read access for avatars" on storage.objects;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Users can read their own avatar'
  ) then
    execute $policy$
      create policy "Users can read their own avatar"
        on storage.objects for select
        to authenticated
        using (
          bucket_id = 'avatars'
          and name like (auth.uid()::text || '/%')
        )
    $policy$;
  end if;
end
$$;
