# Workspace and roles

A workspace holds one team's plan: its people, projects, tasks and settings. You can be
in up to five. Switch between them, or create a new one, from the menu on the workspace
name at the top left; a new workspace starts by asking what your team does, just like
the [first one](./getting-started.md#your-first-workspace).

## Roles

| | Viewer | Editor | Admin |
|---|:-:|:-:|:-:|
| See the whole plan, projects, dashboards | ✓ | ✓ | ✓ |
| Mark their own time off | ✓ | ✓ | ✓ |
| Create, change and move tasks; comment | | ✓ | ✓ |
| Change projects, customers, milestones, dashboards | | ✓ | ✓ |
| Change statuses, task types and tags | | ✓ | ✓ |
| Mark time off for others | | | ✓ |
| Invite people, change roles, groups and access | | | ✓ |
| Rename the workspace, set its holidays, turn on the heatmap | | | ✓ |
| Delete the workspace | | | ✓ |

The **owner** — whoever created the workspace, or received it — is an admin who can also
hand the workspace over to someone else.

## Joining a workspace

Someone invites you by email. The invitation waits in Motio, not only in the mail:
sign in with **the invited address** and it is in the [notifications](./notifications.md)
under **Invites** — **Accept** and you are in. If you got a link instead, open it and
sign in. Only the invited address can accept.

## Workspace settings

The **⚙** next to the workspace name opens the settings. Everyone can open them; what
you can change depends on your [role](#roles).

### General

- **Workspace name.**
- **Holiday calendar** — the country whose public holidays are hatched on the timeline
  and counted on the heatmap, and optionally a **Region** with holidays of its own.

### Display

- **Example data** — **Remove examples** clears the sample projects, people and tasks
  the workspace started with.
- **Show unassigned** — a row for tasks nobody is assigned to. This one is your own
  view setting.
- **Workload heatmap** (*experimental*) — turns on
  [the heatmap](./dashboard.md#workload-heatmap) for everyone, with an optional
  **Full working day** that counts as 100%.

### Members and access

**Invite people:** enter an email address, pick a role (and a group, if you like) and
**Send invite**. Motio then says what happened:

- **Invitation sent** — they get an email with a link, and the invitation also waits in
  their notifications.
- **Invitation created** — no email went out (for example, the server has no mail set
  up); they see the invitation once they sign in with that address.

Every pending invitation under **Sent invites** has **Copy link**, to send it through
your own chat or mail, and **Revoke**.

**Manage members** on the tabs below:

- **Active** — change someone's role or group; **Disable member** switches their access
  off but keeps their tasks and history; **Remove** takes them out of the workspace.
- **Disabled** — people whose access is off; **Enable member** brings them back.
- **History** — who changed roles, groups and access, and when.
- **Colours** — everyone's colour. You can change yours; admins can change anyone's.

### Workflow

The workspace's own lists:

- **Statuses** — each with a name and an optional emoji, shown on the task's bar. Mark
  the ones that mean the work is finished as **Final**, and one as **Cancelled**.
- **Task types** — meeting, review, drawing set… whatever your team distinguishes.
- **Tags** — free labels for filtering.

### Template

- **Add from a template** adds the statuses, task types and tags of an industry template
  that this workspace lacks. Nothing is removed, and no examples are added.
- **Save as my own set** keeps this workspace's statuses, types and tags as your own
  template, offered as **My own set** when you create a workspace.

### Danger zone

- **Transfer ownership** (owner only) — another member becomes the owner; you stay an
  admin.
- **Delete workspace** (admins) — permanent, confirmed by typing the workspace's name.

## Leaving a workspace

An admin leaves with **Leave** next to their own name under **Members and access**; an
owner transfers ownership first. If you are a viewer or editor and see no such option,
ask an admin to remove you. Either way your tasks stay, and attach to you again if you
are invited back.

## Next

- [Your account](./account.md)
- [Team](./team.md): groups and everyone's tasks.
