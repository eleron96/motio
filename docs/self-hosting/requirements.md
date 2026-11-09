# Requirements

## The server

| | Minimum | Comfortable |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| Memory | 3 GB (the first build is slow) | 4 GB or more |
| Free disk | 15 GB | 15 GB plus twice your database and uploaded files, for backups |
| System | Linux with Docker | |

Every container has a memory limit sized for a 4 GB server. The first install
builds the web app on the server, which is the slowest and hungriest step.

## Software

- **Docker** with **Compose v2.24 or newer**: `docker compose version`.
- `git`, `python3`, `openssl` and `curl`. Most distributions have them already.
- Root is not required. A user in the `docker` group can install, update and
  restore.

## A domain

A name such as `planner.example.com`, with an A (or AAAA) record pointing at the
server. Motio serves one domain at its root; a sub-path like
`example.com/motio` is not supported.

## Ports

It depends on how the server is reached (details in [Install](./install.md)):

| Mode | Open to the internet | Local only |
|---|---|---|
| `tls`: Motio gets the certificate itself | 80 and 443 | |
| `proxy`: behind your reverse proxy | nothing | Caddy on `127.0.0.1:8088` (or your proxy's Docker network) |
| Either | | the API gateway and Keycloak on `127.0.0.1:8080` / `8081`, used by the installer |

## Optional

- **An SMTP account** for email: invitation emails, password resets, the welcome
  email. Motio works without it, invitations included; see [Email](./email.md).
- **Your identity provider** (Authentik, Entra ID, Google Workspace…) if people
  should sign in with their company accounts; see [Your own sign-in](./sign-in.md).
- **An S3 bucket** for encrypted off-site copies of the nightly backups; see
  [Backups and restore](./backups.md).

Next: [Install](./install.md).
