-- Phase 7.5 (Project Card): per-project free-form status (e.g. «В работе»,
-- «Заморожен», «Завершен»). Kept as free text rather than a workspace-level
-- enum to ship fast — the project-card sidebar derives the filter list from
-- distinct values currently in use, so adoption can grow organically.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status text;
