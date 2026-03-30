-- Fix: ON DELETE SET NULL on composite FK was nullifying both group_id AND
-- workspace_id, violating the NOT NULL constraint on workspace_id.
-- Re-create the constraint so that only group_id is set to NULL.

alter table public.workspace_members
  drop constraint if exists workspace_members_group_id_fkey;

alter table public.workspace_members
  add constraint workspace_members_group_id_fkey
  foreign key (group_id, workspace_id)
  references public.member_groups (id, workspace_id)
  on delete set null (group_id);
