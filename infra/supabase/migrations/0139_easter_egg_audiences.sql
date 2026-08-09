-- Easter eggs for a group, not just for one person at a time.
--
-- 0091 recorded assignments one row per user, so a company-wide egg meant
-- writing a row for everybody and remembering to add one for each new hire.
-- A row can now address a whole audience — a mail domain, a workspace, or
-- every active user — and carry a window, so an anniversary egg can be set up
-- in advance and switch itself off afterwards.
--
-- Rollback:
--   alter table public.easter_egg_targets
--     drop column audience_kind, drop column audience_value,
--     drop column starts_at, drop column ends_at;
--   alter table public.easter_egg_targets alter column user_id set not null;
--   (and restore get_my_daily_brief_egg from 0091)

alter table public.easter_egg_targets
  add column if not exists audience_kind text not null default 'user',
  add column if not exists audience_value text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

-- Existing rows are all personal assignments; the default already says so.
alter table public.easter_egg_targets alter column user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'easter_egg_targets_audience_kind_check'
  ) then
    alter table public.easter_egg_targets
      add constraint easter_egg_targets_audience_kind_check
      check (audience_kind in ('user', 'domain', 'workspace', 'all_active'));
  end if;

  -- Each audience needs exactly the field it is addressed by.
  if not exists (
    select 1 from pg_constraint where conname = 'easter_egg_targets_audience_value_present'
  ) then
    alter table public.easter_egg_targets
      add constraint easter_egg_targets_audience_value_present
      check (
        (audience_kind = 'user' and user_id is not null)
        or (audience_kind in ('domain', 'workspace') and audience_value is not null)
        or (audience_kind = 'all_active')
      );
  end if;
end $$;

-- "One active egg per user" only ever meant personal rows; an audience row is
-- not in competition with them (the resolver below picks by priority instead).
drop index if exists public.easter_egg_targets_one_active_per_user;
create unique index if not exists easter_egg_targets_one_active_per_user
  on public.easter_egg_targets (user_id)
  where enabled and audience_kind = 'user';

create index if not exists easter_egg_targets_live_idx
  on public.easter_egg_targets (audience_kind, enabled);

/**
 * Which egg this person should see right now.
 *
 * A personal assignment wins over a workspace one, which wins over a domain,
 * which wins over "everyone" — so a company-wide anniversary egg can be live
 * without overriding the eggs individuals already have. Ties go to the newest
 * row. Rows outside their window, and disabled rows, do not count.
 */
create or replace function public.get_my_daily_brief_egg()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select t.egg_key
  from public.easter_egg_targets t
  where t.enabled
    and (t.starts_at is null or now() >= t.starts_at)
    and (t.ends_at is null or now() <= t.ends_at)
    and (
      (t.audience_kind = 'user' and t.user_id = auth.uid())
      or (
        t.audience_kind = 'domain'
        and lower(split_part(coalesce((
          select u.email from auth.users u where u.id = auth.uid()
        ), ''), '@', 2)) = lower(t.audience_value)
      )
      or (
        t.audience_kind = 'workspace'
        and exists (
          select 1
          from public.workspace_members m
          where m.workspace_id = t.audience_value::uuid
            and m.user_id = auth.uid()
        )
      )
      or t.audience_kind = 'all_active'
    )
  order by
    case t.audience_kind
      when 'user' then 0
      when 'workspace' then 1
      when 'domain' then 2
      else 3
    end,
    t.created_at desc
  limit 1;
$$;

revoke execute on function public.get_my_daily_brief_egg() from anon, public;
grant execute on function public.get_my_daily_brief_egg() to authenticated;
