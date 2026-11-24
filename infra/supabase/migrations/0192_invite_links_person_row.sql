-- People without an account (server setting people.withoutAccount, off by
-- default): a workspace admin adds a person to the timeline by name — a row in
-- public.assignees with no user behind it — and may later invite that very
-- person. When the invitation is accepted the new member takes over the row,
-- with every task and day off already on it, instead of getting a second,
-- empty one beside it.
--
-- The invitation remembers the row (workspace_invites.assignee_id). The
-- membership trigger does the hand-over, so every way of becoming a member —
-- accepting an invitation, being added by a super admin, a Keycloak group —
-- behaves the same.
--
-- Nothing changes for an invitation without a row, which is every invitation
-- made so far.
--
-- Rollback:
--   restore public.sync_member_assignee() from 0094;
--   ALTER TABLE public.workspace_invites DROP COLUMN IF EXISTS assignee_id;

alter table public.workspace_invites
  add column if not exists assignee_id uuid references public.assignees(id) on delete set null;

create index if not exists workspace_invites_assignee_idx
  on public.workspace_invites (assignee_id) where assignee_id is not null;

create or replace function public.sync_member_assignee()
returns trigger as $$
declare
  profile_email text;
  profile_name text;
  linked_assignee_id uuid;
begin
  select email, display_name
    into profile_email, profile_name
  from public.profiles
  where id = new.user_id;

  -- A person who already has a row here (a returning member) keeps it: the
  -- hand-over below is only for someone new to the workspace.
  if not exists (
    select 1 from public.assignees a
    where a.workspace_id = new.workspace_id and a.user_id = new.user_id
  ) then
    -- The row named by a live invitation to this person's email. It must
    -- belong to this workspace, still have nobody behind it and not be one of
    -- the sample colleagues. The newest invitation wins; the row is locked so
    -- two people accepting at once cannot both take it.
    select a.id
      into linked_assignee_id
    from public.workspace_invites i
    join public.assignees a on a.id = i.assignee_id
    where i.workspace_id = new.workspace_id
      and i.email_normalized = lower(trim(profile_email))
      and i.revoked_at is null
      and a.workspace_id = new.workspace_id
      and a.user_id is null
      and a.is_sample is not true
    order by i.created_at desc
    limit 1
    for update of a;

    if linked_assignee_id is not null then
      -- The name the admin typed stays unless the person has set their own:
      -- a fresh account has none, and its email is not a name.
      update public.assignees
         set user_id = new.user_id,
             is_active = true,
             name = coalesce(nullif(trim(profile_name), ''), name)
       where id = linked_assignee_id;
      return new;
    end if;
  end if;

  insert into public.assignees (workspace_id, user_id, name)
  values (new.workspace_id, new.user_id, coalesce(profile_name, profile_email, 'Member'))
  on conflict (workspace_id, user_id)
  do update set name = excluded.name, is_active = true;

  return new;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.sync_member_assignee() from public, anon, authenticated;
