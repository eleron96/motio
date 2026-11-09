# Self-hosting Motio

The self-hosting guide now has a page per topic:

- **As a website, with search:** <https://eleron96.github.io/motio/self-hosting/>
- **In the repository** (and in every release tag): [docs/self-hosting/](self-hosting/README.md)

Quick start, on a Linux server with Docker and a domain pointing at it:

```bash
git clone https://github.com/eleron96/motio.git && cd motio
git checkout vX.Y.Z    # the latest release: github.com/eleron96/motio/releases
infra/scripts/install.sh --domain planner.example.com --email you@example.com
```

## Where each part of this page went

Links to the sections of the earlier, single-page guide land here.

| Section | Now |
|---|---|
| <a name="what-you-need"></a>What you need | [Requirements](self-hosting/requirements.md) |
| <a name="install"></a>Install | [Install](self-hosting/install.md) |
| <a name="mode-tls-this-server-is-reachable-from-the-internet-directly"></a><a name="mode-proxy-you-already-run-a-reverse-proxy"></a>Mode `tls`, mode `proxy` | [Install → Pick a mode](self-hosting/install.md#pick-a-mode) |
| <a name="what-the-installer-does"></a>What the installer does | [Install → What the installer does](self-hosting/install.md#what-the-installer-does) |
| <a name="first-sign-in"></a>First sign-in | [Install → Sign in](self-hosting/install.md#sign-in) |
| <a name="super-admins"></a>Super admins | [Administrators](self-hosting/admins.md#super-admins) |
| <a name="replace-keycloaks-temporary-administrator"></a>Replace Keycloak's temporary administrator | [Administrators](self-hosting/admins.md#replace-the-temporary-keycloak-administrator) |
| <a name="update"></a>Update | [Updates and rollback](self-hosting/updates.md) |
| <a name="security-updates"></a>Security updates | [Security](self-hosting/security.md) |
| <a name="everyday-commands"></a>Everyday commands | [Day to day](self-hosting/running.md) |
| <a name="settings"></a>Settings | [Settings](self-hosting/settings.md) |
| <a name="email"></a>Email | [Email](self-hosting/email.md) |
| <a name="your-own-sign-in-authentik-microsoft-entra-id-google-workspace-"></a>Your own sign-in | [Your own sign-in](self-hosting/sign-in.md) |
| <a name="workspaces-from-groups"></a>Workspaces from groups | [People and workspaces](self-hosting/people.md#workspaces-from-groups) |
| <a name="reverse-proxy-examples"></a>Reverse proxy examples | [Reverse proxy](self-hosting/reverse-proxy.md) |
| <a name="without-motios-caddy"></a>Without Motio's Caddy | [Reverse proxy](self-hosting/reverse-proxy.md#your-own-routing-without-caddy) |
| <a name="where-your-data-lives"></a>Where your data lives | [Backups and restore](self-hosting/backups.md#where-your-data-lives) |
| <a name="backups"></a>Backups | [Backups and restore](self-hosting/backups.md) |
| <a name="backup-sets"></a>Backup sets | [Backups and restore](self-hosting/backups.md#backup-sets) |
| <a name="portainer-whats-up-docker-beszel"></a>Portainer, What's Up Docker, Beszel | [Day to day](self-hosting/running.md#portainer-wud-and-beszel) |
| <a name="your-own-additions"></a>Your own additions | [Day to day](self-hosting/running.md#your-own-additions) |
| <a name="uninstall"></a>Uninstall | [Day to day](self-hosting/running.md#uninstall) |
| <a name="limits"></a>Limits | [FAQ and limits](self-hosting/faq.md#limits) |
