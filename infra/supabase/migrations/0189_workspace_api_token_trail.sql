-- Workspace API tokens leave a trail.
--
--   1. Creating and revoking a token is written to the workspace's history
--      (workspace_member_activity, the "History" tab of Members and access):
--      who did it, the token's name and what it may do. Until now only
--      created_by on the token row knew, and a revoked token vanished from the
--      list without a trace. The rows are written here, inside the SECURITY
--      DEFINER functions, so a client cannot forge or skip them.
--   2. api_token_access also returns the token's display prefix
--      ("motio_1a2b3c4d", the same one the settings show), so a log line of
--      the API and of the MCP server says which token made the request. The
--      prefix is 8 of the token's 64 hex characters: enough to tell tokens
--      apart, useless for guessing one.
--
-- Idempotent: the constraint is dropped and re-added, functions are replaced
-- (api_token_access is dropped first: its return type changes).
--
-- Rollback: re-run create_workspace_api_token / api_token_access from 0187 and
-- revoke_workspace_api_token from 0156; the two extra actions in the check
-- constraint can stay.

alter table public.workspace_member_activity
  drop constraint if exists workspace_member_activity_action_check;

alter table public.workspace_member_activity
  add constraint workspace_member_activity_action_check check (
    action in (
      'invite_created',
      'member_role_changed',
      'member_group_changed',
      'member_removed',
      'member_status_changed',
      'group_created',
      'group_renamed',
      'group_deleted',
      'api_token_created',
      'api_token_revoked'
    )
  );

-- The caller as the history shows people: profile name, else email.
create or replace function public.workspace_activity_actor_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.email), ''))
       from public.profiles p where p.id = p_user_id),
    'Unknown user'
  );
$$;

revoke all on function public.workspace_activity_actor_label(uuid) from public, anon, authenticated;

create or replace function public.create_workspace_api_token(
  p_workspace_id uuid,
  p_name text,
  p_scopes text[] default array['time_off']::text[]
)
returns table (id uuid, name text, token text, token_prefix text, created_at timestamptz, scopes text[])
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_scopes text[];
  v_token text;
  v_row public.workspace_api_tokens%rowtype;
begin
  if auth.uid() is null or not public.is_workspace_admin(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'API_TOKEN_NAME_INVALID' using errcode = '22023';
  end if;

  -- Distinct and in a fixed order, so two tokens with the same rights look the same.
  select coalesce(array_agg(distinct s order by s), array[]::text[]) into v_scopes
  from unnest(coalesce(p_scopes, array[]::text[])) as s;
  if cardinality(v_scopes) = 0 or not (v_scopes <@ array['time_off', 'read']::text[]) then
    raise exception 'API_TOKEN_SCOPES_INVALID' using errcode = '22023';
  end if;

  if (select count(*) from public.workspace_api_tokens t
      where t.workspace_id = p_workspace_id and t.revoked_at is null) >= 10 then
    raise exception 'API_TOKEN_LIMIT' using errcode = '54000';
  end if;

  -- Two v4 UUIDs: 244 random bits, hex only, so the token is safe in headers.
  v_token := 'motio_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.workspace_api_tokens (workspace_id, name, token_prefix, token_hash, created_by, scopes)
  values (
    p_workspace_id,
    v_name,
    left(v_token, 14),
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    auth.uid(),
    v_scopes
  )
  returning * into v_row;

  insert into public.workspace_member_activity (workspace_id, action, actor_user_id, actor_label, details)
  values (
    p_workspace_id,
    'api_token_created',
    auth.uid(),
    public.workspace_activity_actor_label(auth.uid()),
    jsonb_build_object('tokenName', v_row.name, 'tokenScopes', to_jsonb(v_row.scopes))
  );

  -- The only moment the plain token exists outside the caller's hands.
  return query select v_row.id, v_row.name, v_token, v_row.token_prefix, v_row.created_at, v_row.scopes;
end;
$$;

revoke all on function public.create_workspace_api_token(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.create_workspace_api_token(uuid, text, text[]) to authenticated;

create or replace function public.revoke_workspace_api_token(p_token_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row public.workspace_api_tokens%rowtype;
begin
  select * into v_row
  from public.workspace_api_tokens t
  where t.id = p_token_id;

  if v_row.id is null or auth.uid() is null or not public.is_workspace_admin(v_row.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Revoking twice changes nothing and is recorded once.
  if v_row.revoked_at is not null then
    return;
  end if;

  update public.workspace_api_tokens set revoked_at = now() where id = p_token_id;

  insert into public.workspace_member_activity (workspace_id, action, actor_user_id, actor_label, details)
  values (
    v_row.workspace_id,
    'api_token_revoked',
    auth.uid(),
    public.workspace_activity_actor_label(auth.uid()),
    jsonb_build_object('tokenName', v_row.name, 'tokenScopes', to_jsonb(v_row.scopes))
  );
end;
$$;

revoke all on function public.revoke_workspace_api_token(uuid) from public, anon, authenticated;
grant execute on function public.revoke_workspace_api_token(uuid) to authenticated;

drop function if exists public.api_token_access(text);

create function public.api_token_access(p_token_hash text)
returns table (workspace_id uuid, scopes text[], token_prefix text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_workspace_id uuid;
  v_scopes text[];
  v_prefix text;
  v_last_used timestamptz;
begin
  select t.id, t.workspace_id, t.scopes, t.token_prefix, t.last_used_at
    into v_id, v_workspace_id, v_scopes, v_prefix, v_last_used
  from public.workspace_api_tokens t
  where t.token_hash = lower(p_token_hash) and t.revoked_at is null;

  if v_id is null then
    return;
  end if;

  if v_last_used is null or v_last_used < now() - interval '1 minute' then
    update public.workspace_api_tokens set last_used_at = now() where id = v_id;
  end if;

  return query select v_workspace_id, v_scopes, v_prefix;
end;
$$;

revoke all on function public.api_token_access(text) from public, anon, authenticated;
grant execute on function public.api_token_access(text) to service_role;
