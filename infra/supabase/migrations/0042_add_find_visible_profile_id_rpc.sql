create or replace function public.find_visible_profile_id_by_email(p_email text)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select p.id
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1
$$;

grant execute on function public.find_visible_profile_id_by_email(text) to authenticated;
