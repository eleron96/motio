-- Import of absences from an external system (time tracking, HR) over a small API.
--
-- A workspace admin creates an API token in the workspace settings. The token is
-- shown once; the database keeps only its SHA-256 hash and a short prefix for
-- display. The token can do exactly one thing: list, create/update and delete
-- the time_off records of its own workspace through the Edge Function `api`.
--
-- Pieces:
--   * workspace_api_tokens — no client access at all: RLS on, no policies, no
--     grants for anon/authenticated. Only service_role (the Edge Function) and
--     the admin RPCs below touch it.
--   * time_off.external_id — the record id in the external system. The API
--     upserts by (workspace_id, external_id) and only ever touches records that
--     carry one; records people enter by hand have none and stay untouched.
--     Clients cannot set or change it (guard trigger), so a person cannot point
--     the import at a record they typed in themselves.
--   * Admin RPCs (SECURITY DEFINER, admin of the workspace only):
--     create_workspace_api_token / list_workspace_api_tokens /
--     revoke_workspace_api_token.
--   * API functions (SECURITY INVOKER, EXECUTE for service_role only):
--     api_token_workspace / api_list_time_off / api_upsert_time_off /
--     api_delete_time_off. The existing time_off triggers keep working as they
--     are: workspace from the assignee, no overlapping periods (23P01).
--
-- Idempotent: every object is guarded or created with "or replace".
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.api_delete_time_off(uuid, text);
--   DROP FUNCTION IF EXISTS public.api_upsert_time_off(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.api_list_time_off(uuid, date, date);
--   DROP FUNCTION IF EXISTS public.api_token_workspace(text);
--   DROP FUNCTION IF EXISTS public.revoke_workspace_api_token(uuid);
--   DROP FUNCTION IF EXISTS public.list_workspace_api_tokens(uuid);
--   DROP FUNCTION IF EXISTS public.create_workspace_api_token(uuid, text);
--   DROP TRIGGER IF EXISTS time_off_guard_external_id ON public.time_off;
--   DROP FUNCTION IF EXISTS public.time_off_guard_external_id();
--   DROP INDEX IF EXISTS public.time_off_workspace_external_id_key;
--   ALTER TABLE public.time_off DROP COLUMN IF EXISTS external_id;
--   DROP TABLE IF EXISTS public.workspace_api_tokens;

-- ────────────────────────── tokens ──────────────────────────

create table if not exists public.workspace_api_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  token_prefix text not null,
  token_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_api_tokens_name_check'
      and conrelid = 'public.workspace_api_tokens'::regclass
  ) then
    alter table public.workspace_api_tokens
      add constraint workspace_api_tokens_name_check
      check (length(trim(name)) between 1 and 80);
  end if;
end $$;

create unique index if not exists workspace_api_tokens_hash_key
  on public.workspace_api_tokens (token_hash);

create index if not exists workspace_api_tokens_workspace_idx
  on public.workspace_api_tokens (workspace_id);

alter table public.workspace_api_tokens enable row level security;

-- No policies on purpose. The table is created by supabase_admin on test/prod
-- (no default grants) but by postgres on dev/CI (default grants to anon and
-- authenticated) — revoke explicitly so every environment ends up the same.
revoke all on public.workspace_api_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_api_tokens to service_role;

-- ────────────────────────── time_off.external_id ──────────────────────────

alter table public.time_off add column if not exists external_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'time_off_external_id_check'
      and conrelid = 'public.time_off'::regclass
  ) then
    alter table public.time_off
      add constraint time_off_external_id_check
      check (external_id is null or length(external_id) between 1 and 200);
  end if;
end $$;

create unique index if not exists time_off_workspace_external_id_key
  on public.time_off (workspace_id, external_id)
  where external_id is not null;

-- Clients (the app, PostgREST under a user session) may not set or change the
-- external id; the API functions run as service_role and pass. Same shape as
-- guard_workspace_owner_id (0093): SECURITY INVOKER, keyed on current_user.
create or replace function public.time_off_guard_external_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.external_id is distinct from (case when tg_op = 'UPDATE' then old.external_id end)
  then
    raise exception 'time_off.external_id is managed by the import API'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists time_off_guard_external_id on public.time_off;
create trigger time_off_guard_external_id
  before insert or update on public.time_off
  for each row execute function public.time_off_guard_external_id();

-- ────────────────────────── admin RPCs ──────────────────────────

create or replace function public.create_workspace_api_token(p_workspace_id uuid, p_name text)
returns table (id uuid, name text, token text, token_prefix text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_token text;
  v_row public.workspace_api_tokens%rowtype;
begin
  if auth.uid() is null or not public.is_workspace_admin(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'API_TOKEN_NAME_INVALID' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_api_tokens t
      where t.workspace_id = p_workspace_id and t.revoked_at is null) >= 10 then
    raise exception 'API_TOKEN_LIMIT' using errcode = '54000';
  end if;

  -- Two v4 UUIDs: 244 random bits, hex only, so the token is safe in headers.
  v_token := 'motio_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.workspace_api_tokens (workspace_id, name, token_prefix, token_hash, created_by)
  values (
    p_workspace_id,
    v_name,
    left(v_token, 14),
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    auth.uid()
  )
  returning * into v_row;

  -- The only moment the plain token exists outside the caller's hands.
  return query select v_row.id, v_row.name, v_token, v_row.token_prefix, v_row.created_at;
end;
$$;

revoke all on function public.create_workspace_api_token(uuid, text) from public, anon, authenticated;
grant execute on function public.create_workspace_api_token(uuid, text) to authenticated;

create or replace function public.list_workspace_api_tokens(p_workspace_id uuid)
returns table (id uuid, name text, token_prefix text, created_at timestamptz, last_used_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_workspace_admin(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select t.id, t.name, t.token_prefix, t.created_at, t.last_used_at
  from public.workspace_api_tokens t
  where t.workspace_id = p_workspace_id and t.revoked_at is null
  order by t.created_at desc;
end;
$$;

revoke all on function public.list_workspace_api_tokens(uuid) from public, anon, authenticated;
grant execute on function public.list_workspace_api_tokens(uuid) to authenticated;

create or replace function public.revoke_workspace_api_token(p_token_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_workspace_id uuid;
begin
  select t.workspace_id into v_workspace_id
  from public.workspace_api_tokens t
  where t.id = p_token_id;

  if v_workspace_id is null or auth.uid() is null or not public.is_workspace_admin(v_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.workspace_api_tokens
  set revoked_at = coalesce(revoked_at, now())
  where id = p_token_id;
end;
$$;

revoke all on function public.revoke_workspace_api_token(uuid) from public, anon, authenticated;
grant execute on function public.revoke_workspace_api_token(uuid) to authenticated;

-- ────────────────────────── API functions (service_role) ──────────────────────────

-- The workspace of an active token, given the SHA-256 hex of the token (the Edge
-- Function hashes it; the plain token never reaches the database on use).
-- last_used_at is written at most once a minute to keep the hot path cheap.
create or replace function public.api_token_workspace(p_token_hash text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_workspace_id uuid;
  v_last_used timestamptz;
begin
  select t.id, t.workspace_id, t.last_used_at
    into v_id, v_workspace_id, v_last_used
  from public.workspace_api_tokens t
  where t.token_hash = lower(p_token_hash) and t.revoked_at is null;

  if v_id is null then
    return null;
  end if;

  if v_last_used is null or v_last_used < now() - interval '1 minute' then
    update public.workspace_api_tokens set last_used_at = now() where id = v_id;
  end if;

  return v_workspace_id;
end;
$$;

revoke all on function public.api_token_workspace(text) from public, anon, authenticated;
grant execute on function public.api_token_workspace(text) to service_role;

-- Time off of one workspace overlapping [p_from, p_to] (either bound optional),
-- with the person's account email where the row belongs to a member.
create or replace function public.api_list_time_off(p_workspace_id uuid, p_from date, p_to date)
returns table (
  id uuid,
  external_id text,
  email text,
  person text,
  start_date date,
  end_date date,
  note text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select o.id, o.external_id, p.email, a.name, o.start_date, o.end_date, o.note, o.updated_at
  from public.time_off o
  join public.assignees a on a.id = o.assignee_id
  left join public.profiles p on p.id = a.user_id
  where o.workspace_id = p_workspace_id
    and (p_from is null or o.end_date >= p_from)
    and (p_to is null or o.start_date <= p_to)
  order by o.start_date, o.end_date, o.id
  limit 5000;
$$;

revoke all on function public.api_list_time_off(uuid, date, date) from public, anon, authenticated;
grant execute on function public.api_list_time_off(uuid, date, date) to service_role;

-- Create or update time off by external id. p_items is a JSON array of
-- {external_id, email, start_date, end_date, note?}. Every item gets its own
-- result, in order: {external_id, status: created|updated|unchanged|error,
-- id?, error?}. One bad item never rolls back the others.
create or replace function public.api_upsert_time_off(p_workspace_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_external_id text;
  v_email text;
  v_note text;
  v_start date;
  v_end date;
  v_assignee_id uuid;
  v_existing public.time_off%rowtype;
  v_id uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'API_ITEMS_NOT_ARRAY' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'API_TOO_MANY_ITEMS' using errcode = '54000';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_external_id := nullif(trim(coalesce(v_item->>'external_id', '')), '');
    v_email := lower(trim(coalesce(v_item->>'email', '')));
    v_note := nullif(trim(coalesce(v_item->>'note', '')), '');

    if jsonb_typeof(v_item) is distinct from 'object' or v_external_id is null or length(v_external_id) > 200 then
      v_results := v_results || jsonb_build_object(
        'external_id', v_external_id, 'status', 'error', 'error', 'INVALID_EXTERNAL_ID');
      continue;
    end if;

    if v_note is not null and length(v_note) > 1000 then
      v_results := v_results || jsonb_build_object(
        'external_id', v_external_id, 'status', 'error', 'error', 'INVALID_NOTE');
      continue;
    end if;

    begin
      if coalesce(v_item->>'start_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
         or coalesce(v_item->>'end_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception using errcode = '22007';
      end if;
      v_start := (v_item->>'start_date')::date;
      v_end := (v_item->>'end_date')::date;
    exception when others then
      v_results := v_results || jsonb_build_object(
        'external_id', v_external_id, 'status', 'error', 'error', 'INVALID_DATES');
      continue;
    end;

    if v_end < v_start then
      v_results := v_results || jsonb_build_object(
        'external_id', v_external_id, 'status', 'error', 'error', 'INVALID_DATES');
      continue;
    end if;

    -- The person: a member of this workspace with this account email, and their
    -- row on the timeline. People without an account cannot be matched.
    select a.id into v_assignee_id
    from public.workspace_members wm
    join public.profiles p on p.id = wm.user_id
    join public.assignees a on a.user_id = wm.user_id and a.workspace_id = wm.workspace_id
    where wm.workspace_id = p_workspace_id
      and lower(p.email) = v_email
    order by a.created_at
    limit 1;

    if v_assignee_id is null then
      v_results := v_results || jsonb_build_object(
        'external_id', v_external_id, 'status', 'error', 'error', 'PERSON_NOT_FOUND');
      continue;
    end if;

    select * into v_existing
    from public.time_off o
    where o.workspace_id = p_workspace_id and o.external_id = v_external_id;

    begin
      if v_existing.id is null then
        insert into public.time_off (workspace_id, assignee_id, start_date, end_date, note, external_id)
        values (p_workspace_id, v_assignee_id, v_start, v_end, v_note, v_external_id)
        returning time_off.id into v_id;
        v_results := v_results || jsonb_build_object(
          'external_id', v_external_id, 'status', 'created', 'id', v_id);
      elsif v_existing.assignee_id = v_assignee_id
            and v_existing.start_date = v_start
            and v_existing.end_date = v_end
            and v_existing.note is not distinct from v_note then
        v_results := v_results || jsonb_build_object(
          'external_id', v_external_id, 'status', 'unchanged', 'id', v_existing.id);
      else
        update public.time_off
        set assignee_id = v_assignee_id, start_date = v_start, end_date = v_end, note = v_note
        where time_off.id = v_existing.id;
        v_results := v_results || jsonb_build_object(
          'external_id', v_external_id, 'status', 'updated', 'id', v_existing.id);
      end if;
    exception
      when exclusion_violation then
        v_results := v_results || jsonb_build_object(
          'external_id', v_external_id, 'status', 'error', 'error', 'OVERLAP');
      when check_violation then
        v_results := v_results || jsonb_build_object(
          'external_id', v_external_id, 'status', 'error', 'error', 'INVALID_DATES');
    end;
  end loop;

  return v_results;
end;
$$;

revoke all on function public.api_upsert_time_off(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.api_upsert_time_off(uuid, jsonb) to service_role;

-- Delete one imported record. Records without an external id cannot be reached.
create or replace function public.api_delete_time_off(p_workspace_id uuid, p_external_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.time_off o
  where o.workspace_id = p_workspace_id
    and o.external_id is not null
    and o.external_id = p_external_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.api_delete_time_off(uuid, text) from public, anon, authenticated;
grant execute on function public.api_delete_time_off(uuid, text) to service_role;
