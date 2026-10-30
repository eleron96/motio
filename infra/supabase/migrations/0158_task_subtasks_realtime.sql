-- Realtime for subtasks: an open task card follows its subtasks live, so a
-- teammate's new, ticked or deleted subtask shows up without reopening it.
-- REPLICA IDENTITY FULL so a DELETE event still carries task_id — the card's
-- subscription filters on it, and the default identity would ship only the
-- primary key, silently dropping every delete (same as time_off, 0131).
alter table public.task_subtasks replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'task_subtasks'
     ) then
    alter publication supabase_realtime add table public.task_subtasks;
  end if;
end $$;
