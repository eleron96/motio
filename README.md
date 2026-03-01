# Motio

Motio — приложение для командного планирования задач на таймлайне.

Стек проекта:
- Frontend: `Vite + React + TypeScript + Zustand + TanStack Query`
- Backend: `Supabase` (`Postgres + GoTrue + PostgREST + Edge Functions`)
- Identity/SSO: `Keycloak` + `oauth2-proxy`
- Миграции БД: `Liquibase`
- Резервное копирование: отдельный `backup-service`

## Что уже реализовано

- Таймлайн задач, календарный режим, панель деталей задачи.
- Проекты, участники, роли workspace (`viewer/editor/admin`).
- Invite-поток через Keycloak/Supabase identity link.
- Super-admin консоль:
  - обзор пользователей (без CRUD пользователей),
  - управление workspace,
  - управление backup/restore.
- Полноценные миграции через Liquibase (`DATABASECHANGELOG`).
- Загрузка изображений в описание задачи:
  - кнопкой,
  - вставкой из буфера,
  - drag-and-drop в редактор.
- Отдельное хранение task media (`public.task_media`) + квоты по пользователю и workspace.

## Важные правила текущей архитектуры

- Логин в приложение идёт через `oauth2-proxy` и Keycloak.
- Logout идёт по цепочке `/oauth2/sign_out` -> `oauth2-proxy backend logout` (Keycloak end-session с `id_token_hint`) -> `/auth?silent=1`.
- Жизненный цикл пользователей (create/edit/delete/password) управляется в **Keycloak Admin Console**.
- Админка приложения показывает пользователей как обзор (доступы + storage), но не заменяет IAM.

## Структура репозитория

- `src/` — frontend.
- `infra/docker-compose.yml` — локальный dev-контур (Vite в контейнере).
- `infra/docker-compose.prod.yml` — production-контур (статическая сборка + nginx).
- `infra/supabase/`:
  - `migrations/` — SQL миграции,
  - `liquibase/changelog-master.xml` — мастер-чанжлог,
  - `functions/` — Edge Functions (`admin`, `invite`, `task-media`, `main`),
  - `nginx.conf` — gateway для `/auth/v1`, `/rest/v1`, `/functions/v1`, `/backup`.
- `infra/keycloak/realm/timeline-realm.json` — dev realm.
- `infra/keycloak/realm/timeline-realm.prod.json` — production baseline realm (создаётся из текущего прода через export-скрипт).
- `infra/backup-service/` — сервис backup/restore.
- `infra/scripts/dev-compose.sh` — локальный запуск полного контура.
- `infra/scripts/prod-compose.sh` — production запуск с pre-migration backup.

## Engineering docs

- Архитектурные границы frontend: `docs/architecture/frontend-boundaries.md`
- Спецификации поведения (Specification by Example): `docs/specifications/planner-behavior-by-example.md`

## Требования

- `Node.js 20+`
- `Docker Desktop`
- (опционально) `Supabase CLI` для режима `dev:local`

## Быстрый старт (рекомендуется)

### 1. Локальный полный контур

```bash
make up
```

Что делает команда:
- создаёт/обновляет `.env` (если нужно),
- генерирует `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
- генерирует `OAUTH2_PROXY_COOKIE_SECRET` (если пусто),
- поднимает `db`, `keycloak`, `auth`, `rest`, `functions`, `backup`, `gateway`, `web`, `oauth2-proxy`,
- применяет Liquibase миграции,
- вызывает bootstrap sync (`action=bootstrap.sync`) для синхронизации Keycloak/Supabase.

### 2. URLs

- Приложение: `http://localhost:5173`
- Публичный лендинг: `http://localhost:5173/`
- Приватное приложение: `http://localhost:5173/app`
- Keycloak: `http://localhost:8081`
- Keycloak Admin Console (prod): `https://motio.nikog.net/admin/master/console/`
- Supabase Gateway health: `http://localhost:8080/health`
- Supabase Auth health: `http://localhost:8080/auth/v1/health`
- Postgres: `localhost:54322`

### 3. Остановка и логи

```bash
make down
make logs
```

## Production запуск

```bash
make up-prod
```

Особенности `up-prod`:
- требует заполненный `.env`,
- проверяет обязательные переменные invite-only режима,
- делает backup `keycloak-db` перед realm-аудитом (если `AUTO_KEYCLOAK_PRE_SYNC_BACKUP=true`),
- запускает Keycloak realm drift audit (по умолчанию в режиме проверки, без применения изменений),
- запускает pre-migration backup (если `AUTO_PRE_MIGRATION_BACKUP=true`),
- применяет Liquibase миграции,
- собирает frontend образ (`infra/web/Dockerfile`) и запускает `web + oauth2-proxy`,
- считает каждый production deployment релизом: автоматически повышает patch-версию в `VERSION`,
- автоматически переносит записи из `Unreleased` в `CHANGELOG.md` и `CHANGELOG.en.md` под новую версию,
- добавляет запись о релизе в `infra/releases.log`.

Остановка/логи:

```bash
make down-prod
make logs-prod
make keycloak-backup-db
make keycloak-audit-realm
make keycloak-export-realm
```

Удалённый деплой (синхронизация release-артефактов локально/на сервере):

```bash
make deploy-remote
```

Скрипт `infra/scripts/deploy-remote.sh`:
- синхронизирует код на удалённый сервер,
- запускает `infra/scripts/prod-compose.sh` на сервере,
- подтягивает обратно `VERSION`, `CHANGELOG.md`, `CHANGELOG.en.md` и `infra/releases.log` в локальный репозиторий.

## Keycloak Realm-as-Code (безопасный старт)

Рекомендуемый порядок без влияния на пользователей:
- снять baseline из текущего production realm,
- зафиксировать baseline в git,
- запускать drift audit на каждом `up-prod`.

Экспорт baseline realm:

```bash
infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json
```

Проверка drift вручную:

```bash
infra/scripts/keycloak-realm-drift-audit.sh .env
```

Режим по умолчанию в `up-prod`: audit-only (ничего не меняет в Keycloak).

## Обязательные переменные для production

Минимально:
- `RESERVE_ADMIN_EMAIL`
- `RESERVE_ADMIN_PASSWORD`
- `KEYCLOAK_ADMIN`
- `KEYCLOAK_ADMIN_PASSWORD`
- `GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID`
- `GOTRUE_EXTERNAL_KEYCLOAK_SECRET`
- `OAUTH2_PROXY_CLIENT_ID`
- `OAUTH2_PROXY_CLIENT_SECRET`
- `OAUTH2_PROXY_COOKIE_SECRET` (может сгенерироваться скриптом, но лучше задавать явно)

Шаблон: `.env.example`

Проверка перед деплоем:

```bash
make check-prod-secrets
```

Для проверки удалённого production `.env` на сервере:

```bash
make check-prod-secrets-remote
```

Важно: production-деплой блокируется, если OIDC секреты пустые или используют dev/default значения.

## Основные переменные окружения

### Auth / Keycloak / oauth2-proxy

- `GOTRUE_EXTERNAL_KEYCLOAK_*` — OIDC провайдер для Supabase Auth.
- `KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_REALM`, `KEYCLOAK_ADMIN_CLIENT_ID` — доступ Edge Functions к Keycloak Admin API.
- `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` — admin credentials для bootstrap/sync.
- `KEYCLOAK_ADMIN_BASE_URL` — base URL для infra-скриптов, которые ходят в Admin API (`http://127.0.0.1:8081` по умолчанию).
- `KEYCLOAK_MANAGED_CLIENT_IDS` — список clientId (через запятую) для baseline/export-а realm.
- `KEYCLOAK_REALM_AUDIT_FILE` — путь к managed realm JSON для drift audit (обычно `infra/keycloak/realm/timeline-realm.prod.json`).
- `KEYCLOAK_REALM_AUDIT_ENABLED` — включить/выключить drift audit в `up-prod`.
- `KEYCLOAK_REALM_AUDIT_FAIL_ON_DRIFT` — падать ли деплою при найденном drift.
- `OAUTH2_PROXY_*` — проксирование входа на фронт (`localhost:5173`).
- `OAUTH2_PROXY_BACKEND_LOGOUT_URL` — URL Keycloak end-session с `id_token_hint={id_token}` для provider logout без user prompt.
- `OAUTH2_PROXY_WHITELIST_DOMAINS` — allowlist доменов для `rd` redirect после `/oauth2/sign_out`.
- `VITE_GA_MEASUREMENT_ID` — GA4 Measurement ID для Google tag (например `G-XXXXXXXXXX`).

### Supabase / DB

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`, `SUPABASE_INTERNAL_URL`
- `PGRST_DB_URI`, `GOTRUE_DB_DATABASE_URL`

### Backup / Restore

- `BACKUP_CRON`
- `BACKUP_RETENTION_COUNT`
- `BACKUP_SCHEMAS` (по умолчанию: `public,auth,storage`)
- `BACKUP_MAX_UPLOAD_MB`
- `BACKUP_RESTORE_DB_URL` (опционально)
- `BACKUP_AUTH_DB_USER`, `BACKUP_AUTH_HOST`

### Liquibase

- `AUTO_PRE_MIGRATION_BACKUP`
- `AUTO_KEYCLOAK_PRE_SYNC_BACKUP`
- `LIQUIBASE_LOG_LEVEL`
- `MIGRATION_MAX_WAIT_SECONDS`

### Task media quotas

- `TASK_MEDIA_MAX_FILE_BYTES` (по умолчанию `5MB`)
- `TASK_MEDIA_USER_QUOTA_BYTES` (по умолчанию `200MB`)
- `TASK_MEDIA_WORKSPACE_QUOTA_BYTES` (по умолчанию `2GB`)
- `TASK_MEDIA_TOKEN_TTL_SECONDS` (по умолчанию `604800`, 7 дней)

## Скрипты

### Make

```bash
make up
make down
make logs
make up-prod
make down-prod
make logs-prod
```

### npm

```bash
npm run dev
npm run dev:compose
npm run dev:local
npm run build
npm run lint
npm run test
npm run test:watch
npm run lingui:extract
npm run lingui:compile
```

## Edge Functions

Через `main` роутер доступны:
- `/functions/v1/admin`
- `/functions/v1/invite`
- `/functions/v1/task-media`

### `admin`

Ключевые actions:
- `bootstrap.sync`
- `users.list`
- `workspaces.list`, `workspaces.update`, `workspaces.delete`
- `keycloak.sync`

Важно:
- `users.create/users.update/users.delete` возвращают ошибку по дизайну: user lifecycle управляется в Keycloak.

### `invite`

- Добавляет пользователя в workspace.
- Создаёт/линкует Keycloak + Supabase identity при необходимости.
- Синхронизирует realm роли по workspace ролям.

### `task-media`

- `POST /functions/v1/task-media`
  - загрузка бинарного image,
  - валидация membership,
  - квоты file/user/workspace,
  - хранение в `public.task_media`.
- `GET /functions/v1/task-media/:id?token=...`
  - отдача изображения по access token.
- `POST /functions/v1/task-media/:id/revoke`
  - отзыв access token (owner файла или workspace admin).

## Task media и UX изображений

В описании задачи поддержано:
- выбор файла кнопкой,
- paste из буфера,
- drag-and-drop в область rich text editor.

Что хранится:
- в `tasks.description` хранится URL на `task-media` endpoint,
- бинарные данные — в `public.task_media`.

Текущий нюанс:
- автоматический garbage collection не реализован (если удалить картинку из текста, запись в `task_media` не удаляется автоматически).

## Admin Console

Страница: `/admin/users`

Вкладки:
- `Users` — обзор пользователей, workspace ownership/management и storage usage.
- `Workspaces` — rename/delete workspace.
- `Backups` — create/upload/download/rename/delete/restore.

UI-поведение:
- на таблице показывается компактная информация,
- детали раскрываются через tooltip и/или `Details`.

## Backup / Restore

`backup-service` (через `/backup`) умеет:
- `GET /backup/backups`
- `POST /backup/backups`
- `POST /backup/backups/upload` (binary upload, имя в `x-backup-name`)
- `GET /backup/backups/:name/download`
- `PATCH /backup/backups/:name`
- `DELETE /backup/backups/:name`
- `POST /backup/backups/:name/restore`

Restore поток:
- создаёт safety backup `pre-restore-*`,
- делает `pg_restore` по схемам из `BACKUP_SCHEMAS`,
- восстанавливает права для auth роли,
- сбрасывает соединения GoTrue к БД.

## Миграции (Liquibase)

- SQL файлы: `infra/supabase/migrations/*.sql`
- Мастер-чанжлог: `infra/supabase/liquibase/changelog-master.xml`

Ручной прогон миграций:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env run --rm migrate
```

Как добавить новую миграцию:
1. Создать `infra/supabase/migrations/00xx_name.sql`.
2. Добавить `changeSet` в `infra/supabase/liquibase/changelog-master.xml`.
3. Прогнать `migrate`.

## Локальный режим с Supabase CLI

```bash
npm run dev:local
```

Важно:
- если `supabase` CLI не найден, скрипт переключится на `dev-compose`.
- для полного соответствия production-поведения рекомендуется `make up` / `npm run dev:compose`.

## Troubleshooting

### 1) `OAUTH2_PROXY_COOKIE_SECRET is required for oauth2-proxy`

Причина: пустая переменная `OAUTH2_PROXY_COOKIE_SECRET`.

Решение:
- `make up` обычно генерирует её автоматически,
- для `make up-prod` задай значение в `.env` или дай скрипту сгенерировать.

### 2) `localhost:5173` -> `ERR_CONNECTION_REFUSED`

Проверь контейнеры:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env ps
```

Должны быть `oauth2-proxy` и `web` в статусе `Up`.

### 3) `Warning: could not confirm Keycloak sync bootstrap`

Это не Liquibase ошибка.

Смысл предупреждения:
- миграции применились,
- но `bootstrap.sync` не вернул `200`.

Обычно причина: неверные `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`.

Проверка:
- лог `functions` содержит `Invalid user credentials`.

### 4) `Invalid user credentials` в admin sync

Проверь, что в `.env` admin-учётка совпадает с master admin в Keycloak.
После исправления перезапусти минимум:
- `keycloak`
- `functions`
- `gateway`

### 5) `The schema must be one of the following: public`

Если видишь это в админке, значит где-то остался запрос к non-public schema через PostgREST.
В актуальной версии users storage считается через `public.task_media`.

### 6) Bad Request в редиректе на Keycloak

Проверь согласованность:
- `OAUTH2_PROXY_CLIENT_ID`
- `OAUTH2_PROXY_REDIRECT_URL`
- redirect URIs клиента в managed realm файле (обычно `infra/keycloak/realm/timeline-realm.prod.json`)

### 7) `volume supabase_db_data declared as external, but could not be found`

Создай volume вручную один раз:

```bash
docker volume create supabase_db_data
```

### 8) `Warning: Keycloak realm drift detected`

Смысл предупреждения:
- текущий realm на сервере не совпадает с managed JSON,
- деплой продолжен в audit-only режиме (если `KEYCLOAK_REALM_AUDIT_FAIL_ON_DRIFT=false`).

Проверить руками:

```bash
infra/scripts/keycloak-realm-drift-audit.sh .env
```

Обновить baseline JSON из текущего состояния:

```bash
infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json
```

## Безопасность

Перед реальным продом обязательно:
- сменить dev secrets в `.env`,
- задать сильные пароли и cookie secrets,
- ограничить CORS/origins,
- включить HTTPS и `OAUTH2_PROXY_COOKIE_SECURE=true`,
- ограничить backup endpoint сетевыми правилами.

## Текущий статус README

Этот README приведён к текущей архитектуре проекта:
- Keycloak-only auth flow,
- Liquibase как единый механизм миграций,
- user lifecycle в Keycloak,
- task media + quotas + drag-and-drop,
- backup/restore через отдельный сервис.
