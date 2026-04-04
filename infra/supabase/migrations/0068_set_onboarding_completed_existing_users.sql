-- Mark all existing users as having completed onboarding so the tour
-- only appears for users who register after this migration.
UPDATE public.profiles
SET preferences = COALESCE(preferences, '{}'::jsonb) || '{"onboarding_completed": true}'::jsonb
WHERE (preferences IS NULL)
   OR (preferences->>'onboarding_completed') IS NULL;
