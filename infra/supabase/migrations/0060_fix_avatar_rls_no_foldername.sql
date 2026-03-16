-- Fix avatar storage RLS policies to remove dependency on storage.foldername().
-- The storage-api container manages this function itself: on startup it runs
-- its own migrations that DROP and RECREATE storage.foldername. If our policies
-- reference foldername, storage-api cannot start (cannot drop function … because
-- other objects depend on it).
-- Solution: rewrite INSERT/UPDATE/DELETE policies using name LIKE (uid || '/%')
-- which is pure SQL with no function dependency.

-- Drop the foldername-based policies created by 0059.
do $$
begin
  drop policy if exists "Users can upload their own avatar"  on storage.objects;
  drop policy if exists "Users can update their own avatar"  on storage.objects;
  drop policy if exists "Users can delete their own avatar"  on storage.objects;
end
$$;

-- Recreate INSERT policy.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Users can upload their own avatar'
  ) then
    execute $policy$
      create policy "Users can upload their own avatar"
        on storage.objects for insert
        to authenticated
        with check (
          bucket_id = 'avatars'
          and name like (auth.uid()::text || '/%')
        )
    $policy$;
  end if;
end
$$;

-- Recreate UPDATE policy.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Users can update their own avatar'
  ) then
    execute $policy$
      create policy "Users can update their own avatar"
        on storage.objects for update
        to authenticated
        using (
          bucket_id = 'avatars'
          and name like (auth.uid()::text || '/%')
        )
    $policy$;
  end if;
end
$$;

-- Recreate DELETE policy.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Users can delete their own avatar'
  ) then
    execute $policy$
      create policy "Users can delete their own avatar"
        on storage.objects for delete
        to authenticated
        using (
          bucket_id = 'avatars'
          and name like (auth.uid()::text || '/%')
        )
    $policy$;
  end if;
end
$$;
