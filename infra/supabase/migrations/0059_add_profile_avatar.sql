-- Добавляем колонку avatar_url для хранения URL фото профиля.
alter table public.profiles
  add column if not exists avatar_url text;

-- Создаём bucket для аватаров.
-- В разных версиях storage schema у buckets может присутствовать или отсутствовать колонка public.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'public'
  ) then
    execute $sql$
      insert into storage.buckets (id, name, public)
      values ('avatars', 'avatars', true)
      on conflict (id) do nothing
    $sql$;
  else
    insert into storage.buckets (id, name)
    values ('avatars', 'avatars')
    on conflict (id) do nothing;
  end if;
end
$$;

-- RLS: пользователь может загружать/обновлять только свои файлы (путь начинается с userId/).
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload their own avatar'
  ) then
    execute $policy$
      create policy "Users can upload their own avatar"
        on storage.objects for insert
        to authenticated
        with check (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $policy$;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update their own avatar'
  ) then
    execute $policy$
      create policy "Users can update their own avatar"
        on storage.objects for update
        to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $policy$;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete their own avatar'
  ) then
    execute $policy$
      create policy "Users can delete their own avatar"
        on storage.objects for delete
        to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $policy$;
  end if;
end
$$;

-- Публичное чтение аватаров.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read access for avatars'
  ) then
    execute $policy$
      create policy "Public read access for avatars"
        on storage.objects for select
        to public
        using (bucket_id = 'avatars')
    $policy$;
  end if;
end
$$;
