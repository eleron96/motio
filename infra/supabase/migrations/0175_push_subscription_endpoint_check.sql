-- Push subscriptions may only point at the browsers' push services.
--
-- The `push` Edge Function POSTs every notification to the stored endpoint.
-- The endpoint comes from the browser, but a signed-in person can write any
-- text there (the RLS policy of 0118 lets them insert their own rows, and so
-- does upsert_push_subscription) — without a rule the server would send
-- requests wherever it was told, internal services included (SSRF).
--
-- A real endpoint always belongs to the browser vendor's push service: FCM
-- (Chrome, Android and other Chromium browsers), Mozilla (Firefox), Apple
-- (Safari) or WNS (Edge on Windows). The same rule lives in
-- infra/supabase/functions/_shared/pushEndpoint.ts, which the sender checks
-- before every request; keep both identical
-- (tests/integration/push-subscription-endpoint.test.ts compares them).
--
-- Rows that break the rule could never be delivered to: they are removed, so
-- the constraint holds for every row. Browsers re-subscribe on their own.
--
-- Idempotent.
--
-- Rollback:
--   ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_push_service;
--   DROP FUNCTION IF EXISTS public.is_push_service_endpoint(text);

create or replace function public.is_push_service_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Lower-case host right after https:// and then a "/": no user info, no
  -- port, nothing a URL parser could read as another host.
  select length(p_endpoint) <= 2048
     and p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)/';
$$;

-- The CHECK runs as whoever writes the row: the signed-in client and the
-- service role. Nobody else needs it.
revoke all on function public.is_push_service_endpoint(text) from public, anon;
grant execute on function public.is_push_service_endpoint(text) to authenticated, service_role;

delete from public.push_subscriptions
where not public.is_push_service_endpoint(endpoint);

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_push_service;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_push_service
  check (public.is_push_service_endpoint(endpoint));
