# Email

Motio works without email. Setting up an SMTP account adds the messages people
expect from a web app, and changes how sign-up works.

## What changes with email

| | Without email | With email |
|---|---|---|
| Invitations | wait in Motio's notifications; **Copy link** to send them yourself | an email with a link as well |
| Someone invited who has no account | signs in or registers, then accepts in the notifications | gets an email to set a password |
| Forgot password | a Keycloak administrator sets a new one (**Users** → the person → **Credentials**) | a reset link by email |
| Sign-up | no address confirmation | the address is confirmed by email before the first sign-in |
| Welcome email after the first sign-in | — | sent |
| Email broadcasts from the admin console | — | sent |

Who sends what: Keycloak sends invitations, address confirmations and password
resets; Motio's backend sends the welcome email and broadcasts. Both use the same
account.

## Set it up at install

```bash
infra/scripts/install.sh --domain planner.example.com --email you@example.com \
  --smtp-host smtp.example.com --smtp-port 587 \
  --smtp-user no-reply@example.com --smtp-pass '…' \
  --smtp-from no-reply@example.com
```

Port `465` is used with TLS from the start, any other port with STARTTLS.

## Add it later

Set these in `.env`:

```bash
GOTRUE_SMTP_HOST=smtp.example.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_SECURE=false          # true for port 465
GOTRUE_SMTP_USER=no-reply@example.com
GOTRUE_SMTP_PASS=…
GOTRUE_SMTP_ADMIN_EMAIL=no-reply@example.com   # the sender address
MAILER_DRY_RUN=0                  # an install without email has 1 here
```

Then run `infra/scripts/install.sh up`. It gives Keycloak the same account and turns
on address confirmation in the realm.

> [!IMPORTANT]
> If people sign in through your own identity provider, set it up to be trusted
> **before** adding email. Otherwise Keycloak asks all of them to confirm their
> address at the next sign-in. See [Your own sign-in](./sign-in.md#email-verification).

## Check that it works

Sign in as a super admin and open **Admin → System**: **Send test email** sends a
short message to your own admin address and shows the error if it fails. Keycloak's own
check is in its console: realm **timeline** → **Realm settings** → **Email** →
**Test connection**.

A different account for Motio's own emails (for example a marketing sender for
broadcasts) is possible with the `MAILER_*` settings; see
[Configuration](https://github.com/eleron96/motio/blob/main/docs/configuration.md#email-mailer).
