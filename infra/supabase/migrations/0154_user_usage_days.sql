-- Daily usage snapshot for product analytics: which device people use Motio on
-- (phone / tablet / computer), on which OS, whether it is installed as an app,
-- and which planner view they work in. One row per user per day per device
-- class; the planner re-sends only when something changes, so the row keeps the
-- last view of the day. No IP, no raw user agent — only the coarse values below.
--
-- Read by analytics (metabase_ro gets SELECT through default privileges). The
-- client never touches the table directly: it writes through record_usage_day(),
-- which takes user_id from auth.uid(). Rows go away with the profile.

create table if not exists public.user_usage_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  device text not null check (device in ('phone', 'tablet', 'desktop')),
  os text not null check (os in ('ios', 'android', 'macos', 'windows', 'linux', 'other')),
  standalone boolean not null default false,
  view_mode text check (view_mode in ('day', 'week', 'calendar')),
  planner_surface text check (planner_surface in ('timeline', 'board')),
  group_mode text check (group_mode in ('assignee', 'project')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, day, device)
);

create index if not exists user_usage_days_day_idx on public.user_usage_days (day);

-- No policies: clients go through the function below. Default privileges on
-- this stack hand new tables to anon/authenticated, so take that back explicitly.
alter table public.user_usage_days enable row level security;
revoke all on table public.user_usage_days from anon, authenticated;
grant select, insert, update, delete on table public.user_usage_days to service_role;

create or replace function public.record_usage_day(
  p_device text,
  p_os text,
  p_standalone boolean,
  p_view_mode text,
  p_planner_surface text,
  p_group_mode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- The day follows Moscow time like the rest of the product (daily brief, crons).
  insert into public.user_usage_days
    (user_id, day, device, os, standalone, view_mode, planner_surface, group_mode)
  values
    (auth.uid(), (now() at time zone 'Europe/Moscow')::date, p_device, p_os,
     coalesce(p_standalone, false), p_view_mode, p_planner_surface, p_group_mode)
  on conflict (user_id, day, device) do update
    set os = excluded.os,
        standalone = public.user_usage_days.standalone or excluded.standalone,
        view_mode = excluded.view_mode,
        planner_surface = excluded.planner_surface,
        group_mode = excluded.group_mode,
        last_seen_at = now();
end;
$$;

revoke all on function public.record_usage_day(text, text, boolean, text, text, text) from public, anon;
grant execute on function public.record_usage_day(text, text, boolean, text, text, text) to authenticated;
