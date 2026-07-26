-- time_off: a person's days off — vacation, a single day off and sick leave are
-- ONE unified record (deliberately no kind column).
--
-- Not a task: a day off has no project, status, type or tag, it must never be
-- counted as work, and it renders on the timeline as a bar pinned to lane 0 of
-- that person's row. Storing it in public.tasks would have fired the assignment
-- notification and the upcoming-deadline push at the person who is away, and
-- would have added the absence to every task count. So it gets its own table.
--
-- workspace_id is auto-resolved from the assignee via trigger (same shape as
-- task_comments, 0050), so a client can never file a record into a workspace the
-- assignee does not belong to.
--
-- Ownership: a member manages their OWN record (assignees.user_id = auth.uid()),
-- and a workspace admin may record days off for anyone — a schedule is often
-- entered by the lead, not by the person. Everyone in the workspace can read, so
-- the team sees who is away. Note that read access is member-wide by design:
-- an absence is visible to colleagues, only its optional note carries detail.
--
-- One person can never hold two overlapping periods. Two layers enforce it:
--   * time_off_guard_overlap() — a BEFORE trigger taking a per-assignee advisory
--     lock, raising 23P01 'TIME_OFF_OVERLAP'. Works on every environment and is
--     the error the client actually maps.
--   * time_off_no_overlap — a declarative EXCLUDE constraint, installed only
--     where btree_gist can be installed. On prod/testing Liquibase connects as
--     supabase_admin (docker-compose.prod.yml: MIGRATION_DB_USER) and gets it;
--     on the dev/CI stack it connects as `postgres`, which is NOT a superuser in
--     the supabase/postgres image and cannot create a C-language extension, so
--     the block degrades to the trigger instead of failing the migration.
--
-- Idempotent and self-contained on purpose: an EXECUTED changeSet does not prove
-- the object exists, so the table, both constraints, both indexes, all three
-- triggers and all four policies are individually guarded and safe to re-run on
-- a half-applied database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.time_off;
--   DROP FUNCTION IF EXISTS public.time_off_sync_workspace();
--   DROP FUNCTION IF EXISTS public.time_off_guard_overlap();
--   (btree_gist is left installed — it is inert and may be shared.)

-- EXCLUDE ... assignee_id WITH = needs the btree_gist opclass for uuid.
-- insufficient_privilege = the non-superuser dev/CI migration role; not fatal,
-- the overlap trigger below carries the same invariant everywhere.
do $$
begin
  create extension if not exists btree_gist;
exception
  when insufficient_privilege then
    raise notice 'btree_gist not installed (needs a superuser migration role); time_off relies on the overlap trigger only';
end $$;

create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assignee_id uuid not null references public.assignees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Constraints are added OUT OF LINE so a table left behind by a half-applied run
-- (create table succeeded, the rest did not) still picks them up on a re-run.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'time_off_date_order_check'
      and conrelid = 'public.time_off'::regclass
  ) then
    alter table public.time_off
      add constraint time_off_date_order_check
      check (end_date >= start_date);
  end if;

  -- Inclusive range: a one-day record is [d, d] and still collides with itself.
  if exists (select 1 from pg_extension where extname = 'btree_gist')
     and not exists (
       select 1 from pg_constraint
       where conname = 'time_off_no_overlap'
         and conrelid = 'public.time_off'::regclass
     ) then
    alter table public.time_off
      add constraint time_off_no_overlap
      exclude using gist (
        assignee_id with =,
        daterange(start_date, end_date, '[]') with &&
      );
  end if;
end $$;

-- Timeline window load: where workspace_id = ? and end_date >= ? and start_date <= ?
-- (same access shape as tasks_workspace_date_range_idx, 0067).
create index if not exists time_off_workspace_date_range_idx
  on public.time_off (workspace_id, end_date, start_date);

-- Per-person lookups: "my records" and the workload absent count.
create index if not exists time_off_assignee_idx
  on public.time_off (assignee_id);

-- Resolve workspace_id from the assignee so the client never supplies it.
create or replace function public.time_off_sync_workspace()
returns trigger as $$
declare
  resolved_workspace_id uuid;
begin
  select workspace_id
  into resolved_workspace_id
  from public.assignees
  where id = new.assignee_id;

  if resolved_workspace_id is null then
    raise exception 'Assignee % does not exist', new.assignee_id;
  end if;

  new.workspace_id := resolved_workspace_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.time_off_sync_workspace() from public, anon, authenticated;

-- Fires on EVERY insert/update, not just when assignee_id changes: otherwise a
-- client that is a member of two workspaces could re-file an existing record
-- into the other one, where its assignee does not belong.
drop trigger if exists time_off_sync_workspace on public.time_off;
create trigger time_off_sync_workspace
  before insert or update on public.time_off
  for each row execute function public.time_off_sync_workspace();

-- No two overlapping periods for one person. The advisory lock is per assignee
-- and released at commit, so two tabs racing on the same person are serialized
-- while everyone else is untouched. errcode 23P01 is the same class the EXCLUDE
-- constraint raises, so the client maps ONE code on every environment.
create or replace function public.time_off_guard_overlap()
returns trigger as $$
begin
  -- Triggers run BEFORE constraints, and daterange() throws a raw 22000 on an
  -- inverted period. Reject it here with the CHECK class so the client sees the
  -- same code the constraint would have produced.
  if new.end_date < new.start_date then
    raise exception 'TIME_OFF_DATE_ORDER' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.assignee_id::text, 0));

  if exists (
    select 1
    from public.time_off existing
    where existing.assignee_id = new.assignee_id
      and existing.id <> new.id
      and daterange(existing.start_date, existing.end_date, '[]')
          && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'TIME_OFF_OVERLAP' using errcode = '23P01';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.time_off_guard_overlap() from public, anon, authenticated;

drop trigger if exists time_off_guard_overlap on public.time_off;
create trigger time_off_guard_overlap
  before insert or update of assignee_id, start_date, end_date on public.time_off
  for each row execute function public.time_off_guard_overlap();

drop trigger if exists time_off_set_updated_at on public.time_off;
create trigger time_off_set_updated_at
  before update on public.time_off
  for each row execute function public.set_updated_at();

alter table public.time_off enable row level security;

do $$
begin
  -- Everyone in the workspace sees who is away.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'time_off'
      and policyname = 'workspace members can read time off'
  ) then
    create policy "workspace members can read time off" on public.time_off
      for select using (public.is_workspace_member(workspace_id));
  end if;

  -- The person themselves, or a workspace admin on anyone's behalf. The
  -- assignees row must belong to the same workspace; the sync trigger has
  -- already set workspace_id by the time WITH CHECK runs, so it cannot be
  -- spoofed by the client.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'time_off'
      and policyname = 'own or admin can create time off'
  ) then
    create policy "own or admin can create time off" on public.time_off
      for insert with check (
        public.is_workspace_member(time_off.workspace_id)
        and (
          public.is_workspace_admin(time_off.workspace_id)
          or exists (
            select 1
            from public.assignees a
            where a.id = time_off.assignee_id
              and a.workspace_id = time_off.workspace_id
              and a.user_id = auth.uid()
          )
        )
      );
  end if;

  -- USING guards the old row, WITH CHECK the new one, so a member can never
  -- move their record onto someone else's row (an admin may).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'time_off'
      and policyname = 'own or admin can update time off'
  ) then
    create policy "own or admin can update time off" on public.time_off
      for update using (
        public.is_workspace_member(time_off.workspace_id)
        and (
          public.is_workspace_admin(time_off.workspace_id)
          or exists (
            select 1
            from public.assignees a
            where a.id = time_off.assignee_id
              and a.workspace_id = time_off.workspace_id
              and a.user_id = auth.uid()
          )
        )
      )
      with check (
        public.is_workspace_member(time_off.workspace_id)
        and (
          public.is_workspace_admin(time_off.workspace_id)
          or exists (
            select 1
            from public.assignees a
            where a.id = time_off.assignee_id
              and a.workspace_id = time_off.workspace_id
              and a.user_id = auth.uid()
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'time_off'
      and policyname = 'own or admin can delete time off'
  ) then
    create policy "own or admin can delete time off" on public.time_off
      for delete using (
        public.is_workspace_member(time_off.workspace_id)
        and (
          public.is_workspace_admin(time_off.workspace_id)
          or exists (
            select 1
            from public.assignees a
            where a.id = time_off.assignee_id
              and a.workspace_id = time_off.workspace_id
              and a.user_id = auth.uid()
          )
        )
      );
  end if;
end $$;

-- Realtime: the timeline subscribes to time_off exactly like tasks and
-- milestones (0046). REPLICA IDENTITY FULL so a DELETE event still carries
-- workspace_id — the subscription filters on it, and the default identity would
-- ship only the primary key, silently dropping every delete.
alter table public.time_off replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'time_off'
     ) then
    alter publication supabase_realtime add table public.time_off;
  end if;
end $$;

-- New table: make PostgREST expose /rest/v1/time_off without a restart.
notify pgrst, 'reload schema';
