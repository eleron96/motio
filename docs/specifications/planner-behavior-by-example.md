# Planner Behavior By Example

Спецификация фиксирует ожидаемое поведение в формате Given/When/Then.
Каждый сценарий должен иметь автоматическую проверку (unit/smoke).

## Scenario 1: Latest request wins for task loading

Given:
- пользователь быстро переключает выбранный проект/участника;
- первый запрос к `tasks` еще не завершился.

When:
- запускается новый запрос на загрузку задач.

Then:
- предыдущий запрос отменяется;
- в UI попадает только ответ последнего запроса;
- ошибки отмененного запроса не показываются пользователю.

Покрытие:
- `src/shared/lib/latestAsyncRequest.ts`
- `src/test/shared/latestAsyncRequest.test.ts`

## Scenario 2: Repeat series is displayed as one row in current tasks scope

Given:
- есть серия задач с одним `repeatId`;
- задачи относятся к текущему периоду.

When:
- список отображается в текущем (`current`) scope.

Then:
- серия отображается одной строкой;
- показываются `remaining` и `total`;
- подпись cadence вычисляется по интервалу между первыми задачами серии.

Покрытие:
- `src/shared/domain/repeatSeriesRows.ts`
- `src/test/shared/repeatSeriesRows.test.ts`

## Scenario 3: Past scope keeps tasks expanded

Given:
- есть серия задач с одним `repeatId`;
- пользователь открывает прошлые задачи (`past`) и сортирует их.

When:
- строится список задач.

Then:
- каждая задача серии отображается отдельно;
- мета-плашка серии не объединяет строки;
- порядок соответствует выбранной сортировке.

Покрытие:
- `src/features/members/pages/MembersPage.tsx`

## Scenario 4: Failed destructive mutation keeps local state consistent

Given:
- удаление проекта или milestone вернуло ошибку API.

When:
- store получает неуспешный результат мутации.

Then:
- локальные коллекции не теряют существующие элементы;
- ошибка возвращается в вызывающий UI и может быть показана пользователю.

Покрытие:
- `src/test/smoke/workflow.smoke.test.ts`

## Scenario 5: Rich task description is sanitized before render

Given:
- описание задачи содержит HTML.

When:
- описание рендерится в деталях задачи.

Then:
- разрешенные теги сохраняются;
- небезопасные теги удаляются.

Покрытие:
- `src/shared/domain/taskDescription.ts`
- `src/test/shared/taskDescription.test.ts`

## Scenario 6: Timeline highlights holidays with subtle hatch

Given:
- для текущего workspace загружены праздничные даты;
- пользователь открыт в timeline (`day`/`week`) режиме.

When:
- рендерится шапка и строки таймлайна.

Then:
- день с праздничной датой получает слабую серую штриховку;
- если праздничная дата выпадает на выходной, штриховка не применяется;
- обычные дни остаются без праздничной штриховки.

Покрытие:
- `src/features/planner/hooks/useHolidayMap.ts`
- `src/features/planner/components/timeline/TimelineHeader.tsx`
- `src/features/planner/components/timeline/TimelineRow.tsx`
- `src/test/planner/holidayMap.test.tsx`

## Scenario 7: Project search is identical in task create and edit forms

Given:
- пользователь открывает создание задачи и редактирование существующей задачи;
- в обоих формах доступен выпадающий список проектов.

When:
- пользователь вводит символы в строку поиска проектов внутри списка.

Then:
- в обоих формах применяется одинаковая фильтрация по `name`/`code`;
- показываются одинаковые подсказки `Filter: ...` и `No projects found`;
- выбор проекта очищает поисковую строку.

Покрытие:
- `src/features/planner/components/AddTaskDialog.tsx`
- `src/features/planner/components/TaskDetailPanel.tsx`
- `src/features/planner/components/TaskProjectSelect.tsx`
- `src/features/planner/hooks/useProjectQueryInput.ts`

## Scenario 8: Disabled assignees are hidden in timeline and people filter

Given:
- в workspace есть активные и отключенные участники;
- у отключенного участника есть назначенные задачи.

When:
- пользователь открывает timeline (`day`/`week`/`calendar`) и левый фильтр `People`.

Then:
- отключенные участники не отображаются в `People` фильтре;
- задачи, назначенные только на отключенных участников, не отображаются в таймлайне;
- задачи с активным и отключенным участником остаются видимыми по активному участнику.

Покрытие:
- `src/features/planner/lib/timelineSelectors.ts`
- `src/features/planner/components/FilterPanel.tsx`
- `src/features/planner/components/timeline/TimelineGrid.tsx`
- `src/features/planner/components/timeline/CalendarTimeline.tsx`
- `src/test/planner/timelineSelectors.test.ts`

## Scenario 9: Realtime upserts are deferred during timeline interaction and replayed after

Given:
- в `usePlannerLiveSync` пришел realtime upsert события по задаче;
- пользователь в этот момент взаимодействует с timeline (drag/scroll), и `timelineInteractingUntil` еще в будущем.

When:
- flush очереди запускается в defer-режиме;
- окно взаимодействия заканчивается.

Then:
- upsert не теряется и остается в очереди;
- выполняется повторный flush после `INTERACTION_RETRY_MS`;
- задача применяется в store после завершения interaction-window.

Покрытие:
- `src/features/planner/hooks/usePlannerLiveSync.ts`
- `src/test/planner/usePlannerLiveSync.test.tsx`

## Scenario 10: Live sync pipeline is single-flight and ignores stale async runs

Given:
- realtime flush и reconcile триггеры приходят почти одновременно;
- часть запросов выполняется с задержкой;
- пользователь может переключить workspace во время in-flight запроса.

When:
- запускается sync pipeline для `usePlannerLiveSync`.

Then:
- `flush` и `reconcile` не выполняются параллельно (single-flight execution);
- stale async ответ из старого lifecycle не мутирует store;
- `fallbackFailureCount` растет с clamp при ошибках и сбрасывается после успешного reconcile.

Покрытие:
- `src/features/planner/hooks/usePlannerLiveSync.ts`
- `src/test/planner/usePlannerLiveSync.test.tsx`

## Scenario 11: Initial live reconcile is deferred after first subscribe

Given:
- пользователь открывает planner, и realtime channel только что перешёл в `SUBSCRIBED`;
- первоначальный список задач уже загружается обычным bootstrap-потоком.

When:
- срабатывает первый `SUBSCRIBED` status в `usePlannerLiveSync`.

Then:
- reconcile не запускается мгновенно;
- первый reconcile выполняется с короткой задержкой;
- повторные `SUBSCRIBED` после разрыва соединения запускают reconcile сразу.

Покрытие:
- `src/features/planner/hooks/usePlannerLiveSync.ts`
- `src/test/planner/usePlannerLiveSync.test.tsx`

## Scenario 12: Repeat task creation does not spam assignee notifications

Given:
- пользователь создает задачу с назначенным участником и включает повторения;
- система генерирует серию задач с одинаковым `repeatId`.

When:
- БД-триггер `notify_task_assignment` обрабатывает `INSERT` задач серии.

Then:
- назначенный пользователь получает одно уведомление о назначении;
- дополнительные `INSERT` в уже существующей repeat-серии не создают дубли.

Покрытие:
- `infra/supabase/migrations/0050_dedupe_repeat_series_assignment_notifications.sql`

## Scenario 13: Assignee list does not jump while selection popover is open

Given:
- пользователь открывает создание задачи и раскрывает список исполнителей;
- в списке используется сортировка с приоритетом выбранных исполнителей.

When:
- пользователь выбирает/снимает исполнителей, пока popover остается открытым.

Then:
- порядок строк в текущем открытом списке не пересортировывается;
- автоподскролл к началу списка не происходит;
- пересортировка применяется после закрытия popover.

Покрытие:
- `src/features/planner/components/AddTaskDialog.tsx`
- `src/features/planner/lib/assigneePopoverOrder.ts`
- `src/test/planner/assigneePopoverOrder.test.ts`

## Scenario 14: Mobile timeline uses compact assignee labels

Given:
- пользователь открывает planner timeline на экране меньше `768px`;
- timeline сгруппирован по исполнителям;
- в workspace есть исполнители с длинными именами.

When:
- рендерится левая колонка имен timeline.

Then:
- для исполнителей используются монограммы в компактных круглых лейблах вместо полного длинного имени;
- полное имя остается доступно через `title`;
- mobile assignee sidebar занимает примерно `44-56px`, а не desktop-ширину по умолчанию.

Покрытие:
- `src/shared/domain/personName.ts`
- `src/features/planner/components/timeline/TimelineGrid.tsx`
- `src/test/shared/personName.test.ts`

## Scenario 15: Project tasks panel separates current and past scopes

Given:
- пользователь открыт на странице `Projects`;
- выбран конкретный проект;
- у проекта есть текущие и завершившиеся задачи, включая repeat-series.

When:
- пользователь смотрит задачи проекта в scope `Current` или переключается в `Past`.

Then:
- по умолчанию показываются только текущие задачи (`endDate >= today`);
- в `Past` показываются только прошедшие задачи (`endDate < today`);
- в `Current` repeat-series схлопываются в одну строку;
- в `Past` repeat-series остаются развернутыми по одной задаче;
- для `Past` доступны фильтры по диапазону дат, сортировка и пагинация.

Покрытие:
- `src/features/projects/pages/ProjectsPage.tsx`
- `src/features/projects/components/ProjectsMainPanel.tsx`
- `src/infrastructure/projects/projectTasksRepository.ts`
- `src/shared/domain/taskScope.ts`
- `src/test/projects/projectsMainPanel.taskScope.test.tsx`
- `src/test/projects/projectTasksRepository.test.ts`
- `src/test/shared/taskScope.test.ts`

## Scenario 15: Timeline sidebar and task grid share one vertical scroll surface

Given:
- пользователь открыт в planner timeline (`day` или `week`);
- слева отображается колонка имен/групп, справа сетка задач;
- строк достаточно, чтобы появилась вертикальная прокрутка.

When:
- пользователь скроллит вертикально по колонке имен или по области задач.

Then:
- имена и строки задач двигаются как одна поверхность;
- sidebar не имеет отдельного vertical viewport с ручной `scrollTop`-синхронизацией;
- имена не дергаются и не догоняют task-grid на следующий кадр.

Покрытие:
- `src/features/planner/components/timeline/TimelineGrid.tsx`
- `src/test/planner/timelineGrid.scrollSurface.test.tsx`

## Scenario 16: Task comment save uses the signed-in author and keeps the draft on failure

Given:
- пользователь открыл детали задачи и ввел комментарий;
- сессия авторизации уже загружена.

When:
- пользователь нажимает `Save` в редакторе комментария.

Then:
- новый комментарий создается от `session.user.id`;
- комментарий сразу появляется в треде задачи;
- редактор нового комментария открывается высотой одной строки и растет по мере ввода;
- браузерные пустые строки в начале/конце комментария не сохраняются автоматически;
- если сохранение не удалось, текст в редакторе не очищается и пользователь видит ошибку.

Покрытие:
- `src/features/planner/components/TaskCommentSection.tsx`
- `src/features/planner/lib/taskCommentEditorHtml.ts`
- `src/test/planner/taskCommentEditorHtml.test.ts`

## Scenario 17: Task comment soft delete is allowed for the author and workspace admin

Given:
- у задачи есть существующий комментарий;
- комментарий еще не soft-deleted.

When:
- автор комментария или admin workspace нажимает `Delete`.

Then:
- приложение выполняет soft-delete через серверный сценарий и обновляет `deleted_at`;
- комментарий исчезает из треда без ошибки RLS;
- поля автора, workspace и задачи комментария не могут быть изменены через update path.

Покрытие:
- `src/infrastructure/tasks/taskCommentsRepository.ts`
- `src/test/planner/taskCommentsRepository.test.ts`
- `infra/supabase/migrations/0052_fix_task_comment_soft_delete_policy.sql`
- `infra/supabase/migrations/0053_add_soft_delete_task_comment_rpc.sql`

## Scenario 18: Timeline comment badge updates immediately and stays live-synced

Given:
- у задачи на timeline есть badge с количеством комментариев;
- пользователь добавляет или удаляет комментарий в details panel, либо комментарий меняется из другой вкладки.

When:
- create/delete комментария завершается успешно;
- или `usePlannerLiveSync` получает событие/делает reconcile по `task_comments`.

Then:
- badge на timeline-card обновляется без перезагрузки страницы;
- count хранится в одном `plannerStore`, а не в локальном cache карточки;
- пропущенные realtime-события догоняются через точечный refresh count по затронутым `taskId`.
- refresh/reconcile больших списков задач батчится и не роняет `task_comments` запросы oversized `task_id=in(...)` URL.

Покрытие:
- `src/features/planner/components/TaskCommentSection.tsx`
- `src/features/planner/components/timeline/TaskBar.tsx`
- `src/features/planner/hooks/usePlannerLiveSync.ts`
- `src/features/planner/store/plannerStore.ts`
- `src/shared/domain/taskCommentCount.ts`
- `src/test/planner/usePlannerLiveSync.test.tsx`
- `src/test/shared/taskCommentCount.test.ts`

## Scenario 19: Comment mentions target workspace members, not only assignees

Given:
- пользователь открыл комментарии задачи;
- в workspace есть участник, который не присутствует в `planner.assignees`.

When:
- пользователь открывает список `@mention` в редакторе комментария, в том числе через кнопку `@`.

Then:
- список строится из `workspace_members`;
- участник workspace доступен для выбора даже без записи в assignees;
- список отображается рядом с редактором, а не остается скрытым после клика на кнопку `@`;
- при открытии через кнопку `@` список якорится к самой кнопке, а не к произвольной точке редактора;
- если редактор находится у нижней границы viewport или модалки, список флипается вверх и остается в видимой области;
- внутренний scroll списка участников не закрывает popup и позволяет пролистать весь список;
- клик по участнику из popup вставляет mention даже если popup рендерится через portal вне редактора;
- внутри task detail modal popup остается интерактивным и не блокируется modal-layer;
- hovered участник визуально подсвечивается как активный выбор;
- список также открывается, когда браузер держит каретку внутри служебной `div/br`-обертки `contenteditable` после ввода `@`;
- при переключении workspace устаревший список участников не используется.

Покрытие:
- `src/features/planner/components/TaskDetailPanel.tsx`
- `src/features/auth/store/authStore.ts`
- `src/features/planner/components/TaskCommentSection.tsx`
- `src/shared/domain/taskCommentMentionCandidates.ts`
- `src/test/planner/taskCommentMentions.test.tsx`
- `src/test/shared/taskCommentMentionCandidates.test.ts`

## Scenario 20: Comment mention notifications stay distinct from task assignment notifications

Given:
- пользователь отметил участника через `@mention` в комментарии задачи;
- назначение исполнителя задачи при этом не менялось.

When:
- inbox/notifications загружают `user_notifications` для получателя.

Then:
- уведомление сохраняет тип `comment_mention`, а не превращается в `task_assigned`;
- в payload доступны `comment_id` и `comment_preview`;
- UI показывает текст про mention в комментарии, а не про назначение на задачу.

Покрытие:
- `infra/supabase/functions/inbox/index.ts`
- `infra/supabase/functions/inbox/taskNotifications.ts`
- `infra/supabase/functions/notifications/index.ts`
- `src/features/auth/components/InviteNotifications.tsx`

## Scenario 21: New tasks default to "No project" unless opened from project context

Given:
- пользователь открывает обычный диалог создания задачи без project-context;
- в workspace при этом есть активные проекты.

When:
- пользователь создает новую задачу, не меняя поле проекта вручную.

Then:
- поле проекта по умолчанию стоит на `No project`;
- в `addTask` уходит `projectId: null`, а не первый активный проект workspace;
- если диалог был открыт из project-row/grouped timeline с явным `initialProjectId`, этот контекстный проект сохраняется.

Покрытие:
- `src/features/planner/components/AddTaskDialog.tsx`
- `src/features/planner/lib/taskFormRules.ts`
- `src/test/planner/addTaskDialog.test.tsx`
- `src/test/planner/taskFormRules.test.ts`

## Scenario 22: Timeline sidebar width survives locale switch and page remount

Given:
- пользователь изменил ширину левой колонки имен на timeline;
- значение сохранено в `localStorage`;
- пользователь переключает язык интерфейса, и страница таймлайна монтируется заново.

When:
- `PlannerPage` гидратирует сохраненную ширину sidebar после remount.

Then:
- сохраненное значение не удаляется во время hydration race;
- таймлайн получает прежнюю пользовательскую ширину после смены языка;
- key storage остается привязан к `userId + workspaceId`, а не к locale.

Покрытие:
- `src/features/planner/pages/PlannerPage.tsx`
- `src/features/planner/lib/timelineSidebarWidthStorage.ts`
- `src/test/planner/timelineSidebarWidthStorage.test.ts`
