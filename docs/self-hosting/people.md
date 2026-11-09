# People and workspaces

Three ways to bring someone into a workspace. Pick by how your company works:

| Way | Who does it | Good for |
|---|---|---|
| [Invitation](#invitations) | a workspace admin | everyday use, with or without email |
| [Add member directly](#add-someone-directly) | a super admin | people who already signed in, no invitation step |
| [Workspaces from groups](#workspaces-from-groups) | your directory | companies that keep teams in Authentik, Entra ID… |

Every person has a role in each workspace: **viewer** sees everything and changes
nothing, **editor** creates and moves tasks, **admin** also manages members and
settings. One account can be in at most five workspaces.

## Invitations

A workspace admin opens **Workspace settings → Members and access**, enters an
email address and a role, and sends the invitation.

An invitation is waiting in Motio, not just an email: whoever signs in with that
address finds it in the notifications (the bell) and accepts it there. Only that
address can accept it.

| The person… | With [email](./email.md) set up | Without email |
|---|---|---|
| already has an account | gets an email with a link; the invitation also waits in their notifications | finds it in their notifications |
| has no account yet | gets an email to set a password, then joins | signs in through your [own sign-in](./sign-in.md) or registers, then accepts it in the notifications |

After sending, Motio says which of these happened ("Invitation sent" or
"Invitation created… No email was sent"). Every pending invitation has a
**Copy link** button, so you can send the link through your own chat or mail.
Without email nothing is created in advance: no account appears until the person
signs in.

An invitation never changes the invited person's account: it does not switch a
blocked account back on and does not mark an address as verified.

## Add someone directly

A super admin can put anyone who has signed in at least once straight into a
workspace, without an invitation or an email: **Admin → Workspaces → Add member**,
pick the person and the role. They are in at once.

**Admin → Workspaces → Members** shows who is in a workspace, with their role and
whether a group put them in. A super admin can change a role or take someone out
there without being a member; the workspace owner stays. Each change appears in the
workspace's member history under the super admin's name.

## Workspaces from groups

Instead of inviting people one by one, let a group decide who is in which
workspace: everyone in the group *Design* joins the workspace *Design* as an
editor, say.

Motio reads the groups from Keycloak, so they can come from your provider. In the
provider's **Mappers** in Keycloak, a mapper of type *Advanced Claim to Group* puts
people into a Keycloak group by a claim your provider sends, such as `groups` from
Authentik (one mapper per group).

### Turn it on

1. As a super admin, open **Admin → Settings** and turn on **Workspaces from
   groups** (or run `infra/scripts/install.sh settings set groups.workspaces on`;
   `KEYCLOAK_WORKSPACES_FROM_GROUPS=true` in `.env` works too).
2. As a super admin, open **Admin → Group access**. Pick the Keycloak group (its
   path, such as `/Design`; the form lists the groups Keycloak has), the workspace
   and the role, and add the mapping.
3. Everyone in the group joins the next time they open Motio, before Motio would
   create a first workspace of their own.

### How it behaves

- A mapping also covers the subgroups of its group: `/Company` covers
  `/Company/Design`. When several groups lead to one workspace, the highest role
  counts.
- Only access is added. Someone already in the workspace keeps their role, and a
  workspace admin can change a role later: the sync never overwrites it (unless
  [roles follow the groups](#when-someone-moves-to-another-group)). The workspace
  owner is never touched.
- People who were in the workspace before the mapping (invited or added by hand)
  stay as they are: no group change touches them. To hand them over to the groups,
  take them out of the workspace; they come back through their group at the next
  sign-in.
- The groups are read from Keycloak each time someone opens Motio. A group that
  comes from your own sign-in through a mapper changes in Keycloak only when the
  person signs in through it again, so a move in your directory takes effect at
  their next sign-in.
- The limit of five workspaces per account holds; a mapping beyond it is skipped
  and the functions log says so.

### When someone moves to another group

By default the role stays as it was given. With **Change the role with the group**
on (**Admin → Settings**, `groups.syncRoles`), the role a group gave follows the
groups at the person's next visit, up or down: moving from a viewer group to an
editor group makes them an editor, and back. When several groups lead to one
workspace, the highest role counts.

A role a workspace admin changed by hand is never touched again by the groups, and
neither are people added by hand or by an invitation.

### When someone leaves a group

By default nothing happens: leaving the group does not take the access away.

With **Take access away when someone leaves a group** on (**Admin → Settings**,
`groups.removeOnLeave`, or `KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE=true`) the access
a group gave is taken away at the person's next visit, once no mapped group gives it
any more. Access given by hand or by an invitation always stays.

> [!TIP]
> With removal on, a workspace admin who removes someone the group put in sees
> them come back at their next visit, because the group still says so. Change the
> group instead.

Removing a mapping in **Group access** stops new people from joining through it;
with removal on, those who had access only through it lose it at their next
visit.
