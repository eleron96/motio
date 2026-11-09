# Your own sign-in

Motio signs people in through its Keycloak. To let them use the accounts your
company already has (Authentik, Microsoft Entra ID, Google Workspace, any OIDC
provider), connect that provider to Keycloak as an external provider: Keycloak
calls this *identity brokering*. Motio itself needs no change.

## Connect your provider

1. **In your provider**, create an OIDC application (in Authentik:
   **Applications → Create with provider → OAuth2/OpenID**). Redirect URI:

   ```
   https://<domain>/realms/timeline/broker/<alias>/endpoint
   ```

   `<alias>` is a short name you choose, e.g. `authentik`. Note the client ID, the
   client secret and the issuer or discovery URL
   (`https://auth.example.com/application/o/<slug>/.well-known/openid-configuration`
   in Authentik).
2. **In Keycloak** (`https://<domain>/admin`): realm **timeline** →
   **Identity providers** → **OpenID Connect v1.0**. Use the alias from step 1,
   paste the discovery URL, the client ID and the secret, and set client
   authentication to *Client secret sent as post*.
3. Under **First login flow**, keep *first broker login*. People who already have a
   Motio account with the same email are asked to link it once.

The sign-in page now shows "Sign in with &lt;your provider&gt;". Keycloak stays as
the layer in between.

## Recommended settings

In the provider's **Advanced** settings in Keycloak:

- **Trust Email** on, if your provider checks email addresses itself, as company
  directories do. See [the next section](#email-verification) for why.
- **Sync mode: force**, to keep names and email addresses in step with your
  provider at every sign-in.
- Optional: **Hide on login page**, plus the realm's **Login → Identity provider
  redirector** (default provider), to skip Keycloak's own login page and go
  straight to your provider.

## Email verification

Without [email](./email.md), nobody is ever asked to confirm an address.

Once SMTP is set up, `install.sh up` turns on email verification in the realm.
From then on Keycloak asks everyone who comes through your provider to confirm
their address by email, unless it trusts the provider:

| Your provider in Keycloak | People signing in for the first time | People who signed in before |
|---|---|---|
| Trust Email off | asked to confirm | asked to confirm |
| Trust Email on, sync mode *import* | not asked | still asked |
| Trust Email on, sync mode *force* | not asked | not asked, from their next sign-in |

> [!TIP]
> Turn on Trust Email and Sync mode: force **before** you set up SMTP. People
> who should not be asked can also be marked in Keycloak: **Users** → the person →
> **Email verified** on.

## Groups from your provider

Groups your provider sends can be mapped into Keycloak groups (a mapper of type
*Advanced Claim to Group* on the provider, one per group). Motio can then use
those groups for two things:

- **Super admins** from a group: [Administrators](./admins.md#or-grant-it-through-a-group).
- **Workspaces** from groups: [People and workspaces](./people.md#workspaces-from-groups).
