# AGENTS.md

Этот файл — основная рабочая инструкция для AI-агентов (Claude Code, Codex и др.) в этом репозитории.
Цель: держать код понятным, расширяемым и предсказуемым при изменениях.

## 1. Приоритеты проекта

1. Читаемость и явность кода важнее "умных" сокращений.
2. Расширяемость важнее локальной оптимизации.
3. Безопасность данных и предсказуемое поведение важнее скорости внедрения.
4. Изменения должны быть проверяемыми тестами и/или спецификациями.

## 2. Источники истины

1. Обзор продукта простым языком: `notes/overview-for-ai.md` (что Motio делает, из чего состоит, как работает).
2. Архитектурные границы: `notes/architecture/frontend-boundaries.md`.
3. Поведенческие спецификации: `notes/specifications/*-behavior-by-example.md` (ядро — `planner-behavior-by-example.md`).
4. Публичная документация (трекается в git): `README.md` (витрина) и `docs/` (операционный справочник: деплой, конфигурация, backup/restore, troubleshooting).
5. Dev/Prod команды: `README.md` и `Makefile`.

> Папка `notes/` — локальные рабочие материалы для агента: она в `.gitignore` и
> **в репозиторий не коммитится** (на чистом клоне её может не быть). В рабочей
> копии этого репозитория файлы присутствуют — читать их из неё. Не добавлять
> `notes/` в git и не коммитить изменения внутри неё. Папка `docs/` — наоборот,
> публичная и трекается: при изменении деплоя/конфигурации/операционных процессов
> обновлять соответствующий файл в `docs/`.

Если есть конфликт между устаревшим кодом и этими документами, сначала привести решение к правилам документов.

## 2.1. Startup Protocol (обязательно)

Перед любым анализом, рефакторингом или реализацией выполнять в этом порядке:

1. Прочитать `AGENTS.md` полностью.
2. Прочитать `notes/overview-for-ai.md`.
3. Прочитать `notes/architecture/frontend-boundaries.md`.
4. Для изменения поведения открыть релевантный файл из `notes/specifications/*`.
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
5. Спецификация: обновить `notes/specifications/*` для пользовательского сценария.

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
4. Для **новой таблицы** в ту же миграцию класть гранты: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<таблица> TO authenticated, service_role;`. Миграции на тесте и проде применяет `supabase_admin`, дефолтные гранты Supabase на такие таблицы не срабатывают — без явного GRANT приложение получает `42501`. `GRANT ... TO anon` — **никогда**.
5. Для функции с `SECURITY DEFINER` — `REVOKE ALL ON FUNCTION public.<функция>(...) FROM public, anon;` и явный `GRANT EXECUTE` тем ролям, которые её реально вызывают. Без REVOKE падает CI-шаг SQL security lint (`infra/scripts/lint-security-definer.sh`).

## 4.2. Правила работы с переводами (Lingui)

При **любом** изменении набора переводимых строк — добавлении, удалении, переименовании или перемещении файла с `t\`...\`` / `<Trans>` — выполнить `npm run lingui:extract` и `npm run lingui:compile` и закоммитить `src/locales` тем же коммитом. Удаление компонента без extract оставляет в `.po` ссылки на несуществующие файлы: на этом падают и CI-шаг «i18n catalogs up to date», и гейт `make deploy`.

Порядок:

1. Открыть `src/locales/ru/messages.po`, найти новые записи с пустым `msgstr ""` и заполнить перевод.
2. Проверить оба языка: незаполненный перевод показывает пользователю хеш-идентификатор вида `OUca2h` вместо текста.
3. Только после этого коммитить и деплоить: `lingui compile` при деплое отработает сам, но переводы в `.po` должны быть уже на месте.

Проверка перед коммитом:
```bash
npm run lingui:extract
# Убедиться что в выводе Missing = 0 для ru, или проверить вручную
grep -n 'msgstr ""' src/locales/ru/messages.po
```

## 5. Правила деплоя

## 5.1. Local dev

> В этом проекте локальный контур **не поднимается**: агент не запускает `make up`, dev-сервер и prod-контур на своей машине. Изменения проверяются на тестовом сервере (§5.4.1). Команды ниже — справка, а не рабочий процесс.

1. Поднять контур: `make up`.
2. Остановить: `make down`.
3. Логи: `make logs`.

## 5.2. Диагностические проверки конфигурации

`make check-prod-secrets` и `make audit-migrations` — инструменты **разбора конкретного сбоя** (подозрение на кривые секреты, непонятное состояние миграций), а не обязательный шаг перед деплоем. Штатный гейт живёт внутри `infra/scripts/deploy-remote.sh`; проверка секретов вдобавок запускается на сервере сама — `prod-compose.sh` зовёт `check-prod-secrets.sh` на каждом деплое (§5.4 п.1) и запускается сам; дублировать его вручную не нужно (см. §5.4.2 п.3).

## 5.3. Production deploy (локальный запуск prod-контура)

> Тоже локальный контур — агент его **не поднимает** (см. §5.1). Раздел описывает, как prod-стек устроен и что делает `prod-compose.sh` на сервере.

1. Запуск: `make up-prod`.
2. Мониторинг: `make logs-prod`.
3. Дополнительные проверки Keycloak:
- `make keycloak-backup-db`
- `make keycloak-audit-realm`
- `make keycloak-export-realm`
4. Realm-настройки Keycloak применяются автоматически ensure-скриптами при каждом prod-деплое: `prod-compose.sh` вызывает `infra/scripts/keycloak-ensure-*.sh` (client-secret, client-urls, realm-ssl-required, realm-branding, realm-frontend-url, realm-session-policy, realm-bruteforce, realm-passwordpolicy, realm-user-profile). Новую realm-настройку вносить новым ensure-скриптом по этому же образцу, а не правкой realm-JSON: импорт JSON применяется только при первичной инициализации realm.

Не обходить скрипт `infra/scripts/prod-compose.sh` ручными шагами.

## 5.4. Remote deploy (production)

1. Основной путь: `make deploy` (алиас `make deploy-remote [NEXT_VERSION=X.Y.Z]`). Что происходит:
   - **Гейт перед деплоем** — пять шагов подряд: чистое рабочее дерево → `lint` → `typecheck` → `test` → `lingui:extract` + `lingui:compile` с проверкой, что после них `src/locales` не изменились. Стоит до первого rsync — при падении на прод не уходит ничего. Аварийный обход `DEPLOY_SKIP_CHECKS=1 make deploy` снимает **все** проверки разом. Отсюда следствие: артефакты предыдущего деплоя надо закоммитить (`make release-sync`) прежде, чем катить снова.
   - Локальное рабочее дерево уходит на сервер по rsync (`.env`, `notes/`, `dist/` и пр. исключены).
   - VERSION бампается автоматически **на сервере** (`prod-compose.sh`): PATCH+1 либо явный `NEXT_VERSION`.
   - Там же секция `Unreleased` переносится в `CHANGELOG.md`/`CHANGELOG.en.md` и дописывается `infra/releases.log`; при падении сборки web артефакты откатываются.
   - После деплоя скрипт синкает `VERSION`, оба `CHANGELOG` и `infra/releases.log` обратно в локальную копию.
2. Сразу после успешного деплоя: `make release-sync` — коммитит синкнутые релизные артефакты (`chore(release): sync release X.Y.Z`) и пушит.
3. Полный релизный путь одной командой (changelog + commit + push + deploy + sync): `make release MSG="..." RU="..." EN="..." [TYPE=changed]`.
4. GitHub Release публикуется **вручную**: `make release-publish` — запускать с `main` после мёржа рабочей ветки (деплой релизы больше не публикует). Команда идемпотентна и non-fatal: тег ставится на каждую версию, публичный Release создаётся только при реальных пользовательских изменениях в changelog.
5. Ветки: рабочая ветка — `codex/main-current`; `main` — зеркало выпущенного (точка для тегов и GitHub Releases). Влитие в `main` делается локально после `make release-sync`: `git checkout main && git pull --ff-only && git merge --no-ff codex/main-current && git push origin main`, затем `make release-publish` и возврат на рабочую ветку. Pull Request для этого не используется. Перед мёржем убедиться, что CI рабочей ветки зелёный (`gh run list --branch codex/main-current --limit 1`). Мёрж в `main` запускать с запасом по времени (≥4 мин) — он дважды зависал на шаге коммита; если процесс прервали, остаются стейл-локи `.git/HEAD.lock` / `.git/refs/heads/main.lock` (см. `docs/troubleshooting.md`, «`git merge` into `main` hangs»). Ветка `main` не защищена настройками GitHub — force-push и удаление ветки агенту **запрещены**.

Гейт деплоя **не заменяет CI**: в нём нет SQL security lint (`infra/scripts/lint-security-definer.sh`), `npm run build` и `npm run test:integration`. Успешный деплой ≠ зелёный пайплайн. После пуша проверять `gh run list --branch $(git branch --show-current) --limit 1`; красный — чинить сразу.

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
7. У `make deploy-testing` гейта нет вообще: он катит рабочее дерево как есть, включая незакоммиченное. Отсюда два правила: порядок контуров обязателен (сначала тест, потом прод) и всё, что проверено на тесте, должно быть закоммичено до `make deploy` — иначе гейт прода упрётся в грязное дерево, а на прод уедет не то, что проверяли.

## 5.4.2. Правило для агента при явной команде "сделай деплой"

1. Формулировка «сделай деплой» **без указания контура означает тестовый контур**: `make deploy-testing`. Production-деплой (`make deploy` = `make deploy-remote`, `make release`) запускается только при явном указании прода владельцем. При малейшей неоднозначности — переспросить, не выбирать прод по умолчанию.
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

1. Порядок работы с каталогами — в §4.2, повторять его здесь не нужно.
2. Проверять оба языка, русский и английский, а не только тот, на котором работаешь.
3. После обновления каталогов убедиться, что в UI не отображаются hash/id вида `zT1YvU` вместо текста.

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

1. Проверить `git status --porcelain` и убрать посторонние неотслеживаемые файлы. Особый случай — дубли вида `X 2.tsx` / `X 2.sql` (артефакты облачной синхронизации папки проекта): искать `find . -name '* 2.*' -not -path './node_modules/*'`, удалять **до** `lingui:extract`, коммита и любого деплоя. Они валят typecheck и попадают в `.po` как источники строк.
2. `npm run lint`
3. `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`)
4. `npm run test`
5. Проверить diff на случайные debug-логи и закомментированный код.

## 7.4. CI и гейты качества

CI (`.github/workflows/ci.yml`) на каждый push и pull request прогоняет два параллельных job:

- `lint-test-build`: **lint → SQL security lint → typecheck → i18n-каталоги → test → build**. Шаг «SQL security lint» (`infra/scripts/lint-security-definer.sh`) падает, если в миграциях есть функция с `SECURITY DEFINER` без `REVOKE ALL ... FROM public, anon` (см. §4.1 п.5). Шаг «i18n catalogs up to date» падает, если `npm run lingui:extract` даёт дифф в `src/locales` (см. §4.2 п.5).
- `integration-tests`: поднимает Supabase-Postgres и прогоняет Liquibase-миграции скриптом `infra/scripts/ci-test-db.sh`, затем гоняет `npm run test:integration` (RLS, RPC, cron).

Любой красный шаг останавливает пайплайн — но не мерж и не деплой (см. ниже). При этом CI **не является гейтом мержа и деплоя**: ветка `main` не защищена, а прод собирается из рабочего дерева по rsync — красный пайплайн технически не мешает выкатить релиз. Поэтому за зелёным CI следит агент (§5.4).

1. `vite build` НЕ проверяет типы (esbuild). Проверку типов даёт отдельный шаг `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`).
2. В `tsconfig.app.json` `strict: false`, но `strictNullChecks` **включён** — null/undefined-разыменования ловит компилятор. `noImplicitAny` пока выключен: неявные any не ловятся, новый код типизировать явно. Полный `strict` — отдельная постепенная задача.
3. Результаты Supabase-запросов со строковым `select` кастовать как `... as unknown as <Row>` (Supabase не выводит тип такого select — принятый паттерн границы).
4. Интеграционные тесты (`npm run test:integration`, каталог `tests/`) запускаются и в CI (job `integration-tests`). Локально при изменениях в RPC/RLS/cron гонять той же схемой: `bash infra/scripts/ci-test-db.sh`, затем `npm run test:integration`.
5. Юнит-набор (`vitest.config.ts`) идёт на `pool: 'threads'` с `testTimeout` 15 с: ~1100 тестов за ~30 с. На `forks` тот же набор шёл 20+ минут и давал ложные падения по таймауту — не возвращать. `isolate: false` не включать: тесты полагаются на чистые модули.

## 8. Definition of Done

Изменение считается завершенным, если:

1. Соблюдены слоевые границы.
2. Нет дублирования ключевой бизнес-логики.
3. Ошибки обрабатываются предсказуемо.
4. Пройдены lint, typecheck и test.
5. Обновлены notes/spec при изменении пользовательского поведения (и `docs/`, если менялись операционные процессы).

## 9. Правила инфраструктуры

### 9.0. Известные грабли (сверяться до диагностики)

Подробные рецепты — в `docs/troubleshooting.md`; здесь только то, что регулярно сбивает с толку.

1. **Флаги фич живут в серверных `.env`, из репозитория их не видно.** `VITE_FEATURE_*` читаются при сборке `web` на сервере; в репо нет ни прод-, ни тест-значений. Прежде чем считать фичу выключенной, проверить `grep '^VITE_FEATURE' /opt/new_toggl/.env` на нужном контуре. Тихий флип флага = правка серверного `.env` + пересборка `web`, без релиза.
2. **Applied ≠ live.** `EXECUTED` в `databasechangelog` не доказывает, что объект миграции есть в живой БД (триггер из 0008 однажды пропал на тесте). При странностях проверять `pg_catalog`, миграции писать идемпотентными и самодостаточными.
3. **Гранты новых таблиц** — §4.1 п.4: Liquibase на тесте/проде работает от `supabase_admin`, дефолтные гранты не срабатывают, без явного `GRANT` приложение получает `42501`.
4. **`TLS handshake timeout` при сборке `web`** — anycast `public.ecr.aws` не маршрутизируется с сервера; повторный деплой не лечит, сначала `docker pull` базовых образов на сервере в цикле.
5. **Edge Functions и `esm.sh`** — `edge-runtime` тянет зависимости с `esm.sh` на холодном старте; прод не маршрутизирует его anycast, пересоздание контейнера давало `502` на всех `/functions/v1/*`. Починено пином `extra_hosts` на IP Cloudflare и persistent-кэшем Deno (`motio_deno_cache`); при `502` после пересоздания проверять именно это.
6. **`KEYCLOAK_ADMIN_PASSWORD` не менять через `.env`** — рассинхрон с realm даёт `401` на деплое. Пароль admin меняется в Keycloak, `.env` подгоняется следом.
7. **Мёрж в `main` может зависнуть** — §5.4 п.5.

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
