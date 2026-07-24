-- Welcome email bookkeeping: stamped when the one-time greeting is sent
-- after a user's first sign-in. The mailer edge function claims the send
-- atomically (UPDATE ... WHERE welcome_email_sent_at IS NULL).
alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;

-- Accounts that existed before this feature must never receive the greeting:
-- mark them as already sent, so only genuinely new users get the email.
update public.profiles
  set welcome_email_sent_at = created_at
  where welcome_email_sent_at is null;
