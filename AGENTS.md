# AGENTS.md

Этот файл — основная рабочая инструкция для AI-агентов (Claude Code, Codex и др.) в этом репозитории.
Цель: держать код понятным, расширяемым и предсказуемым при изменениях.

## 1. Приоритеты проекта

1. Читаемость и явность кода важнее "умных" сокращений.
2. Расширяемость важнее локальной оптимизации.
3. Безопасность данных и предсказуемое поведение важнее скорости внедрения.
4. Изменения должны быть проверяемыми тестами и/или спецификациями.

## 2. Источники истины

1. Обзор продукта простым языком: `docs/overview-for-ai.md` (что Motio делает, из чего состоит, как работает).
2. Архитектурные границы: `docs/architecture/frontend-boundaries.md`.
3. Поведенческие спецификации: `docs/specifications/*-behavior-by-example.md` (ядро — `planner-behavior-by-example.md`).
4. Dev/Prod команды: `README.md` и `Makefile`.

> Папка `docs/` — локальные рабочие материалы для агента: она в `.gitignore` и
> **в репозиторий не коммитится** (на чистом клоне её может не быть). В рабочей
> копии этого репозитория файлы присутствуют — читать их из неё. Не добавлять
> `docs/` в git и не коммитить изменения внутри неё.

Если есть конфликт между устаревшим кодом и этими документами, сначала привести решение к правилам документов.

## 2.1. Startup Protocol (обязательно)

Перед любым анализом, рефакторингом или реализацией выполнять в этом порядке:

1. Прочитать `AGENTS.md` полностью.
2. Прочитать `docs/overview-for-ai.md`.
3. Прочитать `docs/architecture/frontend-boundaries.md`.
4. Для изменения поведения открыть релевантный файл из `docs/specifications/*`.
5. Зафиксировать в ответе коротко: цель задачи, затрагиваемые модули, какие границы нельзя нарушать.
6. Только после шагов 1-5 начинать правки кода, запуск команд и тестов.
7. Если найден конфликт "код vs документы", приоритет у документов; конфликт явно отметить в отчете.
8. Если данных недостаточно для безопасного изменения, сначала запросить уточнение, затем вносить изменения.

## 3. Архитектурные правила

1. `features/*/pages`: только orchestration экрана, без тяжелых доменных алгоритмов.
2. `features/*/components`: UI-слой фичи, без прямого доступа к инфраструктуре.
3. `features/*/store` и `application/*`: сценарии, мутации, синхронизация, правила обновления состояния.
4. `shared/domain`: чистые бизнес-функции без UI/IO зависимостей.
5. `shared/lib`: утилиты инфраструктуры и адаптеры.
6. `shared/ui`: переиспользуемые презентационные примитивы.

### Запрещено

1. Прямой `supabase`/HTTP доступ из `pages` и feature-UI компонентов.
2. Копирование одной и той же бизнес-логики в несколько экранов/диалогов.
3. Смешивание API контракта и UI-форматирования в одном месте.
4. Импорт `react`/`react-dom`/`@supabase`/`@tanstack`/`@/infrastructure` в `shared/domain` — слой обязан оставаться чистым.

Границы (1) и (4) частично защищены статически правилом ESLint `no-restricted-imports` (см. `eslint.config.js`): нарушение валит линт, а значит и CI. Объём защиты:

- Граница (1): линт ловит только импорт `@/shared/lib/supabaseClient` в `features/*/pages` и `features/*/components`. Прямой импорт `@supabase/*`, относительные пути к supabaseClient, `fetch`, а также код в `features/*/hooks` и `features/*/lib` линтом не ловятся — там граница держится на ревью.
- Граница (4): в `shared/domain` запрещены `react`, `react-dom`, `@supabase/*`, `@tanstack/*`, `@/infrastructure/*` и `@/shared/lib/supabaseClient`. Правило матчит спецификаторы как написано: относительные пути к supabaseClient и subpath-импорты (`react-dom/client`) оно не поймает — не обходить запрет такими импортами.

Примечание: фактическая структура `src/` шире описанной в §3 (есть также `app/`, `infrastructure/`, `shared/{components,store,contracts,hooks,assets}`; `pages`/`store` присутствуют не у всех фич). Правила §3 — о том, куда класть новый код, а не полная карта каталогов.

## 4. Правило изменений

Для любой значимой задачи использовать последовательность:

1. Доменное правило: добавить/обновить функцию в `shared/domain` или `application`.
2. Сценарий: подключить в store/service/use-case слое.
3. UI: использовать только готовый сценарий, без дублирования алгоритма.
4. Тесты: unit на доменную логику + smoke/integration на поток.
5. Спецификация: обновить `docs/specifications/*` для пользовательского сценария.

## 4.1. Правила создания миграций БД

При создании **каждой** новой миграции обязательно:

1. Создать файл `infra/supabase/migrations/XXXX_название.sql`.
2. **Сразу** добавить запись в `infra/supabase/liquibase/changelog-master.xml` по шаблону:
   ```xml
   <changeSet id="XXXX_название.sql" author="timeline" runInTransaction="true">
     <preConditions onFail="MARK_RAN" onError="HALT">
       <or>
         <not>
           <tableExists schemaName="public" tableName="schema_migrations"/>
         </not>
         <sqlCheck expectedResult="0">
           select count(*) from public.schema_migrations where filename = 'XXXX_название.sql'
         </sqlCheck>
       </or>
     </preConditions>
     <sqlFile path="../migrations/XXXX_название.sql" relativeToChangelogFile="true" splitStatements="false" stripComments="false" endDelimiter=";"/>
   </changeSet>
   ```
3. Без этой записи Liquibase не применит миграцию при деплое, колонка/таблица не появится в БД.

## 4.2. Правила работы с переводами (Lingui)

При добавлении **любого** нового `t\`...\`` или `<Trans>` в исходный код:

1. Обязательно выполнить `npm run lingui:extract` — строки добавятся в `.po` файлы.
2. Открыть `src/locales/ru/messages.po`, найти новые записи с пустым `msgstr ""` и заполнить перевод.
3. Только после этого коммитить и деплоить — иначе вместо текста пользователь увидит хеш-идентификатор (например `OUca2h`).
4. При деплое `lingui compile` запускается автоматически в Docker-сборке, но `.po` файлы должны содержать переводы **до** коммита.
5. CI-гейт: шаг «i18n catalogs up to date» валит пайплайн, если после `npm run lingui:extract` появляется дифф в `src/locales` — обновлённые каталоги обязаны быть закоммичены вместе с кодом.

Проверка перед коммитом:
```bash
npm run lingui:extract
# Убедиться что в выводе Missing = 0 для ru, или проверить вручную
grep -n 'msgstr ""' src/locales/ru/messages.po
```

## 5. Правила деплоя

## 5.1. Local dev

1. Поднять контур: `make up`.
2. Остановить: `make down`.
3. Логи: `make logs`.

## 5.2. Pre-prod проверка

Перед production запуском обязательно:

1. Проверить секреты: `make check-prod-secrets`.
2. Проверить миграции: `make audit-migrations`.
3. Убедиться, что `.env` заполнен production-значениями.

## 5.3. Production deploy (локальный запуск prod-контура)

1. Запуск: `make up-prod`.
2. Мониторинг: `make logs-prod`.
3. Дополнительные проверки Keycloak:
- `make keycloak-backup-db`
- `make keycloak-audit-realm`
- `make keycloak-export-realm`
4. Realm-настройки Keycloak применяются автоматически ensure-скриптами при каждом prod-деплое: `prod-compose.sh` вызывает `infra/scripts/keycloak-ensure-*.sh` (client-secret, client-urls, realm-ssl-required, realm-branding, realm-frontend-url, realm-session-policy, realm-bruteforce). Новую realm-настройку вносить новым ensure-скриптом по этому же образцу, а не правкой realm-JSON: импорт JSON применяется только при первичной инициализации realm.

Не обходить скрипт `infra/scripts/prod-compose.sh` ручными шагами.

## 5.4. Remote deploy (production)

1. Основной путь: `make deploy` (алиас `make deploy-remote [NEXT_VERSION=X.Y.Z]`). Что происходит:
   - Локальное рабочее дерево уходит на сервер по rsync (`.env`, `docs/`, `dist/` и пр. исключены).
   - VERSION бампается автоматически **на сервере** (`prod-compose.sh`): PATCH+1 либо явный `NEXT_VERSION`.
   - Там же секция `Unreleased` переносится в `CHANGELOG.md`/`CHANGELOG.en.md` и дописывается `infra/releases.log`; при падении сборки web артефакты откатываются.
   - После деплоя скрипт синкает `VERSION`, оба `CHANGELOG` и `infra/releases.log` обратно в локальную копию.
2. Сразу после успешного деплоя: `make release-sync` — коммитит синкнутые релизные артефакты (`chore(release): sync release X.Y.Z`) и пушит.
3. Полный релизный путь одной командой (changelog + commit + push + deploy + sync): `make release MSG="..." RU="..." EN="..." [TYPE=changed]`.
4. GitHub Release публикуется **вручную**: `make release-publish` — запускать с `main` после мёржа рабочей ветки (деплой релизы больше не публикует). Команда идемпотентна и non-fatal: тег ставится на каждую версию, публичный Release создаётся только при реальных пользовательских изменениях в changelog.
5. Ветки: рабочая ветка — `codex/main-current`; `main` получает merge из неё.

## 5.4.1. Remote deploy (testing)

Тестовый контур полностью изолирован от production.

| | Production | Testing |
|---|---|---|
| Сервер | `94.141.162.237` | `46.149.69.61` |
| Домен | `motio.nikog.net` | `test.motio.nikog.net` |
| Путь | `/opt/new_toggl` | `/opt/motio-test` |
| Deploy | `make deploy-remote` | `make deploy-testing` |
| Compose | `prod-compose.sh` | `test-compose.sh` |
| Caddy | `Caddyfile` | `Caddyfile.testing` |
| Release | `make release` | `make release-testing` |

1. Deploy на тестовый: `make deploy-testing` (в отличие от прода, VERSION/CHANGELOG не трогает и ничего не синкает назад).
2. Скрипт `deploy-testing.sh` **жёстко блокирует** деплой на prod IP.
3. Для тестового tracked release использовать отдельный путь `make release-testing MSG="..." RU="..." EN="..." [TYPE=changed] [NEXT_VERSION=X.Y.Z]`.
4. `make release-testing` повышает `VERSION`, переносит записи из `Unreleased` в `CHANGELOG.md/CHANGELOG.en.md`, пишет историю в `infra/testing-releases.log` и только потом выполняет `make deploy-testing`.
5. `.env` на тестовом сервере полностью отдельный — все секреты свои.
6. **Никогда** не использовать `make deploy-remote` для тестового сервера и наоборот.

## 5.4.2. Правило для агента при явной команде "сделай деплой"

1. Если пользователь явно просит выполнить deploy (без уточнения контура), агент по умолчанию должен запускать `make deploy` (= `make deploy-remote`, production).
2. Если пользователь явно просит деплой на тестовый / test / staging и нужно зафиксировать версию/историю изменений, агент должен запускать `make release-testing`.
3. Не выполнять дополнительные локальные pre-check команды (`make check-prod-secrets`, `make audit-migrations`, `make up-prod`, повторные `lint/test`), если пользователь отдельно этого не просил.
4. Исключение: если deploy сам завершился ошибкой или явно требует дополнительной диагностики, агент может запускать только те проверки, которые нужны для разбора конкретного сбоя.
5. После deploy выполнить краткий post-deploy минимум: доступность приложения, auth flow и проверка логов/health endpoints.
6. Не подменять `make deploy-remote` / `make deploy-testing` ручной последовательностью `rsync`/`ssh` команд.
7. После успешного production-деплоя выполнить `make release-sync`, чтобы релизные артефакты (VERSION/CHANGELOG'и/releases.log) попали в git.

## 5.4.3. Release notes для пользователей (обязательно при `make release` и `make release-testing`)

Перед выполнением `make release` или `make release-testing` агент обязан составить пользовательские release notes:

1. Получить список коммитов с последнего тега: `git log $(git describe --tags --abbrev=0)..HEAD --oneline`.
2. Отфильтровать только те, что влияют на пользователя:
   - Включать: `feat(*)`, `fix(*)` затрагивающие UI, поведение, данные пользователя.
   - Исключать: `chore`, `refactor`, `test`, `docs`, `infra`, `ci`, внутренние технические fix (миграции индексов, конфиги, docker, nginx).
3. Сформулировать кратко на русском (`RU=`) и английском (`EN=`) — с точки зрения пользователя, не разработчика.
   - ❌ "refactor(planner): extract repeat fields" → не включать
   - ❌ "chore(infra): harden routing" → не включать
   - ✅ "feat(daily-brief): добавлено утреннее окно с задачами и вехами" → включать
   - ✅ "fix(planner): исправлена синхронизация комментариев в реальном времени" → включать
4. Передать итоговый текст в `make release ...` или `make release-testing ...`.
5. Если пользовательских изменений нет — всё равно выполнить release-команду с кратким техническим описанием, пометив `[internal]`.

## 5.5. Post-deploy минимум

1. Проверить доступность приложения.
2. Проверить auth flow (вход/выход).
3. Проверить критичные сценарии: задачи, проекты, участники.
4. Проверить логи на прод-сервере: `ssh root@94.141.162.237 "cd /opt/new_toggl && docker compose -f infra/docker-compose.prod.yml --env-file .env logs --since 15m"`. Локальная `make logs-prod` показывает только локальный prod-контур (§5.3), не сервер.

## 6. Правила логирования

## 6.1. Общие

1. Логи должны помогать диагностике, а не шуметь.
2. Не логировать секреты, токены, пароли, cookies.
3. Не логировать PII без необходимости (email, full name) в открытом виде.
4. В пользовательский UI отдавать безопасное сообщение, в лог — технические детали.

## 6.2. Формат

Использовать структурированный формат с полями:

1. `module` (например `planner.store`, `members.repo`).
2. `action` (например `loadWorkspaceData`, `deleteProject`).
3. `workspaceId` и `entityId` (если есть).
4. `result` (`success`/`error`).
5. `errorCode`/`message` при ошибке.

## 6.3. Уровни

1. `debug`: временная диагностика (не оставлять в долгую).
2. `info`: значимые бизнес-события.
3. `warn`: деградация без падения.
4. `error`: сбой сценария или операции.

## 6.4. Frontend

1. Не использовать `console.log` в финальном UI-коде.
2. `console.error` только в error-path, где ошибка также обрабатывается.
3. Избегать логов внутри рендеров и горячих циклов.

## 6.5. Локализация UI

1. Любая новая пользовательская строка в интерфейсе обязана быть добавлена в локализационные каталоги `src/locales/ru/messages.po` и `src/locales/en/messages.po`.
2. Для новых и измененных UI-текстов обязательно проверять оба языка: русский и английский.
3. Перед завершением задачи с новыми строками обязательно выполнить `npm run lingui:extract` и `npm run lingui:compile`.
4. После обновления каталогов проверить, что в UI не отображаются hash/id вида `zT1YvU` вместо текста.

## 7. Правила коммитов

## 7.1. Формат

Использовать Conventional Commits:

1. `feat(scope): ...`
2. `fix(scope): ...`
3. `refactor(scope): ...`
4. `test(scope): ...`
5. `docs(scope): ...`
6. `chore(scope): ...`

Примеры:

1. `feat(planner): add repeat scope selector for bulk updates`
2. `fix(members): prevent stale assignee tasks after workspace switch`
3. `docs(architecture): define supabase access boundaries`

## 7.2. Содержимое коммита

1. Один коммит = одна логическая цель.
2. В коммите должны быть только связанные изменения.
3. Для изменения поведения обновлять тесты и/или спецификацию в том же наборе коммитов.
4. Не коммитить `dist/`, `node_modules/`, временные файлы.

## 7.3. Перед коммитом

1. `npm run lint`
2. `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`)
3. `npm run test`
4. Проверить diff на случайные debug-логи и закомментированный код.

## 7.4. CI и гейты качества

CI (`.github/workflows/ci.yml`) на каждый push и pull request прогоняет два параллельных блокирующих job:

- `lint-test-build`: **lint → typecheck → i18n-каталоги → test → build**. Шаг «i18n catalogs up to date» падает, если `npm run lingui:extract` даёт дифф в `src/locales` (см. §4.2 п.5).
- `integration-tests`: поднимает Supabase-Postgres и прогоняет Liquibase-миграции скриптом `infra/scripts/ci-test-db.sh`, затем гоняет `npm run test:integration` (RLS, RPC, cron).

Любой красный шаг останавливает пайплайн.

1. `vite build` НЕ проверяет типы (esbuild). Проверку типов даёт отдельный шаг `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`).
2. В `tsconfig.app.json` `strict: false`, но `strictNullChecks` **включён** — null/undefined-разыменования ловит компилятор. `noImplicitAny` пока выключен: неявные any не ловятся, новый код типизировать явно. Полный `strict` — отдельная постепенная задача.
3. Результаты Supabase-запросов со строковым `select` кастовать как `... as unknown as <Row>` (Supabase не выводит тип такого select — принятый паттерн границы).
4. Интеграционные тесты (`npm run test:integration`, каталог `tests/`) запускаются и в CI (job `integration-tests`). Локально при изменениях в RPC/RLS/cron гонять той же схемой: `bash infra/scripts/ci-test-db.sh`, затем `npm run test:integration`.

## 8. Definition of Done

Изменение считается завершенным, если:

1. Соблюдены слоевые границы.
2. Нет дублирования ключевой бизнес-логики.
3. Ошибки обрабатываются предсказуемо.
4. Пройдены lint, typecheck и test.
5. Обновлены docs/spec при изменении пользовательского поведения.

## 9. Правила инфраструктуры

### 9.1. Docker Compose — перезапуск контейнеров

1. **Никогда не перезапускать upstream-сервисы (`rest`, `auth`, `realtime`, `backup`) без перезапуска `gateway`.**
   - nginx (gateway) резолвит IP сервисов только при старте контейнера.
   - После пересоздания контейнеров (`--no-deps`) их IP меняются — gateway продолжает слать запросы на старые IP (111: Connection refused).
   - Правило: `docker compose ... restart rest auth realtime backup && docker compose ... restart gateway`
   - Предпочтительный путь: `make deploy-remote` / `prod-compose.sh` (поднимают весь стек сразу).

2. При ручном вмешательстве через `docker compose up -d --no-deps <service>` всегда проверять лог gateway на ошибки `connect() failed`.

### 9.2. Сетевая безопасность Docker

1. **Все порты внутренних сервисов обязательно биндить на `127.0.0.1`**, не на `0.0.0.0`:
   ```yaml
   # ❌ Опасно — доступно из интернета:
   ports:
     - "5432:5432"
   # ✅ Безопасно — только localhost:
   ports:
     - "127.0.0.1:5432:5432"
   ```
2. Публично доступны только порты 80 и 443 (через Caddy/reverse proxy).
3. Перед деплоем проверять: `docker compose config | grep -A2 'ports:'` на наличие `0.0.0.0`-биндингов.

### 9.3. PostgreSQL в Supabase-стеке

1. **Суперпользователь — `supabase_admin`, не `postgres`.**
   - `postgres` имеет `rolsuper=f` и `rolreplication=t` — изменить его пароль может только `supabase_admin`.
   - При смене пароля подключаться именно как `supabase_admin`:
     ```bash
     docker exec -u postgres infra-db-1 psql -d postgres -U supabase_admin -c \
       "ALTER ROLE postgres WITH PASSWORD '...'; ALTER ROLE supabase_admin WITH PASSWORD '...';"
     ```
2. После смены пароля в БД обязательно обновить `.env` на сервере и перезапустить `rest`, `auth`, `realtime`, `backup`, `gateway`.

### 9.4. Управление секретами

1. `.env` **не хранится в git** и **не копируется** `make deploy-remote` (rsync `--exclude '.env'`).
   - Локальный `.env` — только для local dev.
   - Серверный `.env` в `/opt/new_toggl/.env` управляется вручную через SSH.
2. Никогда не использовать дефолтные пароли (`postgres`, `admin`, `secret`) в production.
3. При любом инциденте безопасности: сначала сменить пароли в БД → обновить `.env` на сервере → перезапустить контейнеры → только потом анализировать логи.

### 9.5. Признаки атаки на PostgreSQL (COPY FROM PROGRAM)

Если в `docker logs infra-db-1` есть строки вида:
```
FATAL: password authentication failed for user "postgres"
```
массово за короткий период — это брутфорс. Проверить:
1. `docker exec infra-db-1 psql -U supabase_admin -c "SELECT pid,usename,application_name,client_addr,state,query FROM pg_stat_activity WHERE state='active';"` — подозрительные сессии.
2. `docker exec infra-db-1 ls /tmp` — наличие бинарей (`init`, `mysql`, `bot`).
3. Ответные меры: удалить файлы, заблокировать IP в UFW, перебиндить порт на 127.0.0.1, сменить пароль.
