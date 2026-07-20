-- push_subscriptions (0118) was created owned by supabase_admin, so it did NOT
-- inherit the Supabase default privileges that grant authenticated/service_role
-- access to public tables — those defaults only fire for tables owned by the
-- postgres role (compare public.user_notifications, which has them). Without
-- these grants:
--   * the push edge function (service_role) can't read subscriptions to send, and
--   * the client (authenticated) can't delete its own row on unsubscribe.
-- Row visibility is still gated by the RLS policy from 0118 (user_id = auth.uid()
-- for authenticated; service_role bypasses RLS to fan out to every device).
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
