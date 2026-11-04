-- German text for in-app announcements. The interface speaks en, ru and de,
-- but announcements were stored in ru and en only, so German readers always
-- got the English wording.
--
-- Both columns are optional. Without a German title the reader gets the
-- English pair, exactly as before; the choice happens in the app
-- (announcementText), not here.
--
-- get_my_announcements() gains the two columns. Its result shape changes, so
-- it is dropped and created again; older tabs keep reading the columns they
-- know.
--
-- Rollback:
--   drop function if exists public.get_my_announcements();
--   -- recreate it from 0137 (with the grants from 0152)
--   alter table public.app_announcements drop column if exists title_de, drop column if exists body_de;

alter table public.app_announcements
  add column if not exists title_de text,
  add column if not exists body_de text;

drop function if exists public.get_my_announcements();

/**
 * What this person should see right now: published, inside its window,
 * addressed to them, and not already dismissed. Critical notices come first.
 */
create function public.get_my_announcements()
returns table (
  id uuid,
  title_ru text,
  title_en text,
  title_de text,
  body_ru text,
  body_en text,
  body_de text,
  level text
)
language sql
security definer
stable
set search_path = public
as $$
  select a.id, a.title_ru, a.title_en, a.title_de, a.body_ru, a.body_en, a.body_de, a.level
  from public.app_announcements a
  where a.published
    and now() >= a.starts_at
    and (a.ends_at is null or now() <= a.ends_at)
    and (
      a.audience_kind = 'all_active'
      or (
        a.audience_kind = 'domain'
        and lower(split_part(coalesce((
          select u.email from auth.users u where u.id = auth.uid()
        ), ''), '@', 2)) = lower(a.audience_value)
      )
      or (
        a.audience_kind = 'workspace'
        and exists (
          select 1
          from public.workspace_members m
          where m.workspace_id = a.audience_value::uuid
            and m.user_id = auth.uid()
        )
      )
    )
    and not exists (
      select 1
      from public.app_announcement_reads r
      where r.announcement_id = a.id
        and r.user_id = auth.uid()
    )
  order by (a.level = 'critical') desc, a.starts_at desc
  limit 5;
$$;

revoke all on function public.get_my_announcements() from public, anon;
grant execute on function public.get_my_announcements() to authenticated, service_role;
