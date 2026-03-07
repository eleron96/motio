# Private Workspace Pages Mobile Behavior By Example

Спецификация фиксирует минимальную мобильную адаптацию внутренних страниц `Projects` и `Members` без изменения desktop-layout.

## Scenario 1: Projects page uses sheet-based sidebar on mobile

Given:
- пользователь открыт на `/app/projects`;
- ширина экрана меньше `768px`.

When:
- рендерится страница проектов;
- пользователь открывает selector/sidebar.

Then:
- sidebar рендерится внутри mobile sheet вместо постоянной левой колонки;
- основной контент проектов остается в одном столбце на странице;
- desktop `ResizablePanelGroup` не используется как основной mobile-layout.

Покрытие:
- `src/features/projects/pages/ProjectsPage.tsx`
- `src/shared/ui/mobile-page-sheet-layout.tsx`
- `src/test/projects/projectsPage.mobileLayout.test.tsx`

## Scenario 2: Projects tasks and people tasks use cards on mobile

Given:
- пользователь открыт на `/app/projects` или `/app/members`;
- на мобильном экране отображается список задач.

When:
- рендерится основной panel c задачами.

Then:
- задачи рендерятся карточками вместо desktop-таблиц;
- фильтры и действия складываются в один столбец;
- desktop table-layout остается только для экранов `768px+`.

Покрытие:
- `src/features/projects/components/ProjectsMainPanel.tsx`
- `src/features/members/components/MemberTasksPanel.tsx`
- `src/test/projects/projectsMainPanel.mobile.test.tsx`
- `src/test/members/memberTasksPanel.mobile.test.tsx`

## Scenario 3: Team page uses sheet-based selector on mobile

Given:
- пользователь открыт на `/app/members`;
- ширина экрана меньше `768px`.

When:
- рендерится страница участников;
- пользователь открывает selector/sidebar.

Then:
- выбор `People/Access/Groups` выполняется через mobile sheet;
- основной panel `tasks/access/groups` остается на странице в одном столбце;
- desktop постоянный sidebar сохраняется только для `768px+`.

Покрытие:
- `src/features/members/pages/MembersPage.tsx`
- `src/features/members/components/MembersSidebar.tsx`
- `src/shared/ui/mobile-page-sheet-layout.tsx`
- `src/test/members/membersPage.mobileLayout.test.tsx`

## Scenario 4: Team access separates active, disabled, and history views

Given:
- пользователь открыт в разделе `Team`;
- открыт режим `Access`;
- в workspace есть активные и отключенные люди, а также история изменений прав/групп.

When:
- рендерится panel доступа команды;
- пользователь переключает под-вкладки `Active`, `Disabled`, `History`.

Then:
- выбор `Active`, `Disabled`, `History` рендерится отдельным selector-блоком сбоку, а не узкой полосой сверху;
- `Active` показывает только активных людей;
- `Disabled` показывает только отключенных людей;
- в `Active` и `Disabled` доступен поиск по участникам;
- `History` показывает текстовые записи с датой и временем о приглашениях, смене ролей, смене групп, отключении и удалении.

Покрытие:
- `src/features/workspace/components/WorkspaceMembersPanel.tsx`
- `src/shared/lib/workspaceMemberActivity.ts`
- `src/test/workspace/workspaceMembersPanel.access.test.tsx`
- `src/test/shared/workspaceMemberActivity.test.ts`
