-- Data-driven assignment for daily-brief easter eggs.
--
-- The EFFECT itself stays in code (a React component catalog keyed by egg_key);
-- this table only records WHO gets WHICH egg, so назначить/снять/сменить пасхалку
-- becomes a single SQL row instead of a frontend code change + full deploy.
--
-- The client never reads this table directly: it calls get_my_daily_brief_egg(),
-- which returns only the caller's own egg_key. Writes are admin-only
-- (service_role / Metabase) — we explicitly REVOKE write from authenticated,
-- mirroring 0071, because Supabase grants write to authenticated by default.

create table if not exists public.easter_egg_targets (
  id         uuid primary key default gen_random_uuid(),
  egg_key    text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  enabled    boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);

-- At most one ACTIVE egg per user. enabled is NOT NULL so the partial predicate
-- never sees a NULL gap.
create unique index if not exists easter_egg_targets_one_active_per_user
  on public.easter_egg_targets (user_id) where enabled;

alter table public.easter_egg_targets enable row level security;

-- No SELECT/WRITE policy for `authenticated`: reads go through the RPC below,
-- writes go through service_role / Metabase. RLS alone is not enough per this
-- repo's convention (0085 showed PostgREST returning permission-denied until a
-- table grant existed) — so we keep the default-deny posture and only revoke the
-- implicit write grant Supabase hands to authenticated.
revoke insert, update, delete on public.easter_egg_targets from authenticated;

-- Resolver: returns the caller's active egg_key (or NULL). SECURITY DEFINER so it
-- reads past RLS; it filters strictly on auth.uid() and takes NO user_id argument,
-- so a caller can never query someone else's assignment.
create or replace function public.get_my_daily_brief_egg()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select egg_key
  from public.easter_egg_targets
  where user_id = auth.uid() and enabled
  limit 1;
$$;

revoke execute on function public.get_my_daily_brief_egg() from anon, public;
grant  execute on function public.get_my_daily_brief_egg() to authenticated;

-- Seed: migrate the current hardcoded assignments (registry.ts) into rows, with
-- NO behavior change. Guarded by `where exists` against auth.users so the
-- migration also succeeds on the test stand, where not every prod user exists.
insert into public.easter_egg_targets (egg_key, user_id, note)
select v.egg_key, v.user_id::uuid, v.note
from (values
  ('shabbat',   'f3d2d05e-9475-4d4c-813b-669b9eb32592', 'a.kuprina (Nastya)'),
  ('six-seven', '77fab19c-9f13-4732-872f-c920340404f8', 's.pavlova (Sveta)'),
  ('six-seven', '32c03e77-eb1c-4be3-acb3-88080ed19237', 'n.tokocheva (Naili)'),
  ('six-seven', '170ebc84-d358-4291-830d-e61cb2fad180', 'a.rerikh (Sasha)')
) as v(egg_key, user_id, note)
where exists (select 1 from auth.users u where u.id = v.user_id::uuid)
on conflict do nothing;
