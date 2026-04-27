# Codex Map — Motio

Текущая карта системы. Codex читает этот файл в Startup Protocol.
Обновлять при добавлении новых модулей, фич или изменении архитектуры.

Последнее обновление: 2026-03-31

## Что такое Motio

Workspace-планировщик задач с таймлайном, проектами, участниками и дашбордом.
Стек: React 18 + Vite + Zustand + Supabase (PostgreSQL + Edge Functions) + Keycloak (auth).

---

## Карта фронтенда (`src/`)

### Точка входа

```
src/app/
  App.tsx                  — роутинг, провайдеры
  main.tsx                 — ReactDOM.render
  ProtectedRoute.tsx       — защита маршрутов
  PageErrorBoundary.tsx    — глобальный error boundary
```

---

### Features

#### `features/planner` — ядро системы
Таймлайн задач, повторяющиеся задачи, комментарии, фильтры.

```
pages/
  PlannerPage.tsx          — главный экран, собирает всё

components/
  TaskDetailPanel.tsx      — панель деталей задачи (модал)
  SubtasksSection.tsx      — секция подзадач
  AddTaskDialog.tsx        — диалог создания задачи
  FilterPanel.tsx          — панель фильтров
  RepeatSettingsFields.tsx — поля настройки повторений
  RepeatTaskScopeDialog.tsx — выбор области изменения повторов
  TaskCommentSection.tsx   — секция комментариев
  CommentEditor.tsx        — редактор комментария (RichText)
  TaskDetailDialogs.tsx    — диалоги подтверждений в TaskDetailPanel
  TaskProjectSelect.tsx    — выбор проекта у задачи
  timeline/
    CalendarTimeline.tsx   — основной таймлайн-компонент
    TimelineGrid.tsx       — сетка дней и строк
    TimelineHeader.tsx     — шапка с датами
    TimelineRow.tsx        — строка участника
    TimelineSidebarRow.tsx — ячейка сайдбара (аватар + имя)
    TaskBar.tsx            — полоска задачи
    MilestoneLayer.tsx     — слой вех
    MilestoneDialog.tsx    — диалог создания/редактирования вехи
    TimelineControls.tsx   — переключатель периода/режима
    hooks/
      useMilestoneDisplay.ts    — состояние и вычисления вех
      useTaskDisplayRows.tsx    — строки задач для рендера
      useSidebarResize.ts       — ресайз сайдбара
      useTimelineScroll.ts      — скролл таймлайна
      useTimelineViewport.ts    — видимые дни/ширина
      useDragScroll.ts          — drag-to-scroll

hooks/
  useTaskRepeatConfig.ts   — конфиг повторений (state + handlers)
  useTaskSubtasks.ts       — подзадачи (CRUD + state)
  useTaskDrafts.ts         — черновики title/description + isDirty
  useTaskScopeFilter.ts    — фильтр scope/date/pagination
  useFilteredAssignees.ts  — участники с учётом фильтров
  useDisplayTaskRows.ts    — строки для отображения (current/past)
  usePlannerLookupMaps.ts  — Map<id, entity> для статусов/тегов/типов
  usePlannerLiveSync.ts    — realtime-подписки Supabase
  useHolidayMap.ts         — карта праздников по дате
  useProjectQueryInput.ts  — параметры запроса задач проекта

lib/
  taskFormRules.ts         — правила валидации/авто-значений repeat-формы
  timelineSelectors.ts     — селекторы позиций задач на таймлайне
  timelineMilestoneSelectors.ts — селекторы вех
  taskLanes.ts             — распределение задач по дорожкам
  taskBarColors.ts         — цвета полосок задач
  dateUtils.ts             — утилиты дат
  colorUtils.ts            — утилиты цветов

store/
  plannerStore.ts               — точка входа стора
  plannerStore.contract.ts      — TypeScript-интерфейс стора
  plannerStore.helpers.ts       — MutationResult и вспомогательные типы
  plannerStore.taskActions.ts   — CRUD задач, повторы, комментарии
  plannerStore.workspaceActions.ts — загрузка workspace-данных
  plannerStore.catalogActions.ts — статусы, типы, теги, участники

types/
  planner.ts               — Task, Project, Milestone, Assignee, TaskSubtask и др.
```

---

#### `features/members` — управление участниками
```
pages/
  MembersPage.tsx          — экран участников (задачи / доступ / группы)

components/
  MembersGroupPanel.tsx    — панель группы (список + добавление)
  MembersTaskPanel.tsx     — задачи участника
  MembersAccessPanel.tsx   — управление доступом

hooks/
  useMembersPageMode.ts    — режим страницы (tasks/access/groups) + localStorage
  useMemberTaskFetcher.ts  — загрузка задач участника + счётчики
  useMemberGroups.ts       — загрузка групп
  useMembersFilter.ts      — фильтрация участников

lib/
  memberSelectors.ts       — buildAvailableGroupMembers и др.
```

---

#### `features/projects` — проекты, вехи, клиенты
```
pages/
  ProjectsPage.tsx         — экран проектов

components/
  ProjectsSidebar.tsx      — сайдбар (проекты / вехи / клиенты)
  ProjectsMainPanel.tsx    — главная панель (задачи / детали)
  ProjectsDialogs.tsx      — все диалоги страницы
  ProjectTaskDetailsDialog.tsx — детали задачи проекта
  CustomerCombobox.tsx     — выбор клиента

hooks/
  useProjectMutations.ts   — settings/delete/archive проекта
  useCustomerActions.ts    — CRUD клиентов
  useMilestoneActions.ts   — CRUD вех
  useProjectCreateForm.ts  — форма создания проекта
  useProjectSelection.ts   — выбранный проект/веха/клиент/задача
  useProjectsFilter.ts     — фильтрация и группировка
  useProjectsPageEffects.ts — side-effects страницы
  useProjectsViewPreferences.ts — настройки отображения (localStorage)
  useProjectTasksQuery.ts  — загрузка задач проекта (React Query)

lib/
  projectsSelectors.ts     — groupProjectsForSidebar, buildCustomerProjectCounts
```

---

#### `features/auth` — аутентификация
```
pages/
  AuthPage.tsx             — страница входа (Keycloak redirect)
  InvitePage.tsx           — принятие приглашения

components/
  AccountSettingsDialog.tsx — настройки аккаунта
  AvatarEditModal.tsx      — редактирование аватара
  AvatarWithEditButton.tsx — аватар с кнопкой редактирования
  InviteNotifications.tsx  — уведомления о приглашениях

store/
  authStore.ts             — user, workspaceId, role, isSuperAdmin

lib/
  authSessionSync.ts       — синхронизация сессии Supabase/Keycloak
  authRedirect.ts          — редиректы после входа
  avatarStorage.ts → shared/lib/avatarStorage.ts
```

---

#### `features/dashboard` — дашборд аналитики
```
pages/
  DashboardPage.tsx

store/
  dashboardStore.ts

types/
  dashboard.ts             — WidgetConfig, ChartData и др.

lib/
  dashboardUtils.ts, dashboardChartLabels.ts, и др.
```

---

#### `features/onboarding` — пользовательский тур по продукту
```
hooks/
  useOnboardingTour.ts    — запуск page-by-page onboarding flow

lib/
  onboardingFlow.ts       — порядок страниц и маршруты тура
  onboardingTour.ts       — driver.js-конфигурация шагов и переходов
```

---

#### `features/daily-brief` — утреннее окно задач
```
components/
  DailyBriefModal.tsx      — модал с задачами и вехами на сегодня
  DailyBriefController.tsx — логика показа (once per day)

hooks/
  useDailyBriefTrigger.ts
  useDailyBriefData.ts

index.ts                   — публичное API фичи
```

---

#### `features/workspace` — workspace-уровень
```
components/
  WorkspacePageHeader.tsx  — шапка всех страниц
  WorkspaceSettingsDialog.tsx — настройки workspace
  WorkspaceMembersList.tsx — список участников workspace
  InviteMemberDialog.tsx   — приглашение участника
  и др.
```

---

### Инфраструктура (`src/infrastructure/`)

Единственный слой с прямым доступом к Supabase.

```
auth/functionsGateway.ts         — вызов Edge Functions
members/memberTasksRepository.ts — задачи участника (fetch + пагинация)
projects/projectTasksRepository.ts — задачи проекта
tasks/taskCommentsRepository.ts  — CRUD комментариев
tasks/taskMediaRepository.ts     — загрузка/удаление медиа задачи
tasks/urgentTasksRepository.ts   — срочные задачи
holidays/holidayApi.ts           — праздники из Edge Function
workspace/memberActivityRepository.ts — активность участников
```

---

### Shared

```
shared/domain/             — чистая бизнес-логика (нет React, нет IO)
  repeatSeries.ts          — создание/обновление серий повторений
  repeatSeriesRebuild.ts   — перестройка серии при смене каденции
  repeatSeriesRows.ts      — маппинг серии в строки
  repeatTaskMove.ts        — перенос задачи в серии
  taskScope.ts             — TaskScope тип и утилиты
  taskRowMapper.ts         — маппинг Task → DisplayRow
  taskCommentCount.ts      — подсчёт комментариев
  taskDescription.ts       — работа с описанием задачи
  workspaceMemberSearch.ts — поиск участников
  personName.ts            — форматирование имён

shared/lib/                — утилиты с зависимостями (Supabase client, localStorage)
  supabaseClient.ts        — единственный экземпляр Supabase
  avatarStorage.ts         — загрузка аватаров в Storage
  latestAsyncRequest.ts    — отмена устаревших запросов
  recoverableImportError.ts — one-shot reload при stale Vite chunk после деплоя
  projectSorting.ts        — сортировка проектов
  statusLabels.ts          — метки статусов
  colors.ts                — DEFAULT_PROJECT_COLOR и др.
  dateFnsLocale.ts         — локаль для date-fns
  releaseNotes.ts          — парсинг CHANGELOG

shared/ui/                 — 57 UI-примитивов
  UserAvatar.tsx           — аватар участника с монограммой
  color-picker.tsx         — выбор цвета
  mobile-page-sheet-layout.tsx — мобильный лейаут с sheet
  и стандартные Radix/shadcn компоненты

shared/store/
  localeStore.ts           — текущая локаль (ru/en)
```

---

## Карта бэкенда (`infra/`)

### База данных
- PostgreSQL через Supabase
- Миграции: `infra/supabase/migrations/` (файлы 0001–006x)
- Liquibase changelog: `infra/supabase/liquibase/changelog-master.xml`
- **Правило:** каждая миграция = запись в changelog. Без записи — Liquibase не применит.

### Edge Functions (`infra/supabase/functions/`)
```
main/          — основные бизнес-операции
admin/         — административные операции
task-media/    — upload/delete медиафайлов задач
invite/        — управление приглашениями
notifications/ — уведомления
holidays/      — список праздников
inbox/         — входящие
_shared/       — общие утилиты (taskMediaPublicUrl.ts и др.)
```

### Аутентификация
- Keycloak (realm `timeline`)
- Конфиги realm: `infra/keycloak/realm/`
- Темы Keycloak: `infra/keycloak/themes/timeline/`

### Деплой
- Production сервер: `94.141.162.237` → `make deploy-remote`
- Testing сервер: `46.149.69.61` → `make deploy-testing`
- Скрипты: `infra/scripts/`

---

## Ключевые зависимости

| Библиотека | Назначение |
|---|---|
| React 18 + Vite 5 | UI-фреймворк + сборка |
| Zustand 5 | Клиентский стейт |
| TanStack Query 5 | Серверный стейт (пагинация) |
| Supabase JS 2 | БД + realtime + Storage |
| Radix UI | Headless UI примитивы |
| Tailwind CSS 3 | Стилизация |
| Lingui 5 | i18n (ru + en) |
| date-fns 3 | Работа с датами |
| Vitest 3 | Тесты |
| Zod 3 | Валидация схем |

---

## Что добавлено с последнего обновления (v0.3.59)

- `useTaskRepeatConfig`, `useTaskSubtasks`, `useTaskDrafts` — extracted из `TaskDetailPanel`
- `SubtasksSection` — выделен компонент подзадач
- `useMilestoneDisplay`, `useTaskDisplayRows`, `TimelineSidebarRow` — extracted из `TimelineGrid`
- `useMembersPageMode`, `useMemberTaskFetcher`, `MembersGroupPanel` — extracted из `MembersPage`
- `useProjectMutations`, `useCustomerActions`, `useMilestoneActions`, `useProjectCreateForm` — extracted из `ProjectsPage`
- `taskMediaPublicUrl.ts` shared helper для Edge Functions
