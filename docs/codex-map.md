# Codex Map: Motio

Документ описывает текущую карту системы для Codex:

1. где находится логика;
2. куда добавлять новые изменения;
3. как не нарушать архитектурные границы;
4. как выполнять деплой, логирование и коммиты по единым правилам.

## 0. Startup Protocol (обязательный вход в задачу)

Для каждой новой задачи сначала:

1. Прочитать `AGENTS.md`.
2. Прочитать этот файл (`docs/codex-map.md`) целиком.
3. Прочитать `docs/architecture/frontend-boundaries.md`.
4. Если задача меняет поведение, открыть релевантный `docs/specifications/*`.
5. Сопоставить задачу с модулями из раздела 1 и с точками расширения из раздела 2.
6. Только после этого начинать кодовые изменения и запуск команд.

## 1. Карта модулей

## 1.1. Frontend

1. `src/features/planner/*`: таймлайн, задачи, фильтры, live sync, store planner.
2. `src/features/projects/*`: список/управление проектами, milestones, customer view.
3. `src/features/members/*`: участники, группировка, задачи участника, доступ.
4. `src/features/dashboard/*`: dashboards/widgets/layouts/stats.
5. `src/features/auth/*`: auth, профиль, admin API, invite flows.
6. `src/features/workspace/*`: workspace settings/members/switcher/template.
7. `src/features/marketing/*`: публичный лендинг и SEO-контент верхнего уровня.

## 1.2. Слои

1. `src/application/*`: сценарии уровня приложения (сервисы-координаторы).
2. `src/infrastructure/*`: репозитории и инфраструктурные адаптеры.
3. `src/shared/domain/*`: чистые доменные функции.
4. `src/shared/lib/*`: утилиты/infra helpers.
5. `src/shared/ui/*`: UI primitives.

## 1.3. Infra

1. `infra/supabase/*`: edge functions, migrations, local gateway config.
2. `infra/keycloak/*`: realm/theme/realm-as-code.
3. `infra/scripts/*`: скрипты dev/prod/deploy/audit/release.
4. `infra/backup-service/*`: backup/restore сервис.

## 2. Точки расширения

## 2.1. Новое правило фильтрации/группировки

1. Логику вычислений в `shared/domain` или `features/*/lib`.
2. Подключение в `store`/hook.
3. В `pages` только сборка состояния и передача в компоненты.

## 2.2. Новая мутация (create/update/delete)

1. Добавить/расширить use-case в store/service.
2. Нормализовать ошибки в единый результат `{ error?: string }` или типизированный `Result`.
3. UI не должен знать детали Supabase таблиц.

## 2.3. Новый UI-flow

1. Сначала `Specification by Example` сценарий.
2. Затем реализация.
3. Затем тесты сценария.

## 3. Потоки данных

## 3.1. Planner

1. UI событие -> store action (`plannerStore.*Actions`) -> infrastructure/supabase.
2. Ответ -> map functions (`shared/domain/taskRowMapper`) -> store update.
3. UI читает store через selectors.
4. Realtime sync: `usePlannerLiveSync`.

## 3.2. Projects/Members tasks

1. Запросы задач из страниц идут через hooks/repositories.
2. Локальные view-модели строятся через `shared/domain` helpers.

## 3.3. Auth/Admin/Backup

1. Auth/store — точка координации с `supabase.auth`, edge functions и backup API.
2. Admin/invite вызовы — через `infrastructure/auth/functionsGateway.ts`.

## 4. Антипаттерны (не делать)

1. God-page: тысячи строк в page с бизнес-логикой + IO + UI одновременно.
2. Прямой Supabase вызов из feature UI там, где нужен use-case/repository.
3. Дублирование repeat/filter/sort правил между диалогами.
4. Несогласованные контракты ошибок у мутаций.
5. Скрытая бизнес-логика в inline callbacks без теста.

## 5. Правила деплоя

## 5.1. Команды

1. Dev up/down/logs:
- `make up`
- `make down`
- `make logs`

2. Prod up/down/logs:
- `make up-prod`
- `make down-prod`
- `make logs-prod`

3. Аудит/безопасность:
- `make check-prod-secrets`
- `make audit-migrations`
- `make keycloak-backup-db`
- `make keycloak-audit-realm`

4. Remote deploy:
- `make deploy-remote`
- или `make release MSG="..." RU="..." EN="..." [TYPE=changed]`

5. Для агента при явной команде пользователя "сделай деплой":
- по умолчанию запускать `make deploy-remote`
- не добавлять локальные pre-check шаги сверх этого, если пользователь не просил их отдельно
- расширять диагностику только если сам `make deploy-remote` завершился ошибкой

## 5.2. Обязательный pre-deploy чеклист

1. `npm run lint` без ошибок.
2. `npm run test` зелёный.
3. Проверены `.env` и prod secrets.
4. Нет незакоммиченных критичных изменений.
5. Обновлены `CHANGELOG.md/CHANGELOG.en.md` при релизном изменении.

## 5.3. Post-deploy чеклист

1. Доступность приложения.
2. Вход/выход (Keycloak + oauth2-proxy).
3. Создание/обновление/удаление задачи.
4. Базовые сценарии проектов/участников/дашбордов.
5. Проверка логов на ошибки (`make logs-prod`).

## 6. Правила логирования

## 6.1. Формат

Использовать структурированный подход:

1. `module`
2. `action`
3. `workspaceId`
4. `entityId`
5. `result`
6. `error`

## 6.2. Ограничения

1. Не логировать секреты и access tokens.
2. Не логировать PII без причины.
3. Не оставлять noisy debug логирование в hot-path.
4. Ошибки пользователю и технические детали разделять.

## 6.3. Практика

1. Для destructive actions логировать `start/success/error`.
2. Для retry/cancel потоков логировать причину отмены.
3. Для edge functions и scripts предпочитать JSON-like лог-строки.

## 7. Правила коммитов

## 7.1. Стиль

Conventional Commits с scope:

1. `feat(planner): ...`
2. `fix(projects): ...`
3. `refactor(dashboard): ...`
4. `docs(codex-map): ...`
5. `chore(release): ...`

## 7.2. Качество

1. Коммит атомарный и логически цельный.
2. Нет смешивания unrelated изменений.
3. Для поведения: код + тесты + docs/spec.
4. Не коммитить generated artifacts (`dist`, `node_modules`).

## 7.3. Быстрый процесс

1. `git add -A`
2. `git commit -m "type(scope): message"`
3. `git push origin <branch>`

(в проекте есть helper: `make commit MSG="..."`, `make push`).

## 8. Specification by Example: шаблон

Для нового сценария добавлять блок:

1. `Given` — начальные условия.
2. `When` — действие.
3. `Then` — ожидаемый результат в UI/данных.
4. `Покрытие` — конкретный тестовый файл.

Если сценарий новый, но теста нет — задача не завершена.

## 9. Definition of Done

1. Архитектурные границы соблюдены.
2. Нет дублирования ключевой логики.
3. Ошибки мутаций возвращаются предсказуемо.
4. Lint/Test зелёные.
5. Specs/docs обновлены.
6. Коммит оформлен по правилам.
