# Motio demo Supabase project

A separate Supabase project dedicated to the public `/demo` sandbox. The
production project is **not** touched by anything in this folder.

## Apply order

1. Apply every prod migration from `infra/supabase/migrations/0001..N.sql`
   to the demo project (same schema as prod — keeps TypeScript types in
   sync, lets the same frontend code work).
2. Apply this folder's files in numeric order:
   - `0001_demo_anonymous_profiles.sql` — let `handle_new_user` accept anon
     sign-ins (anon `auth.users` rows have no email).
   - `0002_demo_template_schema.sql` — `demo_template_*` tables that hold
     the universal seed content used to bootstrap each visitor's workspace.
   - `0003_demo_template_seed.sql` — actual seed rows. Dates stored as
     **relative** offsets in days from "today"; resolved at copy time.
   - `0004_demo_runtime_rpcs.sql` — `seed_demo_workspace`,
     `demo_heartbeat`, `reset_demo_workspace`. Called from the frontend.
   - `0005_demo_cleanup_cron.sql` — periodic job that removes anon users
     (and their cascaded workspace) after 10 minutes without a heartbeat.

## Frontend wiring

- Set `VITE_SUPABASE_URL_DEMO` / `VITE_SUPABASE_ANON_KEY_DEMO` to point at
  this project. The frontend's `supabase` proxy in
  [src/shared/lib/supabaseClient.ts](../../../src/shared/lib/supabaseClient.ts)
  picks the demo client whenever the URL starts with `/demo`.
- Anonymous sign-ins must be enabled in the demo project's Auth settings.

## Cron

`0005_demo_cleanup_cron.sql` registers a `pg_cron` job. Make sure the
`pg_cron` extension is enabled in the demo project (Database → Extensions).

## Why a separate project (and not a demo schema in prod)?

Full isolation: a destructive bug in demo SQL or a runaway cron cannot
touch prod data, prod billing, or prod Auth. Demo can also have looser RLS
and free-tier-friendly limits without compromising the real product.
