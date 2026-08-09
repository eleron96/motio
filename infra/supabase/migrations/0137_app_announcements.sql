-- In-app announcements: a banner (or, for service notices, a one-off modal)
-- that an admin can raise without shipping a release.
--
-- Email broadcasts already exist (email_broadcasts / email_broadcast_recipients)
-- and stay as they are; this is the second channel, chosen per announcement:
-- insert here to speak inside the product, use the broadcast page to send mail.
--
-- Two tables on purpose. "Show it once" has to survive changing devices, so the
-- dismissal is a row keyed by (announcement, user) rather than something in
-- localStorage — otherwise the same banner greets you again on the phone after
-- you closed it on the desktop.
--
-- Rollback:
--   drop function if exists public.dismiss_announcement(uuid);
--   drop function if exists public.get_my_announcements();
--   drop table if exists public.app_announcement_reads;
--   drop table if exists public.app_announcements;

create table if not exists public.app_announcements (
  id uuid primary key default gen_random_uuid(),
  -- Both locales are required: the app ships ru and en, and a half-translated
  -- announcement is worse than none.
  title_ru text not null,
  title_en text not null,
  body_ru text,
  body_en text,
  -- 'info' draws a dismissible strip; 'critical' interrupts with a modal once.
  level text not null default 'info' check (level in ('info', 'critical')),
  -- Same audience model the email broadcasts use, minus 'subscribers': opting
  -- out of the newsletter is about mail, not about the product's own surface.
  audience_kind text not null default 'all_active'
    check (audience_kind in ('all_active', 'domain', 'workspace')),
  audience_value text,
  starts_at timestamptz not null default now(),
  -- Null means "until dismissed"; a date is the safer default in practice,
  -- since forgotten banners otherwise hang around for months.
  ends_at timestamptz,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint app_announcements_audience_value_present check (
    audience_kind = 'all_active' or audience_value is not null
  )
);

create table if not exists public.app_announcement_reads (
  announcement_id uuid not null references public.app_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists app_announcements_live_idx
  on public.app_announcements (published, starts_at desc);

alter table public.app_announcements enable row level security;
alter table public.app_announcement_reads enable row level security;

-- No select policy for announcements on purpose: reading goes through
-- get_my_announcements(), which is the only place that knows whether a given
-- announcement is addressed to you. Without it the table stays closed.
drop policy if exists app_announcement_reads_select_own on public.app_announcement_reads;
create policy app_announcement_reads_select_own
  on public.app_announcement_reads
  for select
  using (user_id = auth.uid());

drop policy if exists app_announcement_reads_insert_own on public.app_announcement_reads;
create policy app_announcement_reads_insert_own
  on public.app_announcement_reads
  for insert
  with check (user_id = auth.uid());

-- Liquibase runs as supabase_admin on the testing/prod stacks, so a new table
-- does NOT inherit the Supabase default privileges (that only happens for
-- tables owned by postgres). Without these grants every request answers 42501.
grant select, insert on public.app_announcement_reads to authenticated;
grant select, insert, update, delete on public.app_announcement_reads to service_role;
grant select, insert, update, delete on public.app_announcements to service_role;

/**
 * What this person should see right now: published, inside its window,
 * addressed to them, and not already dismissed. Critical notices come first.
 */
create or replace function public.get_my_announcements()
returns table (
  id uuid,
  title_ru text,
  title_en text,
  body_ru text,
  body_en text,
  level text
)
language sql
security definer
stable
set search_path = public
as $$
  select a.id, a.title_ru, a.title_en, a.body_ru, a.body_en, a.level
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

/** Closing an announcement is permanent for that person — that is the point. */
create or replace function public.dismiss_announcement(p_announcement_id uuid)
returns void
language sql
security definer
volatile
set search_path = public
as $$
  insert into public.app_announcement_reads (announcement_id, user_id)
  values (p_announcement_id, auth.uid())
  on conflict (announcement_id, user_id) do nothing;
$$;

revoke all on function public.get_my_announcements() from public;
revoke all on function public.dismiss_announcement(uuid) from public;
grant execute on function public.get_my_announcements() to authenticated, service_role;
grant execute on function public.dismiss_announcement(uuid) to authenticated, service_role;
