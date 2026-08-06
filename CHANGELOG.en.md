# Changelog

All notable changes to this project should be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.55] - 2026-08-06
### Fixed
- Dialogs on a phone got rounded corners, and the close and overflow buttons in their corner got a proper tap target.
- On a phone the project name no longer breaks in the middle of a word — it takes a line of its own, the full width of the card.


### Added
- Tapping a day in the calendar on a phone opens what happens that day: milestones, who is away, the holiday, and how many tasks land there — all of them and yours. From there you can open the day or create a milestone; pull the sheet down to close it.


### Changed
- Filters open as a screen of their own on a phone: bigger rows and search fields, a count on every section, and sections with a selection already open.

## [0.9.54] - 2026-08-06
### Changed
- The floating buttons on a phone — add task, filters and legend — are now the same size and sit higher above the bottom edge, clear of the screen's rounded corner.
- Status, priority, type, tags, repeat and assignees are picked on a full-screen list you can scroll with a finger, instead of dropdowns you could not scroll past.
- On a phone the menu now opens from your own avatar in the top bar, which also carries the unread count. Instead of a side drawer, a panel slides up from the bottom with large rows: workspace, workspace settings, notifications, account settings.
- Settings open full screen on a phone: switch sections from the strip at the top or by swiping left and right, dots at the bottom show where you are, and swiping right on the first section takes you back to the menu.
- Toggles, steppers and the language picker are bigger on a phone — sized for a thumb.
- Notifications and workspace switching open as their own screens instead of cramped popups.
- The phone menu closes with a flick down anywhere on the panel, not just on the grabber, so the corner close button is gone. Swiping up expands the menu to full screen, with the app version and author now shown at its bottom — the version left account settings. Tapping the version opens the latest changes.
- "Sign out" in profile settings moved to the very bottom, became a compact button and now asks for confirmation — no more accidental taps.
- The section dots sit higher, clear of the iPhone home indicator.
- On a phone, swipe the top bar left or right to move between sections (Timeline, Dashboard, Projects, Team).
### Fixed
- The @-mention suggestions in comments no longer open underneath the keyboard — the list moves above the line you are typing on.
- Task fields no longer run off the right edge on a phone — the iPhone stopped zooming the page in when you start typing. The description and comments fit the screen, and the keyboard no longer covers them: the form scrolls to the field you are in.
- Picking a project when creating a task works again on a phone: the list opens as its own screen and scrolls normally, with a search box when there are many projects.
- The create-task form no longer slides off the top of the screen when the keyboard opens — it fills the screen, and the Back arrow and the action buttons stay put.
- Settings screens on a phone stopped drifting under the keyboard while typing.
- The project picker also closes with a swipe to the right, not just the back arrow.
- The Cancel and Create task buttons sit higher above the bottom edge, clear of the screen's rounded corners.
- The task card on a phone now opens like the create form: full screen, with a back arrow, scrolling body and pinned Cancel/Done; the created/updated line moved above them.


### Added
- The calendar on a phone got its legend: a button in the corner opens what each mark on a day means, with switches for holidays, milestones and team time off, and a picker for whose time off to show.

## [0.9.53] - 2026-07-30
### Added
- Dashboard widgets grouped by project or by status are now drawn in those entities' own colours, the ones set in settings. The "No project" column stays grey. Widget settings carry toggles to go back to the plain palette.

## [0.9.52] - 2026-07-30
### Added
- Workspace settings now offer 20 colours instead of 12, and they are noticeably easier to tell apart.
- A person's colour now also fills the circle with their initials, everywhere it appears: the timeline, tasks, comments, the member list. That circle used to be coloured at random and did not match their day-off circles or chart series.
- Dashboard widgets grouped by people gained a "People's colours" toggle: on by default, turn it off to go back to the widget's own palette.

## [0.9.51] - 2026-07-30
### Added
- Workspace settings now have a People section where everyone can be given a colour from a palette. An admin sets it for anyone, everybody else for themselves. The colour shows up on dashboard charts, on day-off circles in the calendar and behind the initials in an avatar.

## [0.9.50] - 2026-07-30
### Changed
- Subtasks in the create-task dialog now look the same as inside an open task: the same bordered, highlighted fields. Trailing blank lines are dropped as soon as you leave the field, so it no longer stays stretched.

## [0.9.49] - 2026-07-30
### Fixed
- A subtask can now be written across several lines while you create the task: the text wraps and stays fully visible, and the field grows as you type — just like editing a subtask inside an open task.
- Escape while editing a subtask no longer closes the whole task: the key clears the text in that field and leaves the task open.

## [0.9.48] - 2026-07-30
### Changed
- The assignee photo in the timeline profile card is now noticeably larger, scaling to the screen and to the photo's own quality.

## [0.9.47] - 2026-07-29
### Fixed
- Pasting text from another app now brings over only the text, lists and images — the source app's styling no longer breaks the task description.

## [0.9.46] - 2026-07-29
### Fixed
- Editing a recurring task no longer floods its assignee: the whole series produces a single notification instead of one per occurrence.

## [0.9.45] - 2026-07-29
### Changed
- Sign-up no longer asks for a first and last name — an email and a password are enough. The name can be filled in later in account settings.

## [0.9.44] - 2026-07-28
### Changed
- The workload heatmap now accounts for time off: a day's tasks are divided among the people actually there, so days with absences read hotter. The day popover shows how many are away, and a day with the whole team off is shown as non-working.

## [0.9.43] - 2026-07-28
### Changed
- Unread notifications now stand out at a glance: a coloured bar on the left, a tinted card and a bold title.

### Removed
- Deadline reminders are gone — no new ones arrive, and the old ones disappeared from the list.

## [0.9.42] - 2026-07-27
### Added
- Eight patterns for days off now: a beer and a star join the set.

### Changed
- The wave pattern is a real breaking wave, and the umbrella became a beach parasol.

## [0.9.41] - 2026-07-27
### Added
- Six patterns for days off now: mountains, waves, an umbrella and a tent join the palm and the sun. Pick yours in account settings.

## [0.9.40] - 2026-07-27
### Added
- Days off are now marked with a pattern instead of plain grey shading, so they can no longer be mistaken for an ordinary weekend. Pick yours in settings — palms or sun. Your teammates see it too.

### Changed
- Account settings open in the same centered modal as workspace settings.
- The calendar shows three whole years — last, current and next, each in full from January to December.
- The time-off bar leads with the note and moves the dates to the second line, so the reason someone is away reads first.
- Time off no longer pushes a person's other tasks down a lane: they only move on the days the time off actually covers.
- On the calendar the away-circle is smaller on public holidays, so the holiday still shows around it.

### Fixed
- Fields in account settings no longer lose part of their highlight when selected.

## [0.9.38] - 2026-07-26
### Added
- The calendar got a panel on the right: holidays, milestones and team time off can each be switched on or off. Days when somebody is away are marked with a circle in that person's colour; several people split the circle into slices, and hovering shows who is away and until when.


### Changed
- The calendar now shows two years around the current date instead of the whole task history, so it opens noticeably faster. The New Year break is marked in full, and for years whose production calendar is not published yet the holidays are derived from the Labour Code.

## [0.9.37] - 2026-07-26
### Changed
- The morning brief has a new look: overdue tasks and tasks due today are now separate blocks with a count for each at the top. Long lists stay collapsed and open with one tap.
- Upcoming milestones now show the date alongside how many days are left.


### Added
- Mark your days off right on the timeline: they shade your row and the marker behaves like a regular bar. Your teammates' days stay unchanged.

## [0.9.36] - 2026-07-25
### Changed
- The “Latest changes” dialog now shows the last 40 releases instead of only the current one, and app pages load faster.

## [0.9.35] - 2026-07-24
### Fixed
- The notifications service component is no longer held back by browser caching — push updates reach installed apps right away.

## [0.9.34] - 2026-07-24
### Added
- The installed app icon now shows an unread notification badge: it arrives with each push and clears once you have read everything.

## [0.9.33] - 2026-07-24
### Added
- Motio can now be installed on your phone as an app. On iPhone, add it to your Home Screen and push notifications arrive right on your phone — even when the app is closed.

## [0.9.32] - 2026-07-23
### Changed
- The Contacts tab now has a single search across people, companies, tags, roles and phones. Added tag, company and role filters.

## [0.9.31] - 2026-07-23
### Fixed
- Fixed bell notification texts: deadline reminders and task edits no longer show up as "Unknown user assigned you".

## [0.9.30] - 2026-07-23
### Fixed
- The Projects tab now shows every project milestone, including far-off ones — previously only the next couple of months were visible. The Milestones block no longer ends up shorter than its neighbors.

## [0.9.29] - 2026-07-22
### Added
- The registration form now shows the password requirements below the password field.

## [0.9.28] - 2026-07-21
### Security
- Hardened image uploads: only safe image formats are accepted.

## [0.9.27] - 2026-07-21
### Security
- Added password strength requirements for sign-up and password changes.

## [0.9.26] - 2026-07-21
### Security
- Strengthened data protection by closing several paths for unauthorized access to accounts and workspaces.

## [0.9.25] - 2026-07-20
### Fixed
- Fixed dashboards collapsing after switching to the heatmap and back — previously only a page reload would restore them.

## [0.9.24] - 2026-07-20
### Changed
- Project notes with an attached image now show a small image badge, so you can spot them before opening the note.

## [0.9.23] - 2026-07-20
### Changed
- Clicking a browser notification now opens the task itself on the timeline — a mention opens it with the comments in view.

## [0.9.22] - 2026-07-20
### Changed
- No documented changes.

## [0.9.21] - 2026-07-20
### Added
- Browser notifications for your tasks: when a task is assigned to you, you're mentioned in a comment, your task changes, or a deadline is near. Turn them on in account settings and pick which events you want.

## [0.9.20] - 2026-07-19
### Changed
- Minor internal improvements.

## [0.9.19] - 2026-07-19
### Changed
- No documented changes.

## [0.9.18] - 2026-07-19
### Changed
- Minor internal improvements.

## [0.9.17] - 2026-07-19
### Changed
- No documented changes.

## [0.9.16] - 2026-07-19
### Fixed
- Fixed some bugs.

## [0.9.15] - 2026-07-19
### Changed
- Minor internal improvements.

## [0.9.14] - 2026-07-19
### Changed
- The "Start for free" button now opens the registration form directly, and the sign-in screen has a clear "Create an account" button. Sign-in and registration screens are now fully and consistently translated.

## [0.9.13] - 2026-07-19
### Added
- New users now receive a welcome email with getting-started tips after their first sign-in.

## [0.9.12] - 2026-07-18
### Added
- Clicking a person's avatar on the timeline opens a card with a larger photo, their name, and email.

## [0.9.11] - 2026-07-17
### Changed
- The workload heatmap can now be scrolled by dragging it with the left mouse button.

## [0.9.10] - 2026-07-17
### Added
- A milestone can now be excluded from the workload heatmap with a checkbox in its settings — handy for marker milestones that don't occupy the team.

## [0.9.9] - 2026-07-13
### Fixed
- The dashboard widget grid no longer jitters when rearranging.
- Picking a person from the suggestions when adding them to a project now fills in their company/contractor tag.

## [0.9.8] - 2026-07-08
### Fixed
- Contacts list: removed the 'Open project' entries from the row actions menu, leaving just Edit and Delete.

## [0.9.7] - 2026-07-08
### Fixed
- Contacts list: restored scrolling for long lists and removed the extra per-person badges.

## [0.9.6] - 2026-07-08
### Added
- New Contacts tab: one directory of people from clients and teams, grouped by company with search. Customer contacts now have a Company field.

## [0.9.5] - 2026-07-06
### Changed
- No documented changes.

## [0.9.4] - 2026-07-06
### Changed
- No documented changes.

## [0.9.3] - 2026-07-04
### Fixed
- Removed the redundant "Only for …" option in the task delete dialog when a task has a single assignee.

## [0.9.2] - 2026-07-04
### Changed
- The timeline is smoother when dragging tasks and scrolling horizontally.

### Fixed
- Editing a recurring task series can no longer stop halfway — changes apply all-or-nothing.
- The Terms of Service and Privacy Policy pages render with proper formatting again.

### Security
- Tightened workspace access control and data protection.

## [0.9.1] - 2026-07-03
### Added
- Team workload heatmap (experimental): a month-by-month calendar showing task density and milestones per day, so you can see where there are free slots and where the team is overloaded. Turn it on in workspace settings.

## [0.9.0] - 2026-07-03
### Changed
- No documented changes.

## [0.8.70] - 2026-07-03
### Changed
- No documented changes.

## [0.8.69] - 2026-07-03
### Changed
- No documented changes.

## [0.8.68] - 2026-07-03
### Changed
- No documented changes.

## [0.8.67] - 2026-07-03
### Changed
- No documented changes.

## [0.8.66] - 2026-07-03
### Changed
- No documented changes.

## [0.8.65] - 2026-07-01
### Changed
- No documented changes.

## [0.8.64] - 2026-07-01
### Fixed
- A long project name no longer shifts the layout in the milestone dialog — it now truncates with an ellipsis.

## [0.8.63] - 2026-07-01
### Changed
- A count-limited repeat now shows the date of its last occurrence, so you don't have to count it in your head.
- Task repeat settings are more compact: repeat type and limit are two dropdowns, and the date or count field appears only when relevant.
- In the project Team block, a member's “Tag” field is now “Company / contractor”, matching client contacts.

## [0.8.62] - 2026-07-01
### Fixed
- A recurring task’s repeat limit can now be switched back to “Never”, even if a repeat count was set earlier.


### Changed
- In the project card, a contact’s “Tag” is now “Company / contractor”.

## [0.8.61] - 2026-06-29
### Added
- On the timeline you can now create a milestone by double-clicking a date.
- People now appear with an avatar — or a colored monogram when there's no photo — next to their name: in the members list, the member card, and when assigning people to tasks.


### Fixed
- A notification for a task that has already been deleted is now marked and warns you, instead of leading nowhere.

## [0.8.60] - 2026-06-29
### Changed
- No documented changes.

## [0.8.59] - 2026-06-29
### Changed
- No documented changes.

## [0.8.58] - 2026-06-29
### Added
- The workspace owner is now marked with a badge in the member list.
- You can now leave a workspace — your tasks are kept and reattach to you if you come back.


### Changed
- Only the workspace owner can now transfer ownership or delete the workspace.


### Security
- Invitations from members who lost access no longer work, and re-accepting an old invite no longer changes an existing member's role.

## [0.8.57] - 2026-06-27
### Changed
- No documented changes.

## [0.8.56] - 2026-06-27
### Fixed
- The task list no longer shows stale data when a bulk change to a repeat series or assignees is interrupted by an error.
- A task's text is no longer lost when someone else edits it while you are typing.

## [0.8.55] - 2026-06-27
### Changed
- In the milestone editor, delete moved to a top menu and the dialog is more compact.
- Notification cards are more compact — task title on top, the whole card is clickable, actions are icons on the right.

## [0.8.54] - 2026-06-26
### Fixed
- The Workspace settings window no longer changes height when switching sections.

## [0.8.53] - 2026-06-26
### Changed
- Refreshed the Workspace settings window: sections on the left and a cleaner layout.
- The "Unassigned" toggle moved from the timeline into Workspace settings, under the Display section.

## [0.8.52] - 2026-06-26
### Fixed
- Member avatars are clipped to a circle correctly again in Safari on iOS.
- On the projects page, clicking a project in the Clients section opens that project again, even when a team filter is active on the Projects tab.


### Changed
- On phones, the offline indicator is now a compact icon so it does not crowd the screen.
- On phones, adding tasks is easier: a round floating button, filters that open as a centered modal, and a new-task form that fits entirely on screen.
- On phones, you can now control timeline tasks with gestures: a tap shows a tooltip, a double tap opens the task, and a long press opens a touch-friendly actions menu.

## [0.8.51] - 2026-06-25
### Changed
- No documented changes.

## [0.8.50] - 2026-06-25
### Changed
- No documented changes.

## [0.8.49] - 2026-06-22
### Changed
- On desktop, member avatars in the timeline are now larger.

## [0.8.48] - 2026-06-19
### Fixed
- After a version update, pages with stale styles now refresh automatically instead of erroring.

## [0.8.47] - 2026-06-19
### Added
- You can now create a milestone by right-clicking a day in the calendar.
- Account settings now let you choose the interface color: several pastel shades and ink black.


### Changed
- When creating tasks, milestones, projects, customers, groups and widgets, the name field is now focused automatically so you can type right away.

## [0.8.46] - 2026-06-17
### Fixed
- After an update ships, the app no longer crashes with an error when you open a task, comments, or the editor — it now reloads the fresh version on its own instead.

## [0.8.45] - 2026-06-16
### Fixed
- Task duration can be shortened on the timeline again and past-dated tasks can be edited; the only limit is that the end date can't be before the start date.

## [0.8.44] - 2026-06-16
### Fixed
- A task's end date can no longer be set before its start or before today, which removes overlapping bars on the timeline.

## [0.8.43] - 2026-06-15
### Changed
- No documented changes.

## [0.8.42] - 2026-06-15
### Changed
- The dashboard save status now appears as a toast notification instead of a separate status line.

## [0.8.41] - 2026-06-15
### Added
- Search fields for customers, milestones, members, access and groups now have a clear button.


### Fixed
- The dashboard no longer shows an all-changes-saved note when you just open the page without making changes.

## [0.8.40] - 2026-06-15
### Added
- The search on the Projects page now has a clear button to reset the field in one click.

## [0.8.39] - 2026-06-15
### Changed
- No documented changes.

## [0.8.38] - 2026-06-15
### Fixed
- Fixed empty Preferences and Data tabs in account settings.

## [0.8.37] - 2026-06-13
### Changed
- No documented changes.

## [0.8.36] - 2026-06-13
### Changed
- Large numbers in the profile summary are now shortened — thousands show as K, millions as M.

## [0.8.35] - 2026-06-13
### Changed
- No documented changes.

## [0.8.34] - 2026-06-13
### Added
- The Profile tab in account settings now shows a short summary of your tasks: completion progress, what's in progress and overdue, weekly activity, and how long you've been in Motio.

## [0.8.33] - 2026-06-13
### Changed
- No documented changes.

## [0.8.32] - 2026-06-13
### Fixed
- Fixed task images that stopped displaying over time.

## [0.8.31] - 2026-06-13
### Changed
- No documented changes.

## [0.8.30] - 2026-06-13
### Changed
- No documented changes.

## [0.8.29] - 2026-06-13
### Fixed
- Opening the task window and other dialogs no longer outlines the first field.


### Changed
- The main accent is now terracotta: the add button is a warm clay color, and active menu items and tabs use a soft terracotta tint.

## [0.8.28] - 2026-06-12
### Changed
- No documented changes.

## [0.8.27] - 2026-06-12
### Changed
- The interface accent switched from teal to ink: primary buttons are now near-black in the light theme and white in the dark theme, with focus highlights to match.

## [0.8.26] - 2026-06-12
### Changed
- No documented changes.

## [0.8.25] - 2026-06-12
### Changed
- Polished the task window: accent gray panels and formatting strips (including comments), adaptive spacing around the card, and no stray blue outline when opening.

## [0.8.24] - 2026-06-12
### Changed
- The task window now has breathing room below the card, a subtle 'Created … · updated …' note sits bottom-left, and opening a task no longer auto-focuses the title.

## [0.8.23] - 2026-06-12
### Fixed
- The task title no longer overflows into the parameters panel.

## [0.8.22] - 2026-06-12
### Changed
- The task window no longer scrolls internally — the card grows with its content. Long project names wrap to a second line, date fields fit fully, and the divider above the buttons is gone.

## [0.8.21] - 2026-06-12
### Changed
- Polished the task window: the parameters panel tint now spans the full height, and repeat is configured via a compact toggle menu. Fixed tag picking on the first click and date field sizing.

## [0.8.20] - 2026-06-12
### Changed
- Redesigned task window: title, description and subtasks on the left, a parameters panel on the right. Tags are picked via a suggestions field, and repeat settings live in a compact popover.

## [0.8.19] - 2026-06-11
### Added
- The "Week" timeline view is now optional — turn it on with a toggle in Account settings → Preferences. Off by default.

## [0.8.18] - 2026-06-11
### Changed
- In Calendar view, opening a day is now a double-click.
- In Calendar view, the day's milestone menu now appears on hover after a short delay (instead of on click), and you can pick a milestone right from it.

## [0.8.17] - 2026-06-10
### Added
- In Calendar view you can right-click a day to add a milestone — the create dialog opens with that date prefilled.

### Changed
- Milestones now use the same dialog everywhere: the date field is editable on the timeline and calendar too, matching the Projects tab.
- Editing a repeating task with "Only this task" now detaches it from the series — later edits no longer ask which tasks to apply to.
- Removed the "Week" timeline view — only "Day" and "Calendar" remain.

### Fixed
- On the Projects tab, grouping the team by tags no longer resets when you switch to another tab and back.

## [0.8.16] - 2026-06-10
### Changed
- The timeline is back to its previous rendering mode: all rows and tasks are drawn upfront again, with no load-as-you-scroll.

## [0.8.15] - 2026-06-10
### Fixed
- Fixed blank gaps and a visible jump when scrolling the timeline quickly: tasks now load ahead of the user reaching them.

## [0.8.14] - 2026-06-10
### Changed
- The timeline is much faster for large teams: only visible rows and tasks are rendered now, so scrolling and opening the planner sped up significantly.
- Hardened protection against malicious scripts: the browser is now explicitly told where the app may load code from and where it may send data.
- Updated internal libraries; fixed a link-redirect vulnerability in in-app navigation.

## [0.8.13] - 2026-06-01
### Changed
- No documented changes.

## [0.8.12] - 2026-05-31
### Changed
- Removed the redundant month row from the timeline — the month is shown in the toolbar and by the day numbers.
- Redesigned the app header: the workspace switcher and its settings are grouped together, and switching sections animates with a sliding highlight.

## [0.8.11] - 2026-05-30
### Changed
- No documented changes.

## [0.8.10] - 2026-05-29
### Changed
- You can now add tasks from the Projects tab; notes keep their line breaks; project status is always uppercase; subtasks support multiple lines and can be edited right after you create them.

## [0.8.9] - 2026-05-28
### Changed
- A subtask's title can now be changed after it's created.

## [0.8.8] - 2026-05-28
### Changed
- The project three-dot menu is shorter: the Track item is gone (the star button next to the menu already does that) and Edit is now the first item.
- Milestones are now sorted strictly by date — the nearest one on top. The star next to a milestone of a tracked project is now purely informational and no longer pulls the row up.

## [0.8.7] - 2026-05-26
### Added
- Milestones can now be filtered by team — pick a team in the toolbar and see only its milestones.

### Fixed
- Search in Projects and Milestones now finds matches even when filters are set. Filters stay put — clear the search box and they re-apply.

### Changed
- In Milestones, the "Open project" button is now labelled "Перейти к проекту" in Russian (English wording unchanged).
- Milestones and Customers now show a three-dot menu next to their names and in the detail panel — same actions as the right-click menu (Edit, Open project, Delete).
- In Milestones the search box is now full-width and the filter / sort buttons moved underneath — search no longer gets squeezed on narrow sidebars.

## [0.8.6] - 2026-05-19
### Changed
- Images in older tasks no longer render as broken. Their URLs carry an access token baked into the task description HTML, and once the TTL lapsed the task-media Edge Function returned 401 "Token expired" with no client-side refresh path. Migration 0089 bumps `access_token_expires_at` to `now() + 10 years` for every non-revoked `task_media` row (44 rows updated), and the default `TASK_MEDIA_TOKEN_TTL_SECONDS` of the `task-media` Edge Function is raised from 7 days to 10 years so newly uploaded media doesn't hit the same wall. Revoked tokens (`access_token_revoked_at IS NOT NULL`) are left untouched; the table schema and client code are unchanged.

## [0.8.5] - 2026-05-15
### Changed
- DailyBriefController (the daily brief controller mounted at the app root, which renders null until a 9 AM trigger fires) is now wrapped in React.lazy + a null Suspense fallback. With it, DailyBriefModal, the urgent-tasks and milestones renderers, and the brief's react-query data fetch are no longer part of the eager main bundle. Vite's inline <link rel="modulepreload"> polyfill is also disabled — every targeted browser (Chrome 89+, Safari 15+, Firefox 115+) supports modulepreload natively, so the polyfill no longer gets inlined into every HTML page. Main index.js: 711 → 671 KB raw (−40 KB) / 226 → 213 KB gzip (−13 KB transfer).
- The driver.js tour engine (~26 KB raw / 7.6 KB gzip) and its stylesheet now load dynamically — only at the moment we confirm the current user actually needs to be shown the onboarding tour (i.e. their profile.preferences doesn't yet carry the onboarding_completed flag). Most users already have that flag and will no longer download driver.js on app entry. The useOnboardingTour hook's behaviour and signature are unchanged; the admin-segment test was updated to flush the new dynamic-import microtask chain.
- Drop the vendor-radix manual chunk from the build config. Vite no longer bundles all 21 @radix-ui/* packages into a single 305 KB chunk that was being preloaded on every page. The Radix primitives used eagerly at startup (Toaster, TooltipProvider, page header) fold into the main index.js bundle (+88 KB), and page-specific primitives (dialogs, tabs, selects) move into their own lazy chunks that only download when their UI mounts. Net savings on the /app critical path: −217 KB raw / −70 KB transfer.

## [0.8.4] - 2026-05-15
### Changed
- Narrowed planner's initial task fetch window from ±6 to ±3 months around the current date. Initial /rest/v1/tasks JSON payload roughly halved (~1 MB → ~500 KB), request time dropped from ~500 ms to ~250 ms. The loadedRange cache continues to suppress in-window refetches; a full reload now fires only when the user scrolls past a quarter from the anchor date (rare). Calendar view (whole-year span) left untouched.
- Faster first /app paint: the Recharts library (~624 KB raw / ~177 KB transfer) is no longer part of the shared preload chunk and is fetched only when the user opens Dashboard. The 1.8s main-thread parsing block disappears from the timeline boot — expected Lighthouse Performance Score boost of +20-25 points and LCP −500-800 ms. No functional change — Dashboard and widgets work as before, just with a ~200 ms micro-pause on first open.


### Fixed
- Removed the mobile header flicker and content jump on first /app load — the sole source of Lighthouse CLS=0.153. useIsMobile() returned false (desktop) on the first render and flipped to true only after useEffect, causing WorkspacePageHeader to mount as desktop and then re-render as mobile (WorkspacePillNav). The header height changed and everything below it shifted down. The correct value is now derived synchronously on the very first render via window.innerWidth; the matchMedia listener for runtime resizes is unchanged. The effect benefits every component using useIsMobile (PlannerPage, MembersPage, etc.).

## [0.8.3] - 2026-05-14
### Fixed
- Drop Glitchtip noise: stale-chunk preload failures after deploy no longer reported (auto-reload kept); Google/Yandex translate DOM races suppressed via notranslate + beforeSend filter

## [0.8.2] - 2026-05-13
### Changed
- Pinned notes now display **fully without an internal scroll**. The pinned section grows naturally with the number of pinned rows, and the whole Notes block grows taller to fit them — previously the pinned section had its own ~220px desktop cap and 5+ pinned notes meant scrolling within the pinned block. Now every pinned note stays visible at once; only the unpinned area below scrolls (still capped at ~420px on desktop). The parent `<section>`'s `max-h: 640px` was removed so the pinned section can grow freely.

## [0.8.1] - 2026-05-13
### Fixed
- Hotfix for 0.8.0: the static pinned section was eating all available space inside the Notes block's flex parent (max-h: 640px), squeezing the unpinned `flex-1 min-h-0` scroll-container down to zero — users couldn't scroll the rest of the feed. Now:
  - Pinned section gets its own desktop cap (`max-h: 220px`) + `overflow-y-auto` so a long list of pinned notes scrolls inside its own window.
  - `flex-shrink-0` keeps pinned at its natural / capped height instead of being squeezed.
  - The unpinned scroll-container gets a guaranteed `min-h: 160px` on desktop so at least ~2 unpinned rows are always visible.

## [0.8.0] - 2026-05-13
### Changed
- Pinned notes are no longer **sticky** — they're now rendered in a separate static section above the scrollable feed. Multiple pinned rows simply stack one under another and never overlap (previously `position: sticky; top: 0` caused multiple pinned rows to pile on top of each other during scroll, since they all targeted the same top edge). The block's overall height now grows by the pinned section's height; the scrollable region (for unpinned) keeps its capped max height (~420px on desktop). The drop-shadow moved from the last pinned row to the pinned section as a whole. If every visible note is pinned (e.g. a search matched only pinned ones), an explanatory line "No more notes — everything currently visible is pinned." renders below the pinned section.

## [0.7.9] - 2026-05-13
### Fixed
- Blockquotes are now visible in the **feed-row preview** too. Previously the block `<blockquote>` collapsed to plain text with a line break (same fate as other block tags — required to keep `-webkit-line-clamp: 5` working). Now `buildFeedSnippetHtml` wraps the quote contents in an inline `<span class="feedRowBlockquote">` with italic + muted color + left border — clamp keeps working (because `display: inline-block`), and users see at a glance that the chunk is a quote rather than regular text. In the **read modal** quotes already worked since 0.7.8 (full `<blockquote>` with border-left via the `.feedRichText` CSS).

## [0.7.8] - 2026-05-13
### Fixed
- Project notes once again render rich-text formatting outside edit mode — previously bold/italic/underline/strikethrough/lists/blockquotes were only visible in the editor and rendered flat everywhere else (read modal + feed-row snippet). Earlier iterations stripped block tags (`<p>`, `<ul>`, `<li>`, `<blockquote>` …) before display to dodge browser-specific line-break quirks and `-webkit-line-clamp` weirdness. Now:
  - **Read modal** — renders the full sanitized HTML. Lists get bullets/numbers, blockquotes get a left border, inline formatting gets its natural styling. The pre-existing `.feedRichText` CSS class on the wrapper styles every allowed tag.
  - **Feed-row snippet** — preserves inline formatting (`<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<s>`, `<strike>`) and collapses block tags to `<br>` (lists become bulletless lines — bullets break `-webkit-line-clamp`). Images are still stripped from snippets. New `.feedRowRichText` CSS class explicitly styles bold/italic/underline/strike for at-a-glance scanning.

## [0.7.7] - 2026-05-09
### Changed
- The milestone count on each sidebar project row now shows **only milestones still ahead** (status `current` + `upcoming`), skipping already-completed ones. Previously the row counted every milestone the project ever had, which buried "what's still left" in noise. The count uses the same `deriveMilestonesWithStatus` helper as the in-card Milestones block — explicit `statusOverride` values are honoured. Projects with only past milestones now hide the counter entirely (same as before when `count === 0`). The counter span gained `title="Milestones still ahead"` for hover context.

## [0.7.6] - 2026-05-09
### Added
- The project-card task preview modal (opened by clicking a task in the Tasks block) now surfaces recurrence info: a `↻` icon beside the title in the header plus a dedicated "Repeat" cell in the main grid with an outline badge (cadence: "Daily recurring", "Weekly recurring", …) and a series counter ("N in series · N more / Last in series"). Previously the modal had zero visible signal that the task was part of a repeat series — now it matches the info shown on the row in TasksBlock.

## [0.7.5] - 2026-05-09
### Fixed
- The project card Tasks block once again shows a recurring-task indicator: a `↻` icon next to the title and an outline badge with the cadence label ("Daily recurring", "Weekly recurring", "Monthly recurring", "Every 4 weeks", "Yearly recurring") in the meta row. The badge tooltip shows series remainder ("N more" / "Last in series"). Previously, recurring tasks in the new TasksBlock looked identical to regular ones even though `repeatMeta` was already present on each row.

## [0.7.4] - 2026-05-08
### Added
- The star (track) icon and `⋯` action menu are now always visible on each sidebar project row — no hover required. The star is an outline when the project is not tracked; click flips it to filled amber and the project moves to the top of the list.
- The project card header (next to the custom status chip) gains the same star + `⋯` kebab pair. The kebab carries Edit / Archive / Delete (gated on edit permission).

### Changed
- The notes feed and read modal now honour line breaks from the rich-text editor. The row preview switched to plain text + `white-space: pre-line`, so every Enter the user typed becomes a visual break regardless of which tag the browser chose (`<p>`, `<div>` or `<br>`).
- The sidebar project row is more compact: owner team, milestone count and status now share a single bottom line (each was on its own row before).

## [0.7.3] - 2026-05-08
### Added
- Project tracking ("star") is back in the new sidebar — anyone can pin a project to their personal favourites; tracked projects float to the top of the list with an amber star. Toggle lives in the `⋯` dropdown on each row (works without edit permissions — it's a per-user setting).
- The Projects page now remembers in the browser: which tab is open (Projects / Milestones / Customers), the active project and customer, customer + owner-team filters, and the Active/Archived toggle. Reopening restores them exactly.

### Changed
- Notes feed: shows up to 5 lines of body text per row (was 4) and now honors line breaks from the original entry — paragraphs from the rich-text editor are flattened into inline `<br>`-separated text only in the row preview; the full modal keeps proper block layout.
- Pinned notes no longer carry a dashed bottom border — the drop-shadow alone is enough to separate them from the unpinned content scrolling below.

## [0.7.2] - 2026-05-08
### Changed
- The project notes feed now shows up to 4 lines of body text per row (was 2). Longer entries still clip with an ellipsis as before.

## [0.7.1] - 2026-05-08
### Changed
- Pinned notes in the feed gain a soft drop-shadow underneath, so the row visually lifts above the unpinned content scrolling behind. The shadow renders only under the last pinned in a stack, so several stacked pinned rows don't darken each other's seams.

## [0.7.0] - 2026-05-08
### Added
- Team block now lets you edit external members in full — name, company, role, on top of the existing email / phone / tag fields. Workspace (Motio) members keep their existing project-local edit surface here; their identity still lives on the Members page.
- Customer block gains a real edit flow for contacts (previously only add and delete shipped). Pencil on each row opens an inline form on desktop or a bottom sheet on mobile — all five fields editable: name, role, tag, email, phone.
- Pinned notes now stay anchored to the top of the notes feed while you scroll older entries (Excel frozen-row pattern) — they remain visible until you unpin them.

### Changed
- Opening a project parks the notes feed at the bottom (newest entries) automatically. Scroll up to read older notes; while you're up there, new entries no longer yank your position. If you're already at the bottom, the feed glides to the new entry.
- On desktop the notes feed is capped to ~5 visible rows. Fewer notes — smaller block; more — internal scroll within the same height instead of pushing the page.

## [0.6.0] - 2026-05-08
### Added
- Pin/unpin notes inside a project: any editor can pin a note — it floats to the top of the feed and gains an amber accent. An inline icon on each row (next to the author) toggles the pin in one click without opening the modal; the same action lives behind the `⋯` menu inside the note modal. Migration `0088` adds `project_activity.pinned` with a partial index to keep the pinned-first sort cheap.
- Note search now shows a snippet centered on the matched word with the match highlighted (`<mark>` in amber). Long entries get `…` ellipses on trimmed edges.
- The note composer auto-focuses the rich-text editor on desktop, and edit mode auto-focuses on both desktop and mobile — start typing or pasting immediately when the editor opens.

### Changed
- The notes feed now sorts oldest-first within each group. Pinned notes stay on top (still oldest-first inside the pinned group); unpinned notes follow chronologically.
- The desktop note modal moves Delete out of the footer into the top-right `⋯` kebab (next to Pin / Unpin). The bottom row keeps only Close + Edit, so destructive actions take a deliberate two-step path.
- Entering edit mode on a note no longer steals focus to the Pin icon; the editor receives focus directly.

## [0.5.1] - 2026-05-08
### Changed
- No documented changes.

## [0.5.0] - 2026-05-08
### Added
- Full new project-card UI on desktop and mobile — behind `VITE_FEATURE_PROJECT_CARD` (desktop) and `VITE_FEATURE_PROJECT_CARD_MOBILE` (mobile, implies the first flag). The card stacks into one view: Customer with tagged contacts; Team (Motio + external members, avatars, tags, grouping); Milestones with timeline of past/upcoming and quick add; Notes (formerly "Activity") with rich-text editor, images, search and jump-to-date; project Tasks.
- Projects sidebar gets: Projects | Milestones | Customers switcher (single source of truth on mobile too), owner-team filter, customer filter with grouping, active / archived toggle.
- Card header carries an editable custom project status — inline form on desktop, bottom sheet on mobile.
- Auto-add of group members when an owner team is assigned to a project (idempotent; individual members can still be pruned afterward).
- All mobile edit flows live in bottom sheets that lift above the on-screen keyboard via the Visual Viewport API.
- Migrations 0085–0087: GRANTs for the new tables, tag / external columns on project_members, customer_contacts.tag, projects.status.

### Changed
- Mutation handlers (contacts, members, notes, status) return `Promise<boolean>` so forms stay open with the user's draft on failure instead of "silent success".
- The top-of-page MobilePillSubnav is gone on mobile; the mode switcher now lives only in the sidebar.
- Desktop contact popup now clamps to the viewport and flips above the anchor when needed; gains `aria-modal` and a focus trap.

### Fixed
- The status chip no longer drops an in-progress draft when a live-sync update lands mid-edit.
- `loadWorkspaceData` skips the project-card-only tables when the feature flag is off — zero cost in prod until the flag flips on.
- Mobile add-team picker excludes members already on the project.

## [0.4.35] - 2026-05-07
### Added
- Test deploy of the redesigned project tab (behind VITE_FEATURE_PROJECT_CARD). Project card with Customer, Team, Milestones, Activity and Tasks blocks instead of the flat task list. Sidebar with project accent bar, code, customer and owner team. Per-project activity journal with composer, search and jump-to-date. Migrations 0080–0084 add project owner team, customer industry and contacts, assignee contact info and explicit project_members, milestone note and status override, project activity feed.

## [0.4.34] - 2026-05-03
### Changed
- No documented changes.

## [0.4.33] - 2026-05-03
### Changed
- No documented changes.

## [0.4.32] - 2026-05-03
### Added
- No-signup demo sandbox at `/demo`: a sample workspace with 13 projects, 52 tasks and 42 milestones pre-distributed ±2 months around today. Visitors can play with the timeline, filters, dashboards and the team page; edits live only in the current tab. The session resets when the tab closes or after 24 hours of inactivity. The landing page gains two "Try demo" entry points (header link and hero outline button). The whole demo runs in the browser — no extra backend.

## [0.4.31] - 2026-04-30
### Changed
- No documented changes.

## [0.4.30] - 2026-04-29
### Changed
- Desktop header: a small Motio logo appears in the top-left corner; clicking it returns to the Timeline.

## [0.4.29] - 2026-04-29
### Changed
- Desktop header: a small Motio logo appears in the top-left corner; clicking it returns to the Timeline (/app).

## [0.4.28] - 2026-04-29
### Changed
- Major Q2 release. Mobile UI fully redesigned: round section buttons in the header with an expanding pill, floating primary-action button, collapsible search/filters in Member and Project panels, pill-nav carousels for Projects and Team subsections, and a clean Calendar view without floating buttons. Added 30-day account deletion with full data export delivered as a ZIP with notifications, a morning Daily Brief showing today's tasks and milestones, an extended onboarding tour across all workspace pages, a Terms page, and consent flows for data processing. Timeline: milestones now render as project-colored diamond chips with stacking and a click-through menu; added every-4-weeks repeat interval and explicit scope selection when moving repeating tasks; task comments now sync in real time. Task media moved to object storage with non-ASCII file name support. Security hardened: tightened HTML sanitization, baseline security headers, and workspace invites readable by admins only.

## [0.4.27] - 2026-04-29
### Changed
- Mobile: task-list filters inside Member and Project panels (search, statuses, assignees/projects, date range) are now collapsed by default and expand via a chevron — frees up half the screen.

## [0.4.26] - 2026-04-29
### Changed
- Mobile view of Projects and Team: search and filters are collapsed under a chevron button and only expand on demand. Opening the side browse sheet no longer auto-focuses the search input and pops the keyboard.

## [0.4.25] - 2026-04-29
### Changed
- Mobile header: added a small gap between the menu logo and the section pill buttons for visual separation.

## [0.4.24] - 2026-04-29
### Changed
- Mobile: subsections of Projects (Projects/Milestones/Customers) and Team (People/Access/Groups) moved to a top pill-nav carousel instead of the side panel. On Timeline calendar view, the filter and add-task buttons are now hidden.

## [0.4.23] - 2026-04-29
### Changed
- Mobile header now shows the Motio brand favicon as the menu logo instead of the abstract mark.

## [0.4.22] - 2026-04-29
### Changed
- Mobile header redesigned with round section buttons (Timeline, Dashboard, Projects, Team): the active one expands into a labelled pill, and the page primary action now lives in a floating button at the bottom.

## [0.4.21] - 2026-04-27
### Changed
- Landing: removed em-dashes, copy reads more naturally.

## [0.4.20] - 2026-04-25
### Changed
- No documented changes.

## [0.4.19] - 2026-04-25
### Changed
- No documented changes.

## [0.4.18] - 2026-04-25
### Changed
- No documented changes.

## [0.4.17] - 2026-04-25
### Changed
- No documented changes.

## [0.4.16] - 2026-04-25
### Changed
- No documented changes.

## [0.4.15] - 2026-04-25
### Changed
- No documented changes.

## [0.4.14] - 2026-04-24
### Changed
- No documented changes.

## [0.4.13] - 2026-04-24
### Changed
- No documented changes.

## [0.4.12] - 2026-04-24
### Changed
- Final landing CTA: 'Try Motio now' headline, updated testing-mode copy, 'Start now' button.

## [0.4.11] - 2026-04-24
### Changed
- Rewrote the founder block in a personal voice — a real story about BIM and the 'who's working on what this week' problem. Removed the 'Read the manifesto' link.

## [0.4.10] - 2026-04-24
### Changed
- Landing page refresh: new positioning, self-hosted & SSO section, honest early-access CTA, founder intro block.

## [0.4.9] - 2026-04-22
### Fixed
- Fixed milestone list sorting: the 'Upcoming' tab now shows the soonest dates on top (April → May → July), and the 'Past' tab shows the most recent past dates first.

## [0.4.8] - 2026-04-22
### Fixed
- Fixed milestone list sorting: the 'Upcoming' tab now shows the soonest dates on top (April → May → July), and the 'Past' tab shows the most recent past dates first.

## [0.4.7] - 2026-04-22
### Changed
- Timeline task bars now have a small top padding inside their row — no longer flush against the row's top border.

## [0.4.6] - 2026-04-22
### Changed
- Timeline task bars now have a small top padding inside their row — no longer flush against the row's top border.

## [0.4.5] - 2026-04-22
### Changed
- Timeline perf: scoped TaskBar store subscriptions, rAF-throttled hover tooltip, removed custom smooth-wheel scroll.

## [0.4.4] - 2026-04-22
### Changed
- Timeline perf: scoped TaskBar store subscriptions, rAF-throttled hover tooltip, removed custom smooth-wheel scroll.

## [0.4.3] - 2026-04-22
### Added
- Task-media garbage collection: images are now removed from Storage and `public.task_media` when they are deleted from a task description or when the parent task is deleted (previously they leaked).
- `DELETE /functions/v1/task-media/:id` endpoint for the media owner or workspace admin.

### Fixed
- Auto `location.reload()` when the browser hits `Failed to fetch dynamically imported module` — tabs opened before a deploy no longer break when they lazy-load a now-rotated chunk (guarded against reload loops via a 10-second cooldown).


### Changed
- Timeline milestones now render as project-colored chips with the title (max 2 per cell + +N overflow), and the milestone lane now has a localized Milestones label.

## [0.4.2] - 2026-04-22
### Changed
- No documented changes.

## [0.4.1] - 2026-04-22
### Changed
- No documented changes.

## [0.4.0] - 2026-04-22
### Added
- Account deletion with a 30-day grace period, data export, and the new tabbed Account Settings layout (Profile / Preferences / Data).

## [0.3.85] - 2026-04-21
### Changed
- No documented changes.

## [0.3.84] - 2026-04-19
### Changed
- No documented changes.

## [0.3.83] - 2026-04-14
### Changed
- No documented changes.

## [0.3.82] - 2026-04-12
### Changed
- No documented changes.

## [0.3.81] - 2026-04-06
### Changed
- No documented changes.

## [0.3.80] - 2026-04-04
### Changed
- No documented changes.

## [0.3.79] - 2026-04-04
### Changed
- No documented changes.

## [0.3.78] - 2026-04-04
### Changed
- No documented changes.

## [0.3.77] - 2026-04-03
### Changed
- No documented changes.

## [0.3.76] - 2026-04-03
### Changed
- No documented changes.

## [0.3.75] - 2026-04-03
### Changed
- No documented changes.

## [0.3.74] - 2026-04-03
### Changed
- No documented changes.

## [0.3.73] - 2026-04-03
### Changed
- No documented changes.

## [0.3.72] - 2026-04-03
### Changed
- No documented changes.

## [0.3.71] - 2026-04-03
### Changed
- No documented changes.

## [0.3.70] - 2026-04-03
### Changed
- No documented changes.

## [0.3.69] - 2026-04-03
### Changed
- Enable transaction tracing in GlitchTip (tracesSampleRate 20%)

## [0.3.68] - 2026-04-03
### Changed
- No documented changes.

## [0.3.67] - 2026-04-01
### Changed
- No documented changes.

## [0.3.66] - 2026-04-01
### Changed
- No documented changes.

## [0.3.65] - 2026-03-31
### Changed
- No documented changes.

## [0.3.64] - 2026-03-31
### Changed
- No documented changes.

## [0.3.63] - 2026-03-31
### Changed
- No documented changes.

## [0.3.62] - 2026-03-31
### Changed
- No documented changes.

## [0.3.61] - 2026-03-31
### Changed
- No documented changes.

## [0.3.60] - 2026-03-31
### Changed
- No documented changes.

## [0.3.59] - 2026-03-31
### Changed
- No documented changes.

## [0.3.58] - 2026-03-30
### Changed
- No documented changes.

## [0.3.57] - 2026-03-30
### Changed
- No documented changes.

## [0.3.56] - 2026-03-30
### Fixed
- Fixed task image uploads for files whose names contain Cyrillic or other non-Latin characters.

## [0.3.55] - 2026-03-30
### Changed
- [internal] Moved task comment image storage from Postgres to Supabase Storage with backward compatibility for legacy attachments.

## [0.3.54] - 2026-03-27
### Changed
- No documented changes.

## [0.3.53] - 2026-03-23
### Changed
- No documented changes.

## [0.3.52] - 2026-03-23
### Changed
- No documented changes.

## [0.3.51] - 2026-03-23
### Added
- Added ability to manage group members from Groups tab

## [0.3.50] - 2026-03-23
### Fixed
- Fixed group deletion error in Team section

## [0.3.49] - 2026-03-23
### Fixed
- Fixed group deletion error in Team section

## [0.3.48] - 2026-03-20
### Changed
- Fixed task loading for large timeline ranges: the gateway no longer fails long `tasks` requests with 502 responses.

## [0.3.47] - 2026-03-20
### Changed
- Timeline holiday data now loads more reliably through a backend proxy, and drag scrolling is smoother on long ranges.

## [0.3.46] - 2026-03-20
### Changed
- Improved planner timeline period controls with a smoother month label and a date picker.

## [0.3.45] - 2026-03-19
### Changed
- No documented changes.

## [0.3.44] - 2026-03-18
### Changed
- Morning Daily brief and its disable toggle; profile photo upload and member avatars on the timeline; split current and past project tasks; fixes for timeline, comments, and repeat tasks, including change-scope selection and correct relative series shifting.

## [0.3.43] - 2026-03-17
### Changed
- No documented changes.

## [0.3.42] - 2026-03-16
### Changed
- No documented changes.

## [0.3.41] - 2026-03-16
### Fixed
- Opening a task in the timeline from the members page now clears stale selection and scrolls the target card into view.

## [0.3.40] - 2026-03-16
### Changed
- Milestone dialog now uses the same project search and picker as task forms.

## [0.3.39] - 2026-03-16
### Changed
- Redeploy to testing server

## [0.3.38] - 2026-03-16
### Changed
- Fixed square overlay mask on avatar in mobile timeline view

## [0.3.37] - 2026-03-16
### Changed
- Fixed square overlay mask on avatar in mobile timeline view

## [0.3.36] - 2026-03-16
### Changed
- Profile photo upload; member avatars on timeline; daily brief toggle in account settings

## [0.3.35] - 2026-03-16
### Changed
- Member avatars on timeline now load on page open without requiring a task to be opened first

## [0.3.34] - 2026-03-16
### Changed
- Fixed initials overlay on photos; avatar updates on timeline without page reload

## [0.3.33] - 2026-03-16
### Changed
- Fixed profile photo display; improved initials overlay strip on avatars

## [0.3.32] - 2026-03-16
### Changed
- Profile photo upload; member monograms and avatars on timeline

## [0.3.31] - 2026-03-16
### Changed
- No documented changes.

## [0.3.30] - 2026-03-16
### Changed
- No documented changes.

## [0.3.29] - 2026-03-16
### Changed
- Fixed daily brief toggle labels missing Russian translations

## [0.3.28] - 2026-03-16
### Changed
- Fixed migration 0058 registration in Liquibase changelog

## [0.3.27] - 2026-03-16
### Added
- Added option to disable daily task brief in account settings

## [0.3.26] - 2026-03-15
### Changed
- Added a morning Daily brief and fixed timeline sidebar resizing plus comment loading with live counters.

## [0.3.25] - 2026-03-15
### Changed
- No documented changes.

## [0.3.24] - 2026-03-15
### Changed
- Added a morning Daily brief with urgent tasks and upcoming milestones that appears after 9 AM and does not reopen again the same day.
- Fixed timeline left sidebar resizing so the people column can be dragged again and the chosen width is preserved.
- Fixed comment loading and live counters so task threads open without author lookup errors and comment updates stay in sync across clients.

## [0.3.23] - 2026-03-15
### Changed
- No documented changes.

## [0.3.22] - 2026-03-14
### Changed
- No documented changes.

## [0.3.21] - 2026-03-14
### Changed
- No documented changes.

## [0.3.20] - 2026-03-13
### Changed
- No documented changes.

## [0.3.19] - 2026-03-13
### Changed
- No documented changes.

## [0.3.18] - 2026-03-12
### Changed
- No documented changes.

## [0.3.17] - 2026-03-12
### Changed
- No documented changes.

## [0.3.16] - 2026-03-12
### Changed
- No documented changes.

## [0.3.15] - 2026-03-12
### Changed
- No documented changes.

## [0.3.14] - 2026-03-12
### Changed
- No documented changes.

## [0.3.13] - 2026-03-12
### Changed
- No documented changes.

## [0.3.12] - 2026-03-11
### Changed
- Fixed comment count loading in team task previews: large task_comments queries are now batched, live sync no longer hits 502, and the card no longer shows a false 0 before the real count arrives.

## [0.3.11] - 2026-03-11
### Changed
- Fixed notification delete button localization, preserved timeline sidebar width across locale changes, and added comment counts to team task previews.

## [0.3.10] - 2026-03-11
### Changed
- Added a bulk 'Delete all' action to notifications so task notifications can be removed directly from the dropdown in one step.

## [0.3.9] - 2026-03-11
### Changed
- Fixed the comment mention popup inside the task detail modal so the member list can be scrolled and selected again without the modal layer blocking interactions.

## [0.3.8] - 2026-03-11
### Changed
- New tasks now default to no project. A project is preselected only when task creation is opened from an explicit project context such as a project row.

## [0.3.7] - 2026-03-11
### Changed
- Improved the comment mention picker so it scrolls, candidate clicks insert mentions reliably, and hovered members are highlighted.

## [0.3.6] - 2026-03-11
### Changed
- Fixed: the comment mention popup now renders through a portal and no longer drifts inside dialogs, and @mention notifications are no longer mislabeled as task assignments.

## [0.3.5] - 2026-03-11
### Changed
- Fixed: the comment mention popup now opens next to the @ button or caret and allows scrolling through the full member list.

## [0.3.4] - 2026-03-11
### Changed
- Fixed: the comment @mention picker opens next to the caret again and stays visible inside the viewport.

## [0.3.3] - 2026-03-11
### Changed
- Fixed comment @mention: the user picker now opens when typing @ inside contenteditable wrapper nodes, with workspace member names and monograms.

## [0.3.2] - 2026-03-11
### Changed
- Fixed comment @mention popup: clicking the toolbar button now shows a visible workspace member list with names and monograms.

## [0.3.1] - 2026-03-11
### Changed
- Comment @mention now shows all workspace members, not only task assignees.

## [0.3.0] - 2026-03-11
### Changed
- Planner comments: live-synced timeline counters and a more compact comment editor.
- Release pipeline: deploy-remote and release now support an explicit NEXT_VERSION so minor releases can be shipped without bypassing the scripts.
- Comments: the editor no longer shows a separate label above the input and now opens as a single line, expanding automatically while typing.
- Planner: timeline comment counters now update immediately after comment create or delete and catch up via live sync without a page reload.

## [0.2.98] - 2026-03-11
### Added
- Task comments: editor with @mentions, notifications, and a timeline counter.

## [0.2.97] - 2026-03-09
### Changed
- The login screen now serves the correct favicon immediately for light and dark browser themes.

## [0.2.96] - 2026-03-09
### Fixed
- Favicons now follow the browser color scheme: the light icon is used in light mode, the dark icon in dark mode, including the login screen.

## [0.2.95] - 2026-03-09
### Fixed
- Favicon assets are now synchronized across the public site and login screen: fallback icons, edge proxy routes, and the Keycloak theme favicon were updated.

## [0.2.94] - 2026-03-09
### Changed
- Public branding assets refreshed: the site now uses the updated favicon and public images.

## [0.2.93] - 2026-03-09
### Changed
- No documented changes.

## [0.2.92] - 2026-03-08
### Security
- PostgreSQL port (54322) rebound from `0.0.0.0` to `127.0.0.1` — external internet access closed.

## [0.2.91] - 2026-03-08
### Changed
- Backup service: dump integrity validation via `pg_restore --list` and non-zero file size check after `pg_dump`.
- Edge functions (admin, invite): DB/infrastructure error codes corrected from 400 to 500.
- Admin edge function: added error handling in `Promise.all` for profiles, members, tasks, owners queries.
- Caddy: added `Strict-Transport-Security` header (HSTS, max-age=1 year) for motio.nikog.net.

## [0.2.90] - 2026-03-08
### Changed
- No documented changes.

## [0.2.89] - 2026-03-07
### Changed
- Workspace settings: the General and Workflow top tabs now use the shared project tab style.

## [0.2.88] - 2026-03-07
### Changed
- No documented changes.

## [0.2.87] - 2026-03-07
### Changed
- Planner: removed the experimental timeline task title shifting so labels render again in their original static layout.

## [0.2.86] - 2026-03-07
### Changed
- Planner: long timeline task titles now stay within the visible segment and do not drift deeper into the bar after shifting.

## [0.2.85] - 2026-03-07
### Changed
- Planner: minimal shifted task titles now reach the visible boundary correctly and remain readable.

## [0.2.84] - 2026-03-07
### Changed
- Planner: long timeline task titles stop shifting inside the bar once they reach the visible boundary.

## [0.2.83] - 2026-03-07
### Changed
- Planner: long timeline tasks now show the remaining title in a compact two-line mode instead of truncating too early.

## [0.2.82] - 2026-03-07
### Changed
- Planner: timeline task labels now stay in place when the title is already visible, and the project name remains in the default layout.

## [0.2.81] - 2026-03-07
### Changed
- Planner: timeline label shifting now applies only to genuinely long tasks, while short partially clipped tasks keep their default label position.

## [0.2.80] - 2026-03-07
### Changed
- Planner: long timeline tasks now shift their label into the visible segment and hide secondary info when space is tight.

## [0.2.79] - 2026-03-07
### Changed
- Team: aligned width and internal layout of Active/Disabled/History controls in the access sidebar.

## [0.2.78] - 2026-03-07
### Changed
- Team: moved Active/Disabled/History access views and search into the left sidebar.

## [0.2.77] - 2026-03-07
### Changed
- No documented changes.

## [0.2.76] - 2026-03-07
### Changed
- No documented changes.

## [0.2.75] - 2026-03-07
### Changed
- No documented changes.

## [0.2.74] - 2026-03-07
### Changed
- No documented changes.

## [0.2.73] - 2026-03-07
### Changed
- No documented changes.

## [0.2.72] - 2026-03-06
### Changed
- No documented changes.

## [0.2.71] - 2026-03-06
### Changed
- No documented changes.

## [0.2.70] - 2026-03-06
### Added
- Landing: refreshed homepage design with animated demo blocks, updated sections, and expanded Russian localization copy.

### Fixed
- Keycloak: increased spacing between cards on 'Account already exists', made the back-to-other-sign-in action explicit, and aligned the warning block with Motio styling.

## [0.2.69] - 2026-03-06
### Fixed
- Fixed Keycloak 'Account already exists' screen: action buttons no longer merge and text is compact; 'Return to Home' is now placed above the footer signature.

## [0.2.68] - 2026-03-06
### Changed
- Styled Keycloak 'Account already exists' linking screens to match Motio and added a return-to-home action on login pages.

## [0.2.67] - 2026-03-06
### Fixed
- Fixed assignee picker ordering while popover is open: no jump or auto-scroll until it closes.
- Removed duplicate assignment notifications when creating recurring task series.

## [0.2.66] - 2026-03-06
### Changed
- No documented changes.

## [0.2.65] - 2026-03-06
### Changed
- No documented changes.

## [0.2.64] - 2026-03-05
### Changed
- No documented changes.

## [0.2.63] - 2026-03-05
### Changed
- No documented changes.

## [0.2.62] - 2026-03-05
### Changed
- No documented changes.

## [0.2.61] - 2026-03-05
### Changed
- No documented changes.

## [0.2.60] - 2026-03-05
### Fixed
- Fixed dashboard crash on /app/dashboard caused by a missing Settings import ('Settings is not defined').

## [0.2.59] - 2026-03-05
### Changed
- No documented changes.

## [0.2.58] - 2026-03-03
### Changed
- No documented changes.

## [0.2.57] - 2026-03-03
### Changed
- No documented changes.

## [0.2.56] - 2026-03-03
### Changed
- No documented changes.

## [0.2.55] - 2026-03-03
### Changed
- No documented changes.

## [0.2.54] - 2026-03-02
### Changed
- No documented changes.

## [0.2.53] - 2026-03-02
### Changed
- No documented changes.

## [0.2.52] - 2026-03-02
### Changed
- No documented changes.

## [0.2.51] - 2026-03-02
### Changed
- No documented changes.

## [0.2.50] - 2026-03-02
### Changed
- No documented changes.

## [0.2.49] - 2026-03-01
### Changed
- No documented changes.

## [0.2.48] - 2026-03-01
### Changed
- No documented changes.

## [0.2.47] - 2026-03-01
### Changed
- No documented changes.

## [0.2.46] - 2026-03-01
### Changed
- No documented changes.

## [0.2.45] - 2026-03-01
### Changed
- No documented changes.

## [0.2.44] - 2026-03-01
### Changed
- No documented changes.

## [0.2.43] - 2026-03-01
### Changed
- No documented changes.

## [0.2.42] - 2026-03-01
### Changed
- No documented changes.

## [0.2.41] - 2026-03-01
### Changed
- No documented changes.

## [0.2.40] - 2026-03-01
### Changed
- No documented changes.

## [0.2.39] - 2026-03-01
### Changed
- No documented changes.

## [0.2.38] - 2026-03-01
### Changed
- No documented changes.

## [0.2.37] - 2026-03-01
### Changed
- No documented changes.

## [0.2.36] - 2026-03-01
### Changed
- No documented changes.

## [0.2.35] - 2026-03-01
### Changed
- No documented changes.

## [0.2.34] - 2026-03-01
### Changed
- No documented changes.

## [0.2.33] - 2026-03-01
### Changed
- No documented changes.

## [0.2.32] - 2026-03-01
### Changed
- No documented changes.

## [0.2.31] - 2026-03-01
### Changed
- No documented changes.

## [0.2.30] - 2026-03-01
### Changed
- No documented changes.

## [0.2.29] - 2026-03-01
### Changed
- No documented changes.

## [0.2.28] - 2026-03-01
### Changed
- No documented changes.

## [0.2.27] - 2026-03-01
### Changed
- No documented changes.

## [0.2.26] - 2026-03-01
### Changed
- No documented changes.

## [0.2.25] - 2026-03-01
### Changed
- No documented changes.

## [0.2.24] - 2026-03-01
### Changed
- No documented changes.

## [0.2.23] - 2026-02-26
### Changed
- No documented changes.

## [0.2.22] - 2026-02-26
### Changed
- No documented changes.

## [0.2.21] - 2026-02-26
### Changed
- No documented changes.

## [0.2.20] - 2026-02-25
### Changed
- No documented changes.

## [0.2.19] - 2026-02-25
### Changed
- No documented changes.

## [0.2.18] - 2026-02-25
### Changed
- Rebranding: project and user-facing surfaces were renamed to Motio (updated page titles, auth/account branding, and Keycloak/email display name).

## [0.2.17] - 2026-02-25
### Changed
- User-facing release logs were refreshed with detailed change notes for versions `0.2.15` and `0.2.16`.

## [0.2.16] - 2026-02-25
### Changed
- Planner: deduplicated repeat/project query rules between task create/edit flows so filtering and validation behavior stays consistent and covered by tests.

## [0.2.15] - 2026-02-25
### Changed
- Planner: moved Supabase requests from member/task UI components into store actions so UI flows use one scenario layer with predictable sync/error handling.

## [0.2.14] - 2026-02-24
### Fixed
- Timeline: milestone lane (between header dates and user rows) now supports milestone creation via double-click on a date cell.

## [0.2.13] - 2026-02-24
### Fixed
- Timeline: user row cells now show task-only context actions; milestone creation was removed from row cells, and row clicks no longer trigger milestone selection/edit.

## [0.2.12] - 2026-02-24
### Changed
- Timeline: double-click on a user row cell now always creates a task (date milestones no longer hijack the action). Deploy: edge functions are force-recreated on release to clear stale deno cache and import errors.

## [0.2.11] - 2026-02-24
### Changed
- Planner refactor: heavy timeline/projects/members logic moved to selectors; task create and edit now share a single rule set for project filtering and repeat validation.

## [0.2.10] - 2026-02-24
### Changed
- UI: removed status color indicators across the app (filters, tables, task detail cards, task tooltip/context menu). Statuses are now shown as text/emoji only.

## [0.2.9] - 2026-02-24
### Fixed
- Timeline day/week: on dates with multiple milestones, right-click no longer routes to task creation; it now opens a context menu with Create milestone action.

## [0.2.8] - 2026-02-24
### Changed
- Timeline day/week: milestone creation moved from double-click to right-click on date (Create milestone context action), including dates that already have milestones.

## [0.2.7] - 2026-02-24
### Fixed
- Timeline day/week: date hover and click now show milestone info and a milestone chooser; when multiple milestones exist on a date, clicking the day/dot opens a picker instead of a random milestone.


### Changed
- Deploy: infra/releases.log now stores a short release summary so logs clearly show what changed in each release.

## [0.2.6] - 2026-02-24
### Changed
- No documented changes.

## [0.2.5] - 2026-02-24
### Changed
- No documented changes.

## [0.2.4] - 2026-02-24
### Changed
- No documented changes.

## [0.2.3] - 2026-02-24
### Changed
- No documented changes.

## [0.2.2] - 2026-02-24
### Changed
- No documented changes.

## [0.2.1] - 2026-02-24
### Changed
- No documented changes.

## [0.1.83] - 2026-02-20
### Changed
- Dashboard: increased default legend display limits (more columns/rows and denser layout). More categories are now shown before collapsing into hidden items.

## [0.1.82] - 2026-02-20
### Fixed
- Dashboard: charts are no longer simplified on page reload by legend adaptation. Only legend items are compacted now (with a hidden-items indicator), while chart data is always rendered in full.

## [0.1.81] - 2026-02-20
### Fixed
- Dashboard: fixed a regression where chart legends could disappear entirely for certain widget sizes; legend now always renders when data exists, and "Other" aggregation is applied only when there is enough room.

## [0.1.80] - 2026-02-20
### Changed
- Dashboard: added widget grouping by task type (Task types); updated RPC aggregations so charts and KPI metrics are correctly computed by type without regressions for existing groupings.


### Fixed
- Timeline: added project info to task hover tooltip. Dashboard: fixed legend overlapping charts when widget height is small (adaptive legend compaction/limits and chart min-height tuning).
- Dashboard: legend is now dynamically bounded by available widget space; overflow categories are automatically grouped into "Other" so the legend never covers the chart even in very narrow/short widgets.

## [0.1.79] - 2026-02-20
### Changed
- No documented changes.

## [0.1.78] - 2026-02-20
### Changed
- No documented changes.

## [0.1.77] - 2026-02-20
### Changed
- No documented changes.

## [0.1.76] - 2026-02-20
### Changed
- No documented changes.

## [0.1.75] - 2026-02-20
### Changed
- No documented changes.

## [0.1.74] - 2026-02-20
### Changed
- No documented changes.

## [0.1.73] - 2026-02-20
### Changed
- No documented changes.

## [0.1.72] - 2026-02-20
### Changed
- Infra: added moderate PostgreSQL tuning in compose (max_connections/shared_buffers/effective_cache_size/work_mem/maintenance_work_mem/max_wal_size) configurable via environment variables.

## [0.1.71] - 2026-02-20
### Fixed
- Task deletion latency reduced: client-side optimistic delete with rollback on failure was added, and realtime delete events now apply immediately even during timeline scrolling.

## [0.1.70] - 2026-02-20
### Changed
- Planner: added live task/milestone sync via Supabase Realtime with buffered batched updates, interaction-aware apply deferral during timeline scroll, and focus reconcile for reload-free updates without jitter.

## [0.1.69] - 2026-02-20
### Fixed
- Timeline: fixed current-day indicator refresh after long idle tab sessions. The 'today' highlight now updates automatically on tab return and after midnight without page reload.

## [0.1.68] - 2026-02-19
### Fixed
- Fixed subtask visibility in task details modal: existing subtasks now load and display automatically on open.

## [0.1.67] - 2026-02-19
### Fixed
- Subtasks fixed: added RU translations for new labels, added subtask deletion in task details and in create-task dialog, and persisted subtasks on task creation.

## [0.1.66] - 2026-02-19
### Added
- Added task subtasks in task details: collapsed-by-default block, ‘Add subtask’ action, and checkbox completion with strikethrough that does not affect parent task status.

## [0.1.65] - 2026-02-19
### Changed
- No documented changes.

## [0.1.64] - 2026-02-19
### Changed
- No documented changes.

## [0.1.63] - 2026-02-19
### Changed
- No documented changes.

## [0.1.62] - 2026-02-19
### Changed
- No documented changes.

## [0.1.61] - 2026-02-19
### Changed
- Invites now create/link an account for emails that have never signed in: once setup is completed from email, the user can immediately accept the invite and access the workspace.
- Auth flow now includes a durable `redirect` mechanism for invite links so users return to `/invite/:token` after Keycloak sign-in instead of losing context.
- Removed remaining `RESEND` dependencies from dev `.env` generation; SMTP defaults are now neutral and branded as `Motio - Timeline Planner`.
- Updated product branding (`Motio - Timeline Planner`) in app metadata, realm configs, and SMTP sender naming.
- Added an ownership notice with a `nikog.net` link at the bottom of Account settings.
- Added automatic Keycloak realm branding/email-theme enforcement and customized `execute-actions` invite email copy.

## [0.1.60] - 2026-02-19
### Changed
- Invite delivery was switched from Resend to Keycloak email (`execute-actions-email`) with redirect to the invite link.
- Removed invite-function dependency on `RESEND_API_KEY`/`RESEND_FROM` and `INVITE_REQUIRE_EMAIL_DELIVERY` environment variables.

## [0.1.59] - 2026-02-19
### Fixed
- In Members -> Access, duplicate invite status cards were removed and the fallback invite-link block is no longer shown; the UI now displays a single final result message.
- Invite function now enforces email delivery checks (enabled by default in production): if email delivery fails, the operation returns an error instead of reporting a false success.

## [0.1.58] - 2026-02-19
### Fixed
- In calendar mode, clicking a date now reliably triggers the same top timeline date highlight animation when switching to week view.
- “Go to task” now performs an extra horizontal timeline scroll to the exact task so it consistently lands in view.

## [0.1.57] - 2026-02-19
### Changed
- The timeline Today button is now more readable (contrast/shadow/position) and appears immediately once the current day leaves the visible range.
- In calendar mode, clicking a milestone now opens the weekly timeline and animates the selected date highlight.
- Milestone modal on the timeline now allows date editing when updating an existing milestone.

## [0.1.56] - 2026-02-19
### Changed
- When approaching timeline edges, the date window now expands again, allowing continuous scrolling to past/future beyond the two-month viewport.
- deploy-remote no longer runs firewall hardening by default; run it explicitly with RUN_FIREWALL_HARDEN=1.

## [0.1.55] - 2026-02-19
### Fixed
- Removed timeline jitter on scroll stop: date re-anchoring now runs only near range edges and with a minimum shift threshold.

## [0.1.54] - 2026-02-19
### Changed
- Reduced task jitter when timeline scrolling stops: anchor date sync is now threshold-based instead of recalculating on every tiny pan shift.

### Fixed
- Fixed production realtime WebSocket setup: Realtime now uses the supabase_admin DB role, and the standard production deploy now starts/updates realtime together with the gateway.
- Removed websocket `431` failures for signed-in users: the gateway no longer forwards browser cookies to Realtime on `/realtime/v1`.

## [0.1.53] - 2026-02-19
### Fixed
- Fixed realtime backend routing: added Supabase Realtime service and /realtime/v1 proxying through the gateway so notification WebSocket connections work reliably.

## [0.1.52] - 2026-02-19
### Fixed
- Fixed realtime WebSocket console errors: added proper /realtime/v1 reverse-proxy routing in Caddy so notifications work without repeated reconnect failures.
- Removed task jitter when horizontal timeline scrolling stops: stabilized date-range shift compensation when updating the focused date.

## [0.1.51] - 2026-02-19
### Changed
- Task assignment notifications now arrive without page reload: added realtime subscription with a safe polling fallback during network issues.
- Improved timeline performance: reduced unnecessary rerenders during scrolling and double-click task creation, noticeably lowering UI latency while working with tasks.

## [0.1.50] - 2026-02-19
### Changed
- No documented changes.

## [0.1.49] - 2026-02-19
### Changed
- No documented changes.

## [0.1.48] - 2026-02-19
### Changed
- No documented changes.

## [0.1.47] - 2026-02-19
### Changed
- No documented changes.

## [0.1.46] - 2026-02-18
### Changed
- No documented changes.

## [0.1.45] - 2026-02-18
### Changed
- Dashboard mobile: disabled text/chart selection and long-press/right-click context menus; widget creation is now available only via the Widget button; added visual long-press feedback for drag enablement and a widget delete button in the edit dialog.

## [0.1.44] - 2026-02-18
### Changed
- Dashboard mobile: increased minimum chart widget height on xs/sm and constrained legend with top-N + ‘more’ to keep charts visible; task repeats UI labels were updated (‘Until date’, ‘Count’), helper hints were added, and repeat generation in task edit is now triggered on save (OK/Save) with full RU/EN localization.

## [0.1.43] - 2026-02-18
### Fixed
- Dashboard: widget drag on touch now requires long-press; fixed legend overlapping charts on iPhone/iPad; restored assignee list scrolling in timeline task edit.

## [0.1.42] - 2026-02-18
### Fixed
- Fixed chart legend rendering on mobile devices: legend is now forced below the chart, constrained in height with scrolling, and no longer overlaps the chart area.

## [0.1.41] - 2026-02-18
### Changed
- Implemented Motion dashboard adaptation for different screen formats: added deterministic responsive breakpoints/grid, stable layout normalization across breakpoints, and profile-aware widget/legend rendering for phone/tablet/laptop/desktop/wall.

## [0.1.40] - 2026-02-17
### Changed
- Reworked color ordering in the “Pastel sky” and “Pastel dawn” palettes so colors differ more clearly within each palette for faster series recognition on charts.

## [0.1.39] - 2026-02-17
### Changed
- Reworked pastel dashboard palettes to use multi-hue pastel colors (instead of many close shades of one hue) for clearer series distinction.
- Expanded dashboard chart palettes with more distinct neighboring colors and updated palette preview in widget settings.
- Enabled milestone date editing in the create/edit dialog inside Projects → Milestones.
- Added Current/Past milestone split in Projects → Milestones with persisted tab selection and proper filtering.

## [0.1.38] - 2026-02-17
### Changed
- Added Milestones subtab in Projects with search, grouping, and milestone management

## [0.1.37] - 2026-02-16
### Changed
- Added per-user timeline sidebar width resizing with persisted preference

## [0.1.36] - 2026-02-16
### Changed
- Made timeline sidebar width adaptive and improved rendering for long user names

## [0.1.35] - 2026-02-16
### Changed
- Stabilized adaptive chart legend layout, added a show/hide legend toggle in widget settings, and improved project list scrolling in task project pickers.

## [0.1.34] - 2026-02-16
### Fixed
- Fixed project search behavior in task creation: the typed filter is now visible and the localized no-results message is displayed correctly.

## [0.1.33] - 2026-02-16
### Changed
- Added keyboard quick search for projects in the project picker when creating a task.

## [0.1.32] - 2026-02-16
### Changed
- No documented changes.

## [0.1.31] - 2026-02-16
### Changed
- On the timeline, the current day is now shifted left: 2 previous days are shown and more space is reserved for upcoming dates.


### Fixed
- In task creation, assignees already selected are now shown at the top of the assignee list.

## [0.1.30] - 2026-02-16
### Fixed
- Improved assignee selection when creating timeline tasks: you can now unassign any assignee, keep a task unassigned, and select multiple co-assignees.

## [0.1.29] - 2026-02-14
### Fixed
- Improved timeline load speed: primary data appears faster, while task counters and tracked projects load in the background.

## [0.1.28] - 2026-02-14
### Fixed
- Fixed edge compression: app assets are now served compressed for faster loading.

## [0.1.27] - 2026-02-14
### Fixed
- Improved first-load performance: enabled compression and lazy-loaded sections as you open them.

## [0.1.26] - 2026-02-14
### Fixed
- Improved timeline loading and task counts performance for large workspaces.

## [0.1.25] - 2026-02-14
### Security
- Hardened Keycloak security: external access now requires HTTPS.

## [0.1.24] - 2026-02-14
### Fixed
- Reduced brief 502 errors during releases: the API gateway and edge proxy now reload gracefully without hard restarts.

## [0.1.23] - 2026-02-14
### Fixed
- Stabilized sign-in: reduced oauth2-proxy cookie session size to avoid overflow and login issues in some browsers.

## [0.1.22] - 2026-02-14
### Fixed
- Improved login page load speed: Keycloak static assets now keep correct cache headers so browsers can cache them properly.

## [0.1.21] - 2026-02-14
### Security
- Tightened API CORS rules: only trusted origins are allowed and `Access-Control-Allow-Credentials` was removed to prevent cross-site reads from untrusted domains.

## [0.1.20] - 2026-02-14
### Security
- Deploy now automatically checks and, if needed, syncs the Keycloak OIDC client secret with production settings, preventing login breakage after Keycloak re-creation.

## [0.1.19] - 2026-02-14
### Security
- Hardened authentication security: rotated default OIDC secrets and added a deployment guard to block dev/default secrets.

## [0.1.18] - 2026-02-14
### Changed
- No documented changes.

## [0.1.17] - 2026-02-14
### Fixed
- Fixed pie-chart legend labels so technical/internal keys are no longer shown; the aggregated item is always rendered as `Other`.
- Added background horizontal grid lines to `Line chart` and `Area chart` widgets to match the bar chart visual grid.

## [0.1.16] - 2026-02-13
### Changed
- Dashboard chart widgets now adapt chart/legend layout to the actual widget size and screen resolution, including ultrawide displays.

## [0.1.15] - 2026-02-13
### Fixed
- Standardized Russian weekday abbreviations across calendar views to the exact format: `Пн`, `Вт`, `Ср`, `Чт`, `Пт`, `Сб`, `Вс`.

## [0.1.14] - 2026-02-13
### Added
- Added project edit opening by double-click in `Projects -> Projects`.

### Changed
- Timeline month names and weekday labels now follow the active interface language (Russian/English).
- In the `Milestones` widget (`List` style), items are now filled adaptively based on actual card size and viewer screen resolution, showing the maximum that fits.

### Fixed
- Improved dialog accessibility by adding required descriptions, removing runtime warnings and improving screen-reader behavior.
- Refined Keycloak routing so `/realms/master`, `/realms/timeline`, and `/admin/master/console` automatically open the correct login/console pages.

## [0.1.13] - 2026-02-13
### Fixed
- Stabilized loading of unique task counters in `Timeline` and `Members`, so values are shown correctly and without post-update errors.

## [0.1.12] - 2026-02-13
### Changed
- In Timeline, the left-side member counters now show unique task counts without duplicate recurring series.
- In `Members -> Tasks`, member counters now come pre-aggregated in the correct format, without a brief “all tasks” intermediate value.

## [0.1.11] - 2026-02-13
### Added
- Added a new task repeat option: `Biweekly (every 2 weeks)`, available in both Russian and English UI.

### Changed
- In timeline task creation, long project names in the `Project` field now stay on a single line and are neatly truncated.
- Removed the intermediate welcome screen from the login flow: regular sign-in now redirects directly to Keycloak.

### Fixed
- The repeating-task (`Repeat`) icon now has a consistent fixed size across timeline task cards.
- Workspace invite reaction toasts (accepted/declined) no longer appear long after the fact; only fresh new reactions are shown.

## [0.1.10] - 2026-02-13
### Fixed
- Mouse-wheel scrolling works again in the `Customer` dropdown while creating/editing a project.
- Action buttons in recurring-task delete dialogs are now responsive and no longer clip in small modal layouts.
- When editing a recurring task, the `Repeat` section now auto-fills the current series settings (frequency and occurrence count) instead of showing an empty state.
- Updated edge cache headers for Keycloak resources to reduce stale/broken cached styles on the admin login page.

## [0.1.9] - 2026-02-13
### Changed
- No documented changes.

## [0.1.8] - 2026-02-13
### Changed
- Improved authentication and login page speed: Keycloak production now uses theme/static caching.
- Reduced post-login delay: removed duplicate startup requests for profile/roles/workspaces during session initialization.
- Removed external Google Fonts loading from the app so login and first render no longer depend on a third-party CDN.

## [0.1.7] - 2026-02-13
### Fixed
- Finalized edge settings for the auth page: compression and caching of Keycloak resources now apply correctly on production.

## [0.1.6] - 2026-02-13
### Changed
- Improved authentication page load speed: Keycloak static resources are now compressed at the edge and cached by the browser.

### Fixed
- Fixed the “Latest changes” modal: it now shows only the current release block without pulling older versions.

## [0.1.5] - 2026-02-13
### Fixed
- In English UI, widget creation now fully translates `Type` and `Period`, including all option values inside those selectors.
- In widget advanced filters, all rule parts are translated (fields, operators, and rule-group match modes).
- The “latest changes” modal now hides technical sections and shows only user-facing product updates.

## [0.1.4] - 2026-02-13
### Changed
- Updated dashboard widget creation UI: fields inside the modal no longer clip at the edges, and focus/content render fully.
- Improved dashboard grid behavior: widgets can no longer overlap during drag/resize.
- `Members -> Tasks` now remembers user list preferences: `A-Z / Z-A` sorting and `grouped / ungrouped` mode.
- In timeline calendar mode, date selection animation now highlights only the selected date instead of the full column.

### Added
- Added milestone creation on timeline by double-clicking a date (in day header and milestone row).
- If multiple milestones share the same date, timeline shows all dots and tooltip displays the full list for that day.
- Added app version in account settings: a small clickable version label at the bottom opens a modal with latest changes.

### Fixed
- Extended interface localization (including widget creation and timeline task form/details) so key fields and actions are no longer left in English.
- Fixed dashboard grid collision: a small widget can no longer be placed on top of a large one (strict no-overlap during drag/resize).
- Fixed version display: the version shown in UI now always matches the deployed release.

## [0.1.0] - 2026-02-13
### Added
- Introduced baseline release versioning with `VERSION`.
- Added project-level changelog file (`CHANGELOG.md`).
- Added deployment release log file (`infra/releases.log`).
- Added automatic deployment log append in `infra/scripts/prod-compose.sh`.
