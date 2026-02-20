alter table if exists public.milestones
  add column if not exists updated_at timestamptz;

update public.milestones
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.milestones
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop trigger if exists milestones_set_updated_at on public.milestones;
create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

create index if not exists milestones_workspace_updated_at_idx
  on public.milestones (workspace_id, updated_at desc);
