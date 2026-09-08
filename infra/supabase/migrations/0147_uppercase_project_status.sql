-- Free-form project status (0087) is rendered in caps everywhere in the UI, but
-- until now only the settings dialog normalized what it stored — the create
-- dialog, the inline chip in the card header and the mobile sheet all saved the
-- text exactly as typed. That left mixed-case rows that look identical on screen
-- (CSS uppercase) yet differ as data: the raw value shows through in
-- title/aria-label, and grouping or filtering by status splits «в работе» from
-- «В РАБОТЕ».
--
-- The clients now normalize on every entry point; this brings existing rows in
-- line. Idempotent: rows already normalized are skipped, so a re-run is a no-op.

UPDATE public.projects
SET status = nullif(upper(btrim(status)), '')
WHERE status IS NOT NULL
  AND status IS DISTINCT FROM nullif(upper(btrim(status)), '');
