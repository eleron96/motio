-- Browser push notifications (opt-in). Two pieces of storage:
--   * profiles.push_notifications_opt_in — the per-user master switch, mirroring
--     the marketing_emails_opt_in opt-in pattern (0114). Per-event toggles live
--     as keys in the existing profiles.preferences JSONB, not columns.
--   * push_subscriptions — one row per browser/device endpoint the user granted
--     the Notification permission on. The Web Push endpoint + its p256dh/auth
--     keys are what the server encrypts payloads for.

alter table public.profiles
  add column if not exists push_notifications_opt_in boolean not null default false;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- The browser client owns its own subscription rows: it inserts on opt-in and
-- deletes on opt-out. Scoped strictly to the authenticated user.
drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions"
  on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A push endpoint is tied to the browser + service-worker + VAPID key, NOT to a
-- user account: if a second account signs in on the same browser, pushManager
-- returns the SAME endpoint. A plain client upsert would then hit the unique
-- constraint against the first account's row, which RLS forbids updating. This
-- SECURITY DEFINER upsert reassigns the endpoint to the current caller (user_id
-- is taken from auth.uid(), never from the client), so the last signed-in
-- account owns the device. Callers still can only ever claim it for themselves.
create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent, now())
  on conflict (endpoint) do update
    set user_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_used_at = now();
end;
$$;

revoke execute on function public.upsert_push_subscription(text, text, text, text) from public;
revoke execute on function public.upsert_push_subscription(text, text, text, text) from anon;
grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;
