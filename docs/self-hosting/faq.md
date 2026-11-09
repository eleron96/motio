# FAQ and limits

## Short answers

**Does it cost anything?**
No. Motio is open source under
[AGPL-3.0](https://github.com/eleron96/motio/blob/main/LICENSE): you can run it for
your company for free. If you change Motio and let others use your changed version
over the network, publish your changes under the same license.

**Does my install send anything to you?**
No. No analytics, no error reports, no usage counts. The only request leaving your
server is the check for a newer release on GitHub, at most every 6 hours, and
`MOTIO_UPDATE_CHECK=false` turns it off ([Settings](./settings.md)).

**How many people can use it?**
Motio sets no limit on the number of people. One account can be in up to five
workspaces. Server sizes: [Requirements](./requirements.md).

**Which languages?**
English, German and Russian. Everyone picks their own in the profile.

**Is there a mobile app?**
Motio is a web app that works on phones. Added to the home screen, it opens like an
app and can show push notifications, on iPhone too (iOS 16.4 or newer).

**Can I use my existing PostgreSQL or Keycloak?**
No. The installer runs its own, set up the way Motio needs them. Your company's
sign-in still works: connect it to Motio's Keycloak
([Your own sign-in](./sign-in.md)).

**Kubernetes? Podman? A NAS?**
Motio is tested on Linux with Docker and Compose v2.24 or newer, and only there.

**Can I run it in an internal network without internet access?**
The install and every update download images and packages, so the server needs
internet access at those times. People reach Motio by a domain name over HTTPS; in
an internal network, use `--mode proxy` behind a proxy whose certificate your
browsers trust.

**Do I have to update?**
No, nothing updates on its own. Security fixes come as releases, though, so update
when one comes out ([Security](./security.md)).

**Can I go back to the hosted version, or the other way?**
Not with a button. Moving data between installs is a backup set restored on the
other server ([Backups](./backups.md#moving-to-another-server)), which works
between your own servers.

## Limits

What self-hosting does not do yet:

- The web app is built on your server; there are no prebuilt images yet.
- Data lives in Docker volumes, not in folders of your choice.
- One install serves one domain at its root. Sub-paths such as
  `example.com/motio` are not supported.
- Single sign-on goes through Keycloak; signing in directly with an OIDC provider,
  without Keycloak, is not available.
- Motio's own containers are not meant to be updated one by one; updates come only
  as releases.

Missing something you need? Tell us in
[Discussions → Ideas](https://github.com/eleron96/motio/discussions/categories/ideas).
