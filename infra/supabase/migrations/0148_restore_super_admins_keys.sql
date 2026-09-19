-- public.super_admins on the test stand had lost everything 0007 attaches to
-- it — the primary key, the foreign key to auth.users, row level security and
-- the "read own row" policy — although 0007 is recorded there as executed.
-- Without the key every upsert of a super admin inserted one more row (each
-- super-admin request added a row: 534 rows for 3 people). Without RLS the
-- table was readable and writable through the API by anyone holding the anon
-- key, and a row in it is all that admin_force_purge_account() and the
-- deletion-events read policy check.
--
-- This puts 0007's objects back where they are missing and changes nothing
-- where they exist (production: the deletes find no rows, every block is
-- skipped). Rows are cleaned up first so the keys can be added: rows for users
-- that no longer exist go (the foreign key would cascade them anyway), and
-- each user keeps its earliest row.

delete from public.super_admins s
where not exists (select 1 from auth.users u where u.id = s.user_id);

delete from public.super_admins s
using (
  select ctid, row_number() over (partition by user_id order by created_at, ctid) as rn
  from public.super_admins
) ranked
where s.ctid = ranked.ctid
  and ranked.rn > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.super_admins'::regclass
      and contype = 'p'
  ) then
    alter table public.super_admins
      add constraint super_admins_pkey primary key (user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.super_admins'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  ) then
    alter table public.super_admins
      add constraint super_admins_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.super_admins'::regclass) then
    alter table public.super_admins enable row level security;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'super_admins'
      and policyname = 'super admins can read own row'
  ) then
    create policy "super admins can read own row" on public.super_admins
      for select using (user_id = auth.uid());
  end if;
end $$;
