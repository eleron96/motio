# Changelog

All notable changes to this project should be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
