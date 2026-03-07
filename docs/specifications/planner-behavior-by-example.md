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
