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
- **Days off for everyone** (where your server allows it) — a company closure or
  collective leave: a name and the first and last day. These days look like public
  holidays on the timeline, in the calendar and on the heatmap; nobody's own time off
  changes. Admins add, change and delete them.

### Display

- **Example data** — **Remove examples** clears the sample projects, people and tasks
  the workspace started with.
- **Show unassigned** — a row for tasks nobody is assigned to. This one is your own
  view setting.
- **Workload heatmap** (*experimental*) — turns on
  [the heatmap](./dashboard.md#workload-heatmap) for everyone, with an optional
  **Full working day** that counts as 100%.
- **Timeline density** (where your server allows it) — **Normal**, **Small photos** (a
  small photo next to the name, rows only as tall as their tasks) or **Compact** (small
  photos and one-line tasks, about twice as many people on screen). It applies to
  everyone in the workspace on a computer; phones keep the usual layout.

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
- **History** — who changed roles, groups and access, and when; also who created or
  revoked an [API token](#api).
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

### API

Admins only, and only where your server has it turned on. Here another program gets
access to the workspace:

- **Create token** — a key for one program. Choose what it may do: **Read the workspace**
  (people, projects, tasks, milestones and absences — for reports) and/or **Import
  absences** (from your time tracking or HR system). The token is shown once: copy it
  right away. The bin next to a token revokes it, and that program loses access at once.
  Both are recorded in **Members and access → History**.
- **AI assistants** — an assistant that supports MCP can read the workspace and answer
  questions such as "who is free next week?". Create a token that
  may read the workspace: the window with the new token shows ready text for Claude Code,
  Codex, Gemini CLI and Kimi Code, with the address and the token already in it — pick
  yours, copy, paste. The assistant cannot change anything.

Anyone who holds a token reads the whole workspace, whatever their own role: make one
token per program and revoke it when it is no longer needed. Details for the person who
sets it up: [API](https://github.com/eleron96/motio/blob/main/docs/api.md) and
[MCP server](https://github.com/eleron96/motio/blob/main/docs/mcp.md).

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
