---
layout: home
title: Self-hosting Motio
titleTemplate: false
editLink: false

hero:
  name: Motio
  text: on your own server
  tagline: The team planner under your domain, with your company's sign-in. One command installs it, one updates it, and every update can be rolled back.
  image:
    src: /mark.png
    alt: ''
  actions:
    - theme: brand
      text: Get started
      link: /overview
    - theme: alt
      text: Install
      link: /install
    - theme: alt
      text: Releases
      link: https://github.com/eleron96/motio/releases

features:
  - title: One command to install
    details: Generates every secret, starts the stack in the right order, and gets the HTTPS certificate itself or sits behind the proxy you already run.
    link: /install
    linkText: Install
  - title: Updates you can undo
    details: A full backup of the install before every update. If anything goes wrong, one command puts the previous release and all data back.
    link: /updates
    linkText: Updates and rollback
  - title: Your company's sign-in
    details: Authentik, Microsoft Entra ID, Google Workspace or any OIDC provider through Keycloak. Groups can decide who is in which workspace.
    link: /sign-in
    linkText: Your own sign-in
  - title: Works without email
    details: Invitations wait in Motio for whoever signs in with that address. Add SMTP when you are ready for emailed links and password resets.
    link: /people
    linkText: People and workspaces
  - title: Backups built in
    details: Nightly backups while Motio runs, optional encrypted copies in S3, and full backup sets to restore or move to another server.
    link: /backups
    linkText: Backups and restore
  - title: Nothing leaves your server
    details: No analytics, no error reports. The only outgoing request is an optional check for new releases on GitHub.
    link: /settings
    linkText: Settings
---

<div class="home-quickstart">

## Quick start

On a Linux server with Docker and a domain pointing at it:

```bash
git clone https://github.com/eleron96/motio.git && cd motio
git checkout vX.Y.Z    # the latest release
infra/scripts/install.sh --domain planner.example.com --email you@example.com
```

About 15 minutes later Motio answers at `https://planner.example.com`.
[Read the guide →](/overview)

</div>
