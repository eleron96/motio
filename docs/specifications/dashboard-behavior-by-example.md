# Dashboard behavior by example

## Scenario 1: Disabled users are hidden from By user widgets by default

Given:
- в workspace есть активные и отключенные пользователи;
- у отключенного пользователя есть назначенные задачи;
- в dashboard есть chart widget с группировкой `By user`.

When:
- пользователь открывает настройки фильтров виджета при выключенном тумблере `Show disabled users`;
- dashboard загружает статистику и легенду виджета.

Then:
- отключенные пользователи не отображаются в assignee-значениях advanced filters;
- задачи, назначенные только на отключенных пользователей, не попадают в totals, series и legend виджета;
- задачи с активным и отключенным пользователем остаются в статистике по активному пользователю;
- при включении `Show disabled users` отключенные пользователи снова доступны в фильтрах и возвращаются в статистику и legend.

## Scenario 2: Disabled-user toggle is hidden outside By user grouping

Given:
- пользователь редактирует chart widget с группировкой `By project`.

When:
- открывается диалог настройки виджета.

Then:
- тумблер `Show disabled users` не отображается;
- assignee-значения в advanced filters остаются доступными без скрытой фильтрации по disabled-статусу.

Покрытие:
- `src/features/dashboard/components/WidgetEditorDialog.tsx`
- `src/features/dashboard/lib/dashboardAssigneeOptions.ts`
- `src/features/dashboard/pages/DashboardPage.tsx`
- `src/features/dashboard/store/dashboardStore.ts`
- `infra/supabase/migrations/0055_add_dashboard_disabled_assignee_stats.sql`
- `src/test/dashboard/dashboardAssigneeOptions.test.ts`
- `src/test/dashboard/widgetEditorDialog.test.tsx`
