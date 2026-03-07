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

## Scenario 2: Projects tasks and member tasks use cards on mobile

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

## Scenario 3: Members page uses sheet-based selector on mobile

Given:
- пользователь открыт на `/app/members`;
- ширина экрана меньше `768px`.

When:
- рендерится страница участников;
- пользователь открывает selector/sidebar.

Then:
- выбор участников/групп выполняется через mobile sheet;
- основной panel `tasks/access/groups` остается на странице в одном столбце;
- desktop постоянный sidebar сохраняется только для `768px+`.

Покрытие:
- `src/features/members/pages/MembersPage.tsx`
- `src/features/members/components/MembersSidebar.tsx`
- `src/shared/ui/mobile-page-sheet-layout.tsx`
- `src/test/members/membersPage.mobileLayout.test.tsx`
