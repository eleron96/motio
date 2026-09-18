# Contributing to Motio

Thanks for looking under the hood. Motio is maintained by one person, so the most
useful contributions are, in this order:

1. **A bug report** with steps to reproduce — [open an issue](https://github.com/eleron96/motio/issues/new/choose).
2. **A real situation where Motio got in your way** — describe it in
   [Discussions → Ideas](https://github.com/eleron96/motio/discussions/categories/ideas).
   A described problem is worth more than a proposed feature.
3. **A pull request** — small fixes are welcome straight away; for anything bigger,
   please start a discussion first so the work is not wasted.

Questions go to [Discussions → Q&A](https://github.com/eleron96/motio/discussions/categories/q-a).
Security problem? Don't open a public issue — see [SECURITY.md](./SECURITY.md).

## Before you propose a feature

Motio stays small on purpose. There are no custom fields, no automations, no task
dependencies, no kanban boards and no formula columns — that is a product position,
not a backlog. The [manifesto](./MANIFESTO.md) (in Russian) explains why. Every idea is
checked against three questions:

1. Does it make creating a task faster?
2. Does it help the team see the whole picture?
3. Could my grandfather use it? If not — simplify.

## Development setup

Requirements: **Node.js 20+**, **Docker Desktop**.

```bash
npm install
make up        # full local stack: Postgres, Keycloak, Supabase services, web
```

The app comes up at http://localhost:5173. `make up` generates `.env` with dev
secrets, applies the migrations and syncs Keycloak with Supabase, so there is nothing
to configure by hand. More in [docs/operations.md](docs/operations.md); common errors
are in [docs/troubleshooting.md](docs/troubleshooting.md).

## Making a change

1. Branch off `codex/main-current` and target it with your pull request. That is the
   working branch; `main` mirrors what is released and only receives merges from it.
2. Keep one pull request to one logical change, and add or update tests for any change
   in behaviour.
3. Run the checks CI runs:

   ```bash
   npm run lint
   npm run typecheck
   npm run test
   bash infra/scripts/lint-security-definer.sh
   npm run build
   ```

   When touching RPC, RLS, cron or migrations, also run the database tests:

   ```bash
   bash infra/scripts/ci-test-db.sh
   npm run test:integration
   ```

4. New UI strings go through Lingui: `npm run lingui:extract && npm run lingui:compile`,
   and both `en` and `ru` get a translation. Stale catalogs fail CI and the production
   deploy.
5. Log user-facing changes with
   `make logchange RU="…" EN="…" [TYPE=added|changed|fixed|removed|security]` — it
   writes the entry into the `Unreleased` section of both changelogs. Keep the wording
   plain: what changed for the person using Motio, not which file moved.
6. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(planner): …`, `fix(members): …`, `docs(readme): …`.

Merging deploys nothing: production only goes out through `make deploy`, run by the
maintainer.

## Licence and your contribution

Motio is free software under the [GNU Affero General Public License v3.0](./LICENSE)
(`AGPL-3.0-only`).

By submitting a pull request you agree that your contribution is licensed under that
same licence, and that the copyright holder may also use, modify and distribute it as
part of Motio under other terms — for example, a commercial licence for a company that
cannot use AGPL software — without further permission. You keep the copyright to what
you wrote.
