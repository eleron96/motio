-- Extend access_token_expires_at for all non-revoked task media.
--
-- Why: image URLs are baked into task description HTML together with their
-- access token. The Edge Function rejects requests once
-- `access_token_expires_at` is in the past, so images in old tasks render
-- as broken — the row is fine, only the token window has lapsed. There is
-- no client-side refresh path today.
--
-- This bumps every non-revoked record far into the future so existing URLs
-- keep working. Revoked tokens are left alone so explicit revocations
-- continue to be honored.

UPDATE public.task_media
SET access_token_expires_at = now() + interval '10 years'
WHERE access_token_revoked_at IS NULL
  AND access_token_expires_at < now() + interval '10 years';
