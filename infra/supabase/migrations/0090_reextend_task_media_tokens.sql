-- Re-extend access_token_expires_at for task media that broke again after 0089.
--
-- 0089 extended the backlog once, but the effective token TTL stayed at 7 days
-- (docker-compose default ${TASK_MEDIA_TOKEN_TTL_SECONDS:-604800}), so every
-- image uploaded after 0089 expired within a week and rendered as broken. This
-- release fixes the forward default to 10 years in compose/.env.example; this
-- migration revives the records that expired in the meantime. 0089 itself
-- cannot rerun (already recorded by Liquibase), hence a fresh changeset.
-- Revoked tokens are left untouched so explicit revocations stay honored.

UPDATE public.task_media
SET access_token_expires_at = now() + interval '10 years'
WHERE access_token_revoked_at IS NULL
  AND access_token_expires_at < now() + interval '10 years';
