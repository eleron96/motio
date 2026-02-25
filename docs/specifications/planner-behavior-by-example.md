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
