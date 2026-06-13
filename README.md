<div align="center">

<img src="public/logo.png" alt="Motio" width="120" />

# Motio

**Командное планирование задач на таймлайне.**

[![Version](https://img.shields.io/badge/version-0.8.31-blue.svg)](./VERSION)
[![React](https://img.shields.io/badge/React-18-61dafb.svg?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-self--hosted-3ecf8e.svg?logo=supabase&logoColor=white)](https://supabase.com/)
[![Keycloak](https://img.shields.io/badge/Keycloak-SSO-0096d6.svg?logo=keycloak&logoColor=white)](https://www.keycloak.org/)

[Возможности](#-возможности) · [Быстрый старт](#-быстрый-старт) · [Архитектура](#-архитектура) · [Документация](#-документация) · [Troubleshooting](#-troubleshooting)

</div>

---

## 📌 О проекте

**Motio** — self-hosted приложение для командного планирования задач на таймлайне с календарным режимом, проектами, ролями workspace и SSO-аутентификацией через Keycloak.

### Стек

| Слой | Технологии |
|---|---|
| **Frontend** | Vite · React 18 · TypeScript · Zustand · TanStack Query · Tailwind · Radix UI |
| **Backend** | Supabase (Postgres · GoTrue · PostgREST · Edge Functions) |
| **Auth / SSO** | Keycloak · oauth2-proxy |
| **Миграции БД** | Liquibase |
| **Инфраструктура** | Docker Compose · Nginx · отдельный backup-service |
| **i18n** | Lingui (ru / en) |

---

## ✨ Возможности

- 📅 **Таймлайн и календарь** — интерактивный планировщик с панелью деталей задачи.
- 👥 **Workspace и роли** — `viewer` / `editor` / `admin`, приглашения через Keycloak identity link.
- 🖼 **Task media** — загрузка изображений в описание задачи (кнопка, paste из буфера, drag-and-drop), приватный Storage bucket, per-user / per-workspace квоты.
- 🛡 **Keycloak-only auth** — вход через `oauth2-proxy`, lifecycle пользователей полностью в Keycloak Admin Console.
- 🗄 **Super-admin консоль** — обзор пользователей, управление workspace, backup/restore.
- 💾 **Backup / restore** — отдельный сервис с расписанием, upload/download, safety backup перед restore.
- 🔄 **Realm-as-Code** — baseline-export Keycloak realm + drift audit на каждом production-деплое.
- 🚀 **Release automation** — автоинкремент версии, синхронизация `CHANGELOG.md` / `CHANGELOG.en.md`, лог релизов.

---

## 📋 Требования

- **Node.js** 20+
- **Docker Desktop**
- *(опционально)* **Supabase CLI** — для режима `dev:local`

---

## 🚀 Быстрый старт

### 1. Локальный полный контур

```bash
make up
```

Команда:
- создаёт/обновляет `.env`;
- генерирует `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `OAUTH2_PROXY_COOKIE_SECRET`;
- поднимает `db`, `keycloak`, `auth`, `rest`, `functions`, `gateway`, `web`, `oauth2-proxy` (`backup` / `realtime` / `storage` стартуют только в `up-prod`);
- применяет Liquibase миграции;
- вызывает `bootstrap.sync` для синхронизации Keycloak ↔ Supabase.

### 2. URLs

| Сервис | URL |
|---|---|
| Приложение | http://localhost:5173 |
| Публичный лендинг | http://localhost:5173/ |
| Приватное приложение | http://localhost:5173/app |
| Keycloak | http://localhost:8081 |
| Supabase Gateway health | http://localhost:8080/health |
| Supabase Auth health | http://localhost:8080/auth/v1/health |
| Postgres | `localhost:54322` |

### 3. Остановка и логи

```bash
make down
make logs
```

### 4. Альтернативный режим — Supabase CLI

```bash
npm run dev:local
```

> Если `supabase` CLI не найден, скрипт автоматически переключится на `dev-compose`. Для полного соответствия production-поведению используйте `make up`.

---

## 🏭 Production

```bash
make up-prod
```

Что делает `up-prod`:
- требует полностью заполненный `.env`;
- проверяет обязательные переменные invite-only режима;
- делает backup `keycloak-db` перед realm-аудитом (если `AUTO_KEYCLOAK_PRE_SYNC_BACKUP=true`);
- запускает Keycloak realm drift audit (audit-only по умолчанию);
- делает pre-migration backup (если `AUTO_PRE_MIGRATION_BACKUP=true`);
- применяет Liquibase миграции;
- собирает frontend образ (`infra/web/Dockerfile`) и запускает `web + oauth2-proxy`;
- автоматически повышает patch-версию в `VERSION`, переносит `Unreleased` в `CHANGELOG.md` / `CHANGELOG.en.md`, добавляет запись в `infra/releases.log`.

### Команды

```bash
make down-prod
make logs-prod
make keycloak-backup-db
make keycloak-audit-realm
make keycloak-export-realm
```

### Удалённый деплой

```bash
make deploy-remote
# либо с явной версией
NEXT_VERSION=0.3.0 make deploy-remote
```

`infra/scripts/deploy-remote.sh` синхронизирует код, запускает `prod-compose.sh` на сервере и возвращает обновлённые `VERSION`, `CHANGELOG*.md`, `infra/releases.log` в локальный репозиторий.

### Tracked release на testing

```bash
make release-testing MSG="feat(...): ..." RU="..." EN="..." [TYPE=changed] [NEXT_VERSION=0.3.0]
```

Повышает `VERSION`, переносит `Unreleased` в оба чейнжлога, пишет историю в `infra/testing-releases.log`, коммитит/пушит артефакты и запускает `make deploy-testing` без касания production.

---

## 🏗 Архитектура

### Структура репозитория

```
.
├── src/                                 — frontend (Vite + React + TS)
├── docs/                                — внутренние материалы (локально, не в git)
├── infra/
│   ├── docker-compose.yml               — dev-контур
│   ├── docker-compose.prod.yml          — production-контур
│   ├── supabase/
│   │   ├── migrations/                  — SQL миграции
│   │   ├── liquibase/changelog-master.xml
│   │   ├── functions/                   — Edge Functions: main, admin, invite, task-media, inbox, notifications, holidays, data-export, account-purge
│   │   └── nginx.conf                   — gateway: /auth/v1, /rest/v1, /functions/v1, /backup
│   ├── keycloak/realm/
│   │   ├── timeline-realm.json          — dev realm
│   │   └── timeline-realm.prod.json     — production baseline
│   ├── backup-service/                  — backup/restore сервис
│   └── scripts/                         — dev/prod compose, Keycloak realm sync
└── Makefile
```

### Auth-поток

```
Browser → oauth2-proxy → Keycloak (OIDC) → Supabase (identity link)
Logout  : /oauth2/sign_out → oauth2-proxy backend logout → Keycloak end-session (id_token_hint) → /
```

> **Важно.** Lifecycle пользователей (create / edit / delete / password reset) управляется **только в Keycloak Admin Console**. Админка приложения показывает пользователей как обзор (доступы + storage) и не заменяет IAM.

### Keycloak Realm-as-Code

Baseline-экспорт текущего production realm:

```bash
infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json
```

Ручная проверка drift:

```bash
infra/scripts/keycloak-realm-drift-audit.sh .env
```

Client `rootUrl / baseUrl / redirectUris / webOrigins` и realm `attributes.frontendUrl` нормализуются из текущего `.env` через `keycloak-ensure-client-urls.sh` и `keycloak-ensure-realm-frontend-url.sh` — это позволяет testing-контуру оставаться автономным при импорте production baseline.

---

## ⚙️ Конфигурация

### Обязательные переменные для production

```
RESERVE_ADMIN_EMAIL
RESERVE_ADMIN_PASSWORD
KEYCLOAK_ADMIN
KEYCLOAK_ADMIN_PASSWORD
GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID
GOTRUE_EXTERNAL_KEYCLOAK_SECRET
OAUTH2_PROXY_CLIENT_ID
OAUTH2_PROXY_CLIENT_SECRET
OAUTH2_PROXY_COOKIE_SECRET
```

Шаблон: [`.env.example`](./.env.example)

Проверка перед деплоем:

```bash
make check-prod-secrets
make check-prod-secrets-remote   # проверить .env на удалённом сервере
```

> Production-деплой **блокируется**, если OIDC-секреты пустые или используют dev/default значения.

### Ключевые группы переменных

<details>
<summary><strong>Auth · Keycloak · oauth2-proxy</strong></summary>

- `GOTRUE_EXTERNAL_KEYCLOAK_*` — OIDC провайдер для Supabase Auth.
- `KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_REALM`, `KEYCLOAK_ADMIN_CLIENT_ID` — доступ Edge Functions к Keycloak Admin API.
- `KEYCLOAK_ADMIN_BASE_URL` — base URL для infra-скриптов (`http://127.0.0.1:8081` по умолчанию).
- `KEYCLOAK_MANAGED_CLIENT_IDS` — clientId (через запятую) для baseline-экспорта realm.
- `KEYCLOAK_REALM_AUDIT_FILE` — путь к managed realm JSON для drift audit.
- `KEYCLOAK_REALM_AUDIT_ENABLED` · `KEYCLOAK_REALM_AUDIT_FAIL_ON_DRIFT` — управление поведением audit в `up-prod`.
- `OAUTH2_PROXY_*` — проксирование входа на фронт.
- `OAUTH2_PROXY_BACKEND_LOGOUT_URL` — URL Keycloak end-session с `id_token_hint={id_token}`.
- `OAUTH2_PROXY_WHITELIST_DOMAINS` — allowlist для `rd` redirect после `/oauth2/sign_out`.

</details>

<details>
<summary><strong>Supabase · Postgres</strong></summary>

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`, `SUPABASE_INTERNAL_URL`
- `PGRST_DB_URI`, `GOTRUE_DB_DATABASE_URL`
- `POSTGRES_WAL_LEVEL` — должен быть `logical` для Supabase Realtime CDC.

</details>

<details>
<summary><strong>Backup / Restore</strong></summary>

- `BACKUP_CRON`
- `BACKUP_RETENTION_COUNT`
- `BACKUP_SCHEMAS` (по умолчанию `public,auth,storage`)
- `BACKUP_MAX_UPLOAD_MB`
- `BACKUP_RESTORE_DB_URL` *(опционально)*
- `BACKUP_AUTH_DB_USER`, `BACKUP_AUTH_HOST`

</details>

<details>
<summary><strong>Liquibase</strong></summary>

- `AUTO_PRE_MIGRATION_BACKUP`
- `AUTO_KEYCLOAK_PRE_SYNC_BACKUP`
- `LIQUIBASE_LOG_LEVEL`
- `MIGRATION_MAX_WAIT_SECONDS`

</details>

<details>
<summary><strong>Task media quotas</strong></summary>

- `TASK_MEDIA_MAX_FILE_BYTES` — `5MB` по умолчанию.
- `TASK_MEDIA_USER_QUOTA_BYTES` — `200MB` по умолчанию.
- `TASK_MEDIA_WORKSPACE_QUOTA_BYTES` — `2GB` по умолчанию.
- `TASK_MEDIA_TOKEN_TTL_SECONDS` — `315360000` (10 лет) по умолчанию. Токен зашит в URL внутри HTML описания задачи и не обновляется на клиенте, поэтому TTL держим длинным: короткое значение тихо ломает картинки в старых задачах.

</details>

---

## 🧪 Скрипты

### Make

```bash
make up              # локальный полный контур
make down            # остановить
make logs            # логи
make up-prod         # production запуск
make down-prod
make logs-prod
```

### npm

```bash
npm run dev               # Vite dev server
npm run dev:compose       # полный dev-контур через docker compose
npm run dev:local         # Supabase CLI режим (fallback → dev:compose)
npm run build
npm run lint
npm run typecheck         # tsc --noEmit (входит в CI-гейт)
npm run test              # unit + component
npm run test:watch
npm run test:integration
npm run lingui:extract    # извлечь строки для переводов
npm run lingui:compile    # скомпилировать .po → .js
```

---

## 🔌 Edge Functions

Роутятся через `main` на `/functions/v1/`:

### `admin`

| Action | Назначение |
|---|---|
| `bootstrap.sync` | начальная синхронизация Keycloak ↔ Supabase |
| `users.list` | обзор пользователей |
| `workspaces.list` / `workspaces.update` / `workspaces.delete` | управление workspace |
| `superAdmins.list` | обзор супер-админов |
| `keycloak.sync` | ресинх ролей |

> `users.create` / `users.update` / `users.delete` / `users.resetPassword` и `superAdmins.create` / `superAdmins.delete` **возвращают ошибку по дизайну** — lifecycle пользователей и назначение прав управляются в Keycloak.

### `invite`

- Добавляет пользователя в workspace;
- создаёт / линкует Keycloak + Supabase identity;
- синхронизирует realm-роли по workspace-ролям.

### `task-media`

| Endpoint | Описание |
|---|---|
| `POST /functions/v1/task-media` | загрузка image; валидация membership + квоты; запись в private bucket `task-media` и metadata в `public.task_media` |
| `GET /functions/v1/task-media/:id?token=…` | валидация токена, редирект на short-lived signed Storage URL; fallback на legacy `bytea` |
| `POST /functions/v1/task-media/:id/revoke` | отзыв access token (owner или workspace admin) |
| `DELETE /functions/v1/task-media/:id` | удаление blob из Storage + строки из `public.task_media` (owner или workspace admin) |

**Хранение:**
- `tasks.description` хранит URL на `task-media` endpoint;
- metadata (`workspace_id`, `owner_id`, `byte_size`, `storage_path`, access token hash) — в `public.task_media`;
- бинарные данные — в private bucket `task-media`.

**Garbage collection:**
- при сохранении описания задачи фронт диффит `description` и удаляет пропавшие `task-media`;
- при удалении задачи (single / bulk / series) все связанные картинки удаляются вместе с ней;
- cleanup-вызовы fire-and-forget — сбой GC не блокирует основную операцию, задача остаётся консистентной.

**Legacy migration (из `bytea` в Storage):**

```bash
node infra/scripts/migrate-task-media-to-storage.mjs --env-file .env
```

---

## 🛠 Admin Console

Страница: `/admin/users`

| Вкладка | Возможности |
|---|---|
| **Users** | обзор пользователей, workspace ownership, storage usage |
| **Workspaces** | rename / delete workspace |
| **Backups** | create / upload / download / rename / delete / restore |

---

## 💾 Backup / Restore

`backup-service` через `/backup`:

| Метод | Endpoint |
|---|---|
| `GET` | `/backup/backups` |
| `POST` | `/backup/backups` |
| `POST` | `/backup/backups/upload` *(binary, имя в `x-backup-name`)* |
| `GET` | `/backup/backups/:name/download` |
| `PATCH` | `/backup/backups/:name` |
| `DELETE` | `/backup/backups/:name` |
| `POST` | `/backup/backups/:name/restore` |
| `POST` | `/backup/storage-backups` *(ручной бэкап Storage-блобов; требует `STORAGE_BLOBS_DIR`, иначе 501)* |

**Restore-поток:**
1. создаёт safety backup `pre-restore-*`;
2. делает `pg_restore` по схемам из `BACKUP_SCHEMAS`;
3. восстанавливает права для `auth` роли;
4. сбрасывает соединения GoTrue к БД.

**Disaster recovery (восстановление на чистый сервер).** Штатный restore рассчитан
на базу с совпадающей схемой (тот же сервер). На свежеинициализированной БД
`pg_restore --clean --exit-on-error` падает, поэтому перед загрузкой дампа нужно:

1. Удалить предсозданные образом объекты и создать пустые схемы
   (`pg_restore --schema` не создаёт сами схемы):
   ```sql
   DROP SCHEMA IF EXISTS storage CASCADE;
   DROP SCHEMA IF EXISTS auth CASCADE;
   DROP SCHEMA IF EXISTS public CASCADE;
   CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA storage;
   ```
2. Создать недостающие роли, на которые есть GRANT в дампе:
   `CREATE ROLE metabase_ro NOLOGIN;`
3. Загрузить дамп **без** `--clean`:
   ```bash
   pg_restore --single-transaction --exit-on-error --no-owner \
     --schema public --schema auth --schema storage \
     --dbname "$DB_URL" <файл>.dump
   ```
4. Дальше — шаги 3–4 штатного restore (права `auth`, перезапуск GoTrue/storage).

Процедура проверена на копии прод-дампа (июнь 2026): после подготовки дамп
встаёт без ошибок, повторный штатный restore поверх — тоже.

---

## 🗃 Миграции (Liquibase)

- SQL файлы: `infra/supabase/migrations/*.sql`
- Мастер-чейнжлог: `infra/supabase/liquibase/changelog-master.xml`

Ручной прогон:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env run --rm migrate
```

**Добавить новую миграцию:**

1. Создать `infra/supabase/migrations/00xx_name.sql`.
2. Добавить `changeSet` в `infra/supabase/liquibase/changelog-master.xml`.
3. Прогнать `migrate`.

---

## 🩺 Troubleshooting

<details>
<summary><code>OAUTH2_PROXY_COOKIE_SECRET is required for oauth2-proxy</code></summary>

Пустая переменная `OAUTH2_PROXY_COOKIE_SECRET`. `make up` обычно генерирует её автоматически; для `make up-prod` задайте значение в `.env` или дайте скрипту сгенерировать.

</details>

<details>
<summary><code>localhost:5173 → ERR_CONNECTION_REFUSED</code></summary>

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env ps
```

`oauth2-proxy` и `web` должны быть в статусе `Up`.

</details>

<details>
<summary><code>Warning: could not confirm Keycloak sync bootstrap</code></summary>

Миграции применились, но `bootstrap.sync` не вернул `200`. Обычно причина — неверные `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`. Проверьте лог `functions` на `Invalid user credentials`.

</details>

<details>
<summary><code>Invalid user credentials</code> в admin sync</summary>

Admin-учётка в `.env` должна совпадать с master admin в Keycloak. После исправления перезапустите: `keycloak`, `functions`, `gateway`.

</details>

<details>
<summary><code>The schema must be one of the following: public</code></summary>

Где-то остался запрос к non-public schema через PostgREST. В актуальной версии users storage считается через `public.task_media`.

</details>

<details>
<summary>Bad Request в редиректе на Keycloak</summary>

Проверьте согласованность:
- `OAUTH2_PROXY_CLIENT_ID`, `OAUTH2_PROXY_REDIRECT_URL`;
- `SITE_URL` / `APP_URL` / `GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI`;
- результат `keycloak-ensure-client-urls.sh` (redirect URIs);
- результат `keycloak-ensure-realm-frontend-url.sh` (realm `frontendUrl`).

</details>

<details>
<summary><code>volume supabase_db_data declared as external, but could not be found</code></summary>

```bash
docker volume create supabase_db_data
```

</details>

<details>
<summary><code>Warning: Keycloak realm drift detected</code></summary>

Текущий realm на сервере не совпадает с managed JSON (деплой продолжен в audit-only при `KEYCLOAK_REALM_AUDIT_FAIL_ON_DRIFT=false`).

Проверить:
```bash
infra/scripts/keycloak-realm-drift-audit.sh .env
```

Обновить baseline:
```bash
infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json
```

</details>

---

## 🔐 Безопасность

Перед production-запуском:

- ✅ сменить все dev secrets в `.env`;
- ✅ задать сильные пароли и cookie secrets;
- ✅ ограничить CORS / origins;
- ✅ включить HTTPS и `OAUTH2_PROXY_COOKIE_SECURE=true`;
- ✅ ограничить backup endpoint сетевыми правилами.

---

## 📚 Документация

- [`CHANGELOG.md`](./CHANGELOG.md) · [`CHANGELOG.en.md`](./CHANGELOG.en.md) — история изменений.
- [`MANIFESTO.md`](./MANIFESTO.md) — продуктовые принципы.
- [`AGENTS.md`](./AGENTS.md) — рабочая инструкция для AI-ассистентов при работе с репозиторием.

> Внутренние материалы для онбординга и ИИ-агента (обзор продукта, архитектурные
> границы, specification-by-example) лежат локально в `docs/` и **не входят в
> репозиторий** (`.gitignore`).

---

## 🤝 Contributing

1. Fork и создайте feature-бранч: `git checkout -b feature/my-feature`.
2. Установите зависимости: `npm install`.
3. Поднимите локальный контур: `make up`.
4. Добавьте тесты (`npm run test` / `npm run test:integration`) и убедитесь, что чисто: `npm run lint` и `npm run typecheck`.
5. При добавлении новых переводимых строк обновите каталоги Lingui: `npm run lingui:extract && npm run lingui:compile`.
6. Отправьте PR с понятным описанием и ссылкой на запись в `CHANGELOG.md` (секция `Unreleased`).

---

## 📄 Лицензия

Private / proprietary. Все права защищены.
