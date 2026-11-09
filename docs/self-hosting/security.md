# Security

## What is exposed

From the internet, only Caddy is reachable: ports 80 and 443 in mode `tls`, nothing
at all in mode `proxy`. Everything else (the database, Keycloak's admin port, the
API gateway) listens on the server's own `127.0.0.1` or inside Docker's network.
See [Day to day → Networks](./running.md#networks).

The installer generates every password and secret randomly and writes them to
`.env` with mode `600`, readable by its owner only. There are no default
passwords to change.

## How images are kept up to date

The images Motio runs are chosen and tested together and change with Motio
releases.

- **Pinned.** The Supabase services (`supabase/postgres`, `gotrue`, `realtime`,
  `storage-api`, `edge-runtime`), PostgREST and oauth2-proxy are pinned to exact
  versions. A few images follow a version line instead: `caddy:2.11`,
  `postgres:15-alpine` (Keycloak's database), `keycloak:26.8`, `nginx:1.30-alpine`,
  `liquibase:4.27`. For these, `install.sh update` pulls the latest patch of the
  line.
- **Scanned every week.** The repository checks all of these images for known HIGH
  and CRITICAL vulnerabilities that already have a fix
  ([Image scan](https://github.com/eleron96/motio/actions/workflows/image-scan.yml);
  the report is on the run page). The same check runs on your server with
  `infra/scripts/scan-images.sh` (needs Docker and `jq`).
- **Upgrades come as releases.** A newer image ships in a Motio release, together
  with any data migration it needs, and reaches you through `install.sh update`
  with its backup and rollback.

> [!WARNING]
> Do not upgrade single containers from WUD, Portainer or by hand. A newer
> Keycloak, Postgres or Supabase service can need a migration or break sign-in.

- **Security fixes do not wait.** A fix for a vulnerability that affects Motio
  ships as a release of its own, and its notes say so.

## Staying informed

- On GitHub, open the repository and choose **Watch → Custom → Releases**.
- Advisories are published under the repository's
  [Security](https://github.com/eleron96/motio/security) tab.
- **Admin → System** shows when a newer release is out.

## What is yours to look after

- **The host.** The kernel, Docker and SSH of the server are patched by you;
  container updates do not cover them.
- **`.env` and backup sets.** They hold every secret. Keep copies as safe as the
  server itself.
- **Registration.** It is open after the install; close it once your team is in
  ([Install → Close registration](./install.md#close-registration-optional)).
- **Keycloak's administrator.** Replace the temporary one the installer created
  ([Administrators](./admins.md#replace-the-temporary-keycloak-administrator)).
- **Your reverse proxy**, if you use one: its TLS settings and its own updates.

## Reporting a vulnerability

Privately, please, as described in
[SECURITY.md](https://github.com/eleron96/motio/blob/main/SECURITY.md). Do not open
a public issue for it.
