# Changelog

All notable changes to this project should be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
