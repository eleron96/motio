-- Make broadcast delivery concurrency-safe. Two processors run the queue: the
-- admin tab's process loop (immediate feedback) and the backup-service cron
-- ticker (scheduled sends + resume). Without an atomic claim they could grab
-- the same 'pending' rows and email a recipient twice. This adds:
--  * a 'sending'/'skipped' recipient status and a claimed_at stamp;
--  * claim_broadcast_recipients(): an atomic FOR UPDATE SKIP LOCKED batch claim
--    that also reclaims rows stuck 'sending' (a crashed processor) after 10 min.

alter table public.email_broadcast_recipients
  add column if not exists claimed_at timestamptz;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'email_broadcast_recipients_status_check'
      and conrelid = 'public.email_broadcast_recipients'::regclass
  ) then
    alter table public.email_broadcast_recipients
      drop constraint email_broadcast_recipients_status_check;
  end if;

  alter table public.email_broadcast_recipients
    add constraint email_broadcast_recipients_status_check
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped'));
end $$;

create or replace function public.claim_broadcast_recipients(
  p_broadcast_id uuid,
  p_limit integer
)
returns table (id uuid, user_id uuid, email text)
language sql
security definer
set search_path = public
as $$
  update public.email_broadcast_recipients r
  set status = 'sending', claimed_at = now()
  where r.id in (
    select er.id
    from public.email_broadcast_recipients er
    where er.broadcast_id = p_broadcast_id
      and (
        er.status = 'pending'
        or (er.status = 'sending' and er.claimed_at < now() - interval '10 minutes')
      )
    order by er.id
    for update skip locked
    limit greatest(1, least(p_limit, 200))
  )
  returning r.id, r.user_id, r.email;
$$;

-- This function mutates the send queue, so only the service role (the admin
-- edge function) may call it — never authenticated/anon users via PostgREST rpc.
revoke execute on function public.claim_broadcast_recipients(uuid, integer) from public;
revoke execute on function public.claim_broadcast_recipients(uuid, integer) from anon;
revoke execute on function public.claim_broadcast_recipients(uuid, integer) from authenticated;
grant execute on function public.claim_broadcast_recipients(uuid, integer) to service_role;
