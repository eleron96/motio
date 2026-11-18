-- member_groups.color: the colour a team is marked with — the dot beside the
-- owner team in the project list, the team filters, the group list.
--
-- Same shape and the same palette as assignees.color (0135): a #rrggbb value the
-- client picks from PERSON_PRESET_COLORS. NULL means "not chosen": the client
-- hands such a group the next colour nobody claimed, by position in the id-sorted
-- list of groups, so a workspace that never opens the setting still tells its
-- teams apart.
--
-- No function this time. A person's colour needed set_assignee_color() because
-- anybody may recolour themselves without holding UPDATE on assignees. A group
-- has no "self": groups are created, renamed and deleted by workspace admins
-- only, and the existing policy "workspace admins can update member groups"
-- (0023) already says exactly that for this column too. Table grants are the
-- ones member_groups has had since 0023 — a new column needs none of its own.
--
-- Idempotent and self-contained: an EXECUTED changeSet does not prove the object
-- exists, so the column and the constraint are each guarded and safe to re-run.
--
-- Rollback:
--   ALTER TABLE public.member_groups DROP CONSTRAINT IF EXISTS member_groups_color_format;
--   ALTER TABLE public.member_groups DROP COLUMN IF EXISTS color;

alter table public.member_groups
  add column if not exists color text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'member_groups_color_format'
      and conrelid = 'public.member_groups'::regclass
  ) then
    alter table public.member_groups
      add constraint member_groups_color_format
      check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;
