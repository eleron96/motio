-- Demo project only. Production handle_new_user assumes auth.users.email
-- is non-null because real users sign up with email. Supabase anonymous
-- sign-ins create auth.users rows with email = null, which would violate
-- profiles.email NOT NULL.
--
-- We replace handle_new_user with a version that synthesizes a placeholder
-- email and a friendly default display_name for anon users. Real-user
-- behavior is preserved (anon column is false → original branch).

create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_anon boolean := coalesce(new.is_anonymous, false);
  fallback_email text;
  fallback_name text;
begin
  if is_anon then
    fallback_email := 'demo-' || replace(new.id::text, '-', '') || '@demo.local';
    fallback_name  := 'Demo Visitor';
  else
    fallback_email := new.email;
    fallback_name  := null;
  end if;

  insert into public.profiles (id, email, display_name)
  values (new.id, fallback_email, fallback_name);

  return new;
end;
$$ language plpgsql security definer set search_path = public, auth set row_security = off;
