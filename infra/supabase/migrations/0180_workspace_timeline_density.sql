-- Timeline density of a workspace: normal, small photos or compact.
--
-- Used only with the server setting timeline.density (Admin → Settings, off by
-- default): then a workspace admin picks it in the workspace settings and it
-- applies to everyone in the workspace on a computer (phones keep the usual
-- layout). With the setting off nobody reads the column, and every workspace
-- starts at 'normal' — the timeline as it always was.
--
-- Written like the other workspace display settings (heatmap_enabled, …):
-- through the existing "workspace admins can update workspaces" policy.
--
-- Idempotent.
--
-- Rollback:
--   ALTER TABLE public.workspaces DROP COLUMN IF EXISTS timeline_density;

alter table public.workspaces
  add column if not exists timeline_density text not null default 'normal';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspaces_timeline_density_check'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_timeline_density_check
      check (timeline_density in ('normal', 'small_photos', 'compact'));
  end if;
end $$;
