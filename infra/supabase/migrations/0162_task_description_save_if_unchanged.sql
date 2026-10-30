-- Saving a task description no longer overwrites a teammate's.
--
-- The card used to write the whole description back whatever the row held:
-- two people editing at once, the later save erased the other's text, and the
-- pictures only the other text referenced were then cleaned up as orphans.
-- This writes the new description only while the stored one is still the one
-- the person started from (compared by SHA-256, so a long description never
-- travels in a URL). No row back means somebody changed it meanwhile; the
-- card keeps the draft and asks what to do.
--
-- SECURITY INVOKER: the tasks RLS decides who may update, exactly as for a
-- plain PATCH.

create or replace function public.update_task_description_if_unchanged(
  target_task_id uuid,
  expected_description_sha256 text,
  new_description text
)
returns setof public.tasks
language sql
security invoker
set search_path = public
as $$
  update public.tasks
  set description = new_description
  where id = target_task_id
    and encode(sha256(convert_to(coalesce(description, ''), 'UTF8')), 'hex') = expected_description_sha256
  returning *;
$$;

revoke all on function public.update_task_description_if_unchanged(uuid, text, text) from public, anon;
grant execute on function public.update_task_description_if_unchanged(uuid, text, text) to authenticated, service_role;
