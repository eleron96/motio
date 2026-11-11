# AGENTS.md

Основная рабочая инструкция для AI-агентов (Claude Code, Codex и др.) в этом репозитории.
Цель: держать код понятным, расширяемым и предсказуемым при изменениях.
Здесь — правила. Как всё устроено и как чинить — в `docs/` (ссылки по тексту).

## 1. Приоритеты проекта

1. Читаемость и явность кода важнее "умных" сокращений.
2. Расширяемость важнее локальной оптимизации.
3. Безопасность данных и предсказуемое поведение важнее скорости внедрения.
4. Изменения должны быть проверяемыми тестами и/или спецификациями.

## 2. Источники истины

1. Обзор продукта простым языком: `notes/overview-for-ai.md` (что Motio делает, из чего состоит, как работает).
2. Архитектурные границы: `notes/architecture/frontend-boundaries.md`.
3. Поведенческие спецификации: `notes/specifications/*-behavior-by-example.md` (ядро — `planner-behavior-by-example.md`).
4. Публичная документация (трекается в git):
   - `README.md` — витрина; `CONTRIBUTING.md` — как прислать баг, идею или PR (там же чек-лист «Adding a language»); `SECURITY.md` — приватный канал для уязвимостей; `CODE_OF_CONDUCT.md` — Contributor Covenant 2.0, контакт inbox@nikog.net; шаблоны issue/PR — `.github/`.
   - `docs/` — операционный справочник: `operations.md` (контуры, деплой, релизы, тест-стенд, бэкапы), `configuration.md`, `architecture.md`, `troubleshooting.md`, `api.md` (§4.3).
   - Сайт документации на GitHub Pages — https://eleron96.github.io/motio/: пользовательская инструкция (`/guide/`, `/ru/guide/`) и гайд для своих серверов (`/self-hosting/`; в `/ru/self-hosting/` те же английские страницы с пометкой). VitePress в `docs-site/` копирует страницы из `docs/` при сборке (`docs-site/sync-pages.mjs`); workflow `Docs site` собирает на каждый push в них (ловит битые ссылки) и публикует только с `main`. Страницы — обычный markdown, читаемый и на GitHub: ссылки внутри — относительные (`./page.md`, на папку — `../self-hosting/`, не на `README.md`: на сайте он становится индексом папки), наружу — абсолютные `https://github.com/eleron96/motio/blob/main/…`; в заголовках, на которые есть ссылки, — без апострофов, номеров в начале, «й» и «ё» (иначе якоря GitHub и сайта расходятся).
   - `docs/self-hosting/` — гайд для своих серверов, страница на тему (§5.6), только на английском. `docs/self-hosting.md` — только оглавление со старыми якорями: на него ссылаются лендинг и установщики выпущенных версий, не удалять.
   - `docs/guides/` — пользовательская инструкция (как работать в Motio, не эксплуатация): страница на раздел и три сценария, на английском, и та же инструкция на русском в `docs/guides/ru/` (те же имена файлов). Меняются кнопка, название, жест или поведение, описанные в ней, — тем же коммитом правятся **обе** языковые версии; новая заметная возможность — строка на нужной странице. Подписи брать из каталогов Lingui (`src/locales/ru/messages.po`), факты сверять по коду. Скриншоты — с публичного `/demo` в 1600×1000 (телефон — 390×844), отдельно для каждого языка: `docs/guides/images/` и `docs/guides/ru/images/`; переснимать сценарием `notes/demo-screenshots/shoot-guide.mjs` (локальный, `node shoot-guide.mjs <папка> en|ru all`).
5. Команды: `Makefile` и `docs/operations.md`.

Папка `notes/` — локальные рабочие материалы агента: она в `.gitignore` и **в репозиторий не коммитится** (на чистом клоне её может не быть; в этой рабочей копии файлы есть — читать их отсюда). Не добавлять `notes/` в git (в том числе через `git add -f`) и не коммитить изменения внутри неё. Карта папки — `notes/README.md`; источник истины — только пункты 1–3, `notes/archive/` — история, не правила. В `notes/` кладутся текст и скрипты; кадры, трейсы и профили браузера — во временную папку, после задачи удалить. Папка `docs/` — наоборот, публичная: при изменении деплоя, конфигурации или операционных процессов обновлять соответствующий файл в `docs/`.

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
3. `features/*/store` и `application/*`: сценарии, мутации, синхронизация, правила обновления состояния. Большой стор — корневой `<store>.ts` (состояние и сборка), `<store>.contract.ts` (типы) и срезы действий `<store>.<область>Actions.ts`; новое действие — в срез своей области, не в корневой файл.
4. `shared/domain`: чистые бизнес-функции без UI/IO зависимостей.
5. `shared/lib`: утилиты инфраструктуры и адаптеры.
6. `shared/ui`: переиспользуемые презентационные примитивы.

Это правила о том, куда класть **новый** код, а не полная карта `src/` (есть ещё `app/`, `infrastructure/`, `shared/{components,store,contracts,hooks,assets}`; `pages`/`store` есть не у всех фич). Карта — `notes/architecture/frontend-boundaries.md`.

### Запрещено

1. Прямой `supabase`/HTTP доступ из `pages` и feature-UI компонентов.
2. Копирование одной и той же бизнес-логики в несколько экранов/диалогов.
3. Смешивание API контракта и UI-форматирования в одном месте.
4. Импорт `react`/`react-dom`/`@supabase`/`@tanstack`/`@/infrastructure` в `shared/domain` — слой обязан оставаться чистым.

Границы (1) и (4) частично защищены правилом ESLint `no-restricted-imports` (`eslint.config.js`): нарушение валит линт, а значит и CI. Объём защиты:

- (1): линт ловит импорт `@/shared/lib/supabaseClient` в `features/*/pages` и `features/*/components`. Храповик `npm run check:health` (§7.5 п.4) ловит шире: импорт `@supabase/supabase-js` или supabaseClient (любым путём) в любом файле `features/*`, кроме `store/` и `demo`. Хуку, провайдеру или `lib`, которым нужна база, — репозиторий в `src/infrastructure/*`. `fetch` не ловит никто — держится на ревью.
- (4): в `shared/domain` запрещены `react`, `react-dom`, `@supabase/*`, `@tanstack/*`, `@/infrastructure/*` и `@/shared/lib/supabaseClient`. Правило матчит спецификаторы как написано: относительные пути к supabaseClient и subpath-импорты (`react-dom/client`) оно не поймает — не обходить запрет такими импортами.

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

При **любом** изменении набора переводимых строк — добавлении, удалении, переименовании или перемещении файла с `t\`...\`` / `<Trans>` — выполнить `npm run lingui:extract` и `npm run lingui:compile` и закоммитить `src/locales` тем же коммитом. Удаление компонента без extract оставляет в `.po` ссылки на несуществующие файлы: на этом падают и CI-шаг «i18n catalogs up to date», и гейт `make deploy`. Если строки удалялись, извлекать с `npx lingui extract --clean`: обычный extract лишь помечает их `#~`, а `compile` всё равно кладёт их в бандл.

Языки интерфейса: `en` (исходный, msgid — английский текст), `ru`, `de`. Немецкий — деловой, на «Sie», термины по глоссарию (Arbeitsbereich, Zeitachse, Aufgabe, Zuständig, Meilenstein, Abwesenheit, Label вместо Tag, Inhaber/Admin/Bearbeiter/Leser). Непереведённая строка показывается по-английски (`fallbackLocales`), но в репозиторий такие не попадают.

Порядок:

1. Открыть `src/locales/ru/messages.po` и `src/locales/de/messages.po`, найти новые записи с пустым `msgstr ""` и заполнить перевод в обоих.
2. Проверить все три языка: плейсхолдеры (`{name}`, `{0}`) и теги (`<0>…</0>`) должны остаться как в msgid.
3. Только после этого коммитить и деплоить: `lingui compile` при деплое отработает сам, но переводы в `.po` должны быть уже на месте.
4. В интерфейсе смотреть все три языка, а не только тот, на котором работаешь: немецкий текст длиннее на ~30% — проверять обрезки и переносы на телефоне; вместо текста не должны показываться hash/id вида `zT1YvU`.

Полноту проверяет `src/test/smoke/localeCatalogs.test.ts` (часть `npm run test`, а значит CI и гейта деплоя): пустой `msgstr` или потерянный плейсхолдер в `ru`/`de` валит его.

```bash
npm run lingui:extract          # в выводе Missing = 0 для ru и de
npx vitest run src/test/smoke/localeCatalogs.test.ts
```

Язык выбирается не только каталогом: списки языков живут ещё в коде, БД, письмах и Keycloak. Новый язык добавлять только по чек-листу «Adding a language» в `CONTRIBUTING.md` — иначе часть интерфейса (даты, письма, пуши, примеры пространства, страница входа) останется на английском, а сохранение языка в профиль упадёт на `profiles_locale_check`. Новый язык — решение владельца: каждый следующий язык удорожает каждую новую строку.

## 4.3. API пространства (импорт отсутствий)

Внешний API — Edge Function `api` (`/functions/v1/api/v1/...`), контракт и примеры — `docs/api.md`. Поверхность атаки, поэтому:

1. Любое изменение контракта (поля, коды ошибок, лимиты) — тем же коммитом в `docs/api.md`; старые клиенты не ломать без нужды.
2. Авторизация — только токеном пространства (`Authorization: Bearer motio_…`): в БД лишь SHA-256-хеш, таблица `workspace_api_tokens` закрыта для `anon`/`authenticated` (RLS без политик), управление — RPC с проверкой «админ пространства». Новый метод получает ровно те права, что описаны в `docs/api.md`, и ничего сверх.
3. Бизнес-правила — в функциях `api_*` (SECURITY INVOKER, `EXECUTE` только `service_role`), Edge Function — тонкая (разбор запроса — `_shared/timeOffApi.ts`, покрыт юнит-тестом).
4. API трогает только свои записи (`time_off.external_id is not null`); триггер `time_off_guard_external_id` не даёт клиенту поставить или сменить `external_id` — не снимать.
5. У `/functions/v1/api/` своя зона лимита в gateway (`public_api_limit`) и нет CORS — не переносить API под общую зону.
6. Логи — структурные (`module: api.time-off`), без токенов и почт.
7. Раздел «API» в настройках — за флагом `VITE_FEATURE_WORKSPACE_API`; включение на проде — решение владельца.

## 5. Правила деплоя

## 5.1. Локальный контур

Локальный контур **не поднимается**: агент не запускает `make up`, dev-сервер и `make up-prod` на своей машине. Изменения проверяются на тестовом сервере (§5.4.1). Команды и устройство локального контура — справка в `docs/operations.md` («Local development», «Production (local prod stack)»).

## 5.2. Диагностические проверки конфигурации

`make check-prod-secrets` и `make audit-migrations` — инструменты **разбора конкретного сбоя** (подозрение на кривые секреты, непонятное состояние миграций), а не шаг перед деплоем. Штатный гейт живёт в `infra/scripts/deploy-remote.sh`, а `prod-compose.sh` сам запускает `check-prod-secrets.sh` на сервере при каждом деплое — дублировать вручную не нужно (§5.4.2 п.3).

## 5.3. Prod-стек на сервере

1. Не обходить `infra/scripts/prod-compose.sh` ручными шагами; что он делает — `docs/operations.md`.
2. Realm-настройки Keycloak применяются ensure-скриптами при каждом деплое (`infra/scripts/keycloak-ensure-*.sh`: client-secret, client-urls, realm-ssl-required, realm-branding, realm-frontend-url, realm-session-policy, realm-bruteforce, realm-passwordpolicy, realm-user-profile, realm-locales). Новую realm-настройку вносить новым ensure-скриптом по этому образцу (и подключать по §5.6 п.4), а не правкой realm-JSON: импорт JSON применяется только при первичной инициализации realm.
3. Утилиты Keycloak (`make keycloak-backup-db`, `make keycloak-audit-realm`, `make keycloak-export-realm`) работают с локальным `.env` и локальным docker, то есть с локальным контуром (§5.1), а не с сервером; справка — `docs/operations.md`, «Production (local prod stack)».

## 5.4. Remote deploy (production)

1. Путь: `make deploy` (алиас `make deploy-remote [NEXT_VERSION=X.Y.Z]`):
   - **Гейт** до первого rsync, пять шагов: чистое рабочее дерево → `lint` → `typecheck` → `test` → `lingui:extract` + `lingui:compile` без изменений в `src/locales`. При падении на прод не уходит ничего. `DEPLOY_SKIP_CHECKS=1 make deploy` снимает **все** проверки разом — только аварийно. Следствие: артефакты прошлого деплоя закоммитить (`make release-sync`) прежде, чем катить снова.
   - Рабочее дерево уходит на сервер по rsync (`.env`, `notes/`, `dist/` и пр. исключены). На сервере `prod-compose.sh` бампает `VERSION` (PATCH+1 или `NEXT_VERSION`), переносит `Unreleased` в `CHANGELOG.md`/`CHANGELOG.en.md` и дописывает `infra/releases.log` (при падении сборки web откатывает). После деплоя `deploy-remote.sh` синкает `VERSION`, оба CHANGELOG и `infra/releases.log` обратно в локальную копию.
2. Сразу после успешного деплоя: `make release-sync` — коммитит синкнутые артефакты (`chore(release): sync release X.Y.Z`) и пушит.
3. Полный путь одной командой (changelog + commit + push + deploy + sync): `make release MSG="..." RU="..." EN="..." [TYPE=changed]`.
4. GitHub Release публикуется **сам**: workflow `Release` (`.github/workflows/release.yml`) на каждый push в `main` запускает `infra/scripts/release-publish.sh`; деплой релизы не публикует. Скрипт идемпотентен: ставит тег на текущий `VERSION` (версии между влитиями тегов не получают), Release создаёт только при пользовательских изменениях и делает его **накопительным** — из секций changelog всех версий с прошлого опубликованного Release (если тот не найден через `gh` или в `CHANGELOG.en.md` — только текущая секция). Строгий режим (`RELEASE_PUBLISH_STRICT=1`): неопубликованный Release = красный прогон, после мёржа проверять `gh run list --workflow Release --limit 1`. Запасной путь (повтор, недоступен Actions) — `make release-publish` с `main`: non-fatal, подхватывает тег из CI.
5. Ветки: рабочая — `codex/main-current`; `main` — зеркало выпущенного (теги и GitHub Releases).
   - Влитие в `main` — **только по команде владельца** («сделай релиз», «влей в main»), не после каждого деплоя. Pull Request не используется.
   - Порядок: `make release-sync` → CI рабочей ветки зелёный (`gh run list --branch codex/main-current --workflow CI --limit 1`) → `git checkout main && git pull --ff-only && git merge --no-ff codex/main-current && git push origin main` → вернуться на рабочую ветку. Этот пуш сам публикует Release (п. 4).
   - Если в дереве параллельно идёт другая работа или возможен деплой — мёржить из отдельного `git worktree add <путь> main`, не переключая рабочее дерево: `make deploy` rsync-ит дерево как есть, и дерево на `main` увезло бы на прод старый код.
   - Мёрж запускать с запасом по времени (≥4 мин): он зависал на шаге коммита; прерванный оставляет стейл-локи `.git/HEAD.lock` / `.git/refs/heads/main.lock` (`docs/troubleshooting.md`, «`git merge` into `main` hangs»).
   - `main` не защищена настройками GitHub — force-push и удаление ветки агенту **запрещены**.

Гейт деплоя **не заменяет CI**: в нём нет храповика `npm run check:health`, SQL security lint, проверки типов Edge Functions, `npm run build`, `npm run test:backup`, `npm run test:integration` и `npm run test:e2e`. Успешный деплой ≠ зелёный пайплайн. После пуша проверять `gh run list --branch $(git branch --show-current) --workflow CI --limit 1` (без `--workflow` последним может оказаться Image scan, Self-hosted upgrade или Docs site); красный — чинить сразу.

## 5.4.1. Remote deploy (testing)

Тестовый контур полностью изолирован от production.

| | Production | Testing |
|---|---|---|
| Сервер | `94.141.162.237` | `72.56.34.157` |
| Домен | `motio.nikog.net` | `test.motio.nikog.net` |
| Путь | `/opt/new_toggl` | `/opt/motio-test` |
| Deploy | `make deploy-remote` | `make deploy-testing` |
| Compose | `prod-compose.sh` | `test-compose.sh` |
| Caddy | `Caddyfile` | `Caddyfile.testing` |
| Release | `make release` | `make release-testing` |

1. `make deploy-testing` не трогает `VERSION`/CHANGELOG и ничего не синкает назад. `deploy-testing.sh` **жёстко блокирует** деплой на prod IP.
2. Tracked release на тест — `make release-testing MSG="..." RU="..." EN="..." [TYPE=changed] [NEXT_VERSION=X.Y.Z]`: повышает `VERSION`, переносит `Unreleased` в оба CHANGELOG, пишет `infra/testing-releases.log` и потом выполняет `make deploy-testing`.
3. `.env` на тестовом сервере полностью отдельный — все секреты свои.
4. **Никогда** не использовать `make deploy-remote` для тестового сервера и наоборот.
5. У `make deploy-testing` гейта нет: он катит рабочее дерево как есть, включая незакоммиченное. Поэтому порядок контуров обязателен (сначала тест, потом прод), и всё проверенное на тесте должно быть закоммичено до `make deploy` — иначе гейт прода упрётся в грязное дерево, а на прод уедет не то, что проверяли.
6. Тестовый сервер **общий** с другим проектом владельца — ids-checker, и для него это **прод** (https://check-ifc.nikog.webtm.ru); ids-checker о соседе знает (его `docs/operations.md`, «Соседи на сервере»). Карта — §5.4.1.1. Прежний тестовый сервер `46.149.69.61` с 2026-10-22 выводится: туда не деплоить.
7. Тестовые данные — `make seed-testing`: пересобирает пространство «Motio QA Playground» из сида `/demo` (`src/features/demo/lib/demoSeed.ts`) для QA-учёток тестового Keycloak (подробно — `docs/operations.md`, «Testing stand»). Повторный запуск заменяет только это пространство; Keycloak скрипт лишь читает, пароли не задаёт; прод отклоняет. Меняя `demoSeed.ts`, меняешь и тестовый стенд. Живых людей добавляет строка `SEED_TESTING_EXTRA_MEMBERS=email:role,…` в `.env` тестового сервера — личные адреса в репозиторий не кладём. Суперадмин без единого пространства считается резервной служебной учёткой и попадает сразу в админку, поэтому владельцу на тесте нужно членство.

## 5.4.1.1. Карта теста: что происходит по «кати на тест»

«Кати на тест» / «сделай деплой» без указания контура = `make deploy-testing` из этого репозитория (§5.4.2). Устройство стенда подробно — `docs/operations.md`, «Testing stand».

| Что | Где |
|---|---|
| Сервер | `root@72.56.34.157` — **общий с прод-контуром ids-checker** (`/opt/ids-checker`, контейнеры `ids-checker*`) |
| Код и `.env` теста | `/opt/motio-test` (rsync рабочего дерева, `.env` только серверный) |
| Контейнеры теста | compose-проект `infra` (`infra-*`) + `motio-caddy` (вне compose) |
| Вход снаружи | хостовый nginx ids-checker (80/443) → сайт `motio-test` (= `infra/nginx/motio-test.conf`, ставится руками) → `motio-caddy` на `127.0.0.1:8088` → `web` / `gateway` / `oauth2-proxy` |
| Keycloak | **общий** `ids-checker-keycloak` (26.1, под `/auth`), realm `timeline`; БД — `ids-checker-keycloak-db` (её читает `seed-testing.sh`); админка обоих realm — https://check-ifc.nikog.webtm.ru/auth/admin/ (master-админ = `KEYCLOAK_ADMIN*` в `.env` теста). Свой Keycloak Motio на тесте не стартует (профиль `own-keycloak`): `infra-keycloak-1`/`-db-1` остановлены намеренно, тома сохранены для отката |

Кто может войти: регистрация в realm `timeline` **закрыта**; включены только владелец, `qa.alice` (под ней работает агент, тестирующий выгрузки — **пароль ей не сбрасывать**) и резервный админ `RESERVE_ADMIN_EMAIL`. Остальные учётки, включая `qa.bob/carol/dave/newbie`, выключены, не удалены; включать — только по просьбе владельца.

Деплой теста трогает: `/opt/motio-test`, контейнеры `infra-*`, reload `motio-caddy`, тему в `/opt/keycloak-themes/timeline` (её изменение перезапускает `ids-checker-keycloak` — вход ids-checker мигает ~30 с) и настройки realm `timeline` (ensure-скрипты через `127.0.0.1:8081/auth`). Трогать нельзя: всё `ids-checker*`, его compose (блок `keycloak` живёт в репозитории ids-checker), его nginx-сайт, сайт ТЭП `test-tep`, UFW; `harden-firewall.sh` на тесте не запускать. Без нужды не перезапускать `ids-checker-keycloak` — это вход прода ids-checker.

Post-deploy на тесте (кроме §5.5):

```bash
# вход приложения: Location должен вести на https://test.motio.nikog.net/realms/timeline/…, а не на внутренний адрес
curl -s -o /dev/null -D - "https://test.motio.nikog.net/auth/v1/authorize?provider=keycloak&redirect_to=https://test.motio.nikog.net/app" | grep -i '^location'
ssh root@72.56.34.157 "cd /opt/motio-test && docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.testing.yml --env-file .env logs --since 15m"
ssh root@72.56.34.157 "docker logs --since 15m ids-checker-keycloak 2>&1 | grep -E 'ERROR|realmName=\"timeline\"' | tail"
ssh root@72.56.34.157 "docker stats --no-stream"   # память общая с воркером ids-checker (лимит 6G)
```

Вход проверять именно через `/auth/v1/authorize`, а не `/oauth2/start`: GoTrue строит адрес из внутреннего URL Keycloak, и для каждого внутреннего адреса нужна своя строка `proxy_redirect` в gateway (`docs/troubleshooting.md`, «Testing sign-in sends the browser to `ids-checker-keycloak:8080`»).

## 5.4.2. Правило для агента при явной команде "сделай деплой"

1. «Сделай деплой» **без указания контура означает тестовый контур**: `make deploy-testing`. Production-деплой (`make deploy` = `make deploy-remote`, `make release`) — только при явном указании прода владельцем. При малейшей неоднозначности — переспросить, не выбирать прод по умолчанию.
2. Если владелец явно просит деплой на тестовый / test / staging и нужно зафиксировать версию/историю изменений — `make release-testing`.
3. Не выполнять дополнительные pre-check команды (`make check-prod-secrets`, `make audit-migrations`, `make up-prod`, повторные `lint/test`), если владелец отдельно не просил.
4. Исключение: если deploy сам завершился ошибкой или явно требует дополнительной диагностики — запускать только проверки, нужные для разбора конкретного сбоя.
5. После deploy — post-deploy минимум (§5.5).
6. Не подменять `make deploy-remote` / `make deploy-testing` ручной последовательностью `rsync`/`ssh` команд.
7. После успешного production-деплоя — `make release-sync` (§5.4 п.2).

## 5.4.3. Release notes для пользователей (обязательно при `make release` и `make release-testing`)

1. Коммиты с прошлого релиза: `git log --oneline "$(git log -1 --format=%H --grep='^chore(release): sync release')"..HEAD`. Граница — последний коммит `make release-sync` на рабочей ветке. Теги `vX.Y.Z` не годятся: CI ставит их на мёрж-коммиты в `main`, из `codex/main-current` они недостижимы, и `git describe` уводит к давнему тегу.
2. Оставить только влияющие на пользователя: `feat(*)`, `fix(*)` про UI, поведение, данные пользователя. Исключать `chore`, `refactor`, `test`, `docs`, `infra`, `ci` и внутренние технические fix (индексы, конфиги, docker, nginx).
3. Сформулировать кратко на русском (`RU=`) и английском (`EN=`) с точки зрения пользователя: ✅ «добавлено утреннее окно с задачами и вехами», ❌ «extract repeat fields».
4. Передать текст в `make release ...` / `make release-testing ...`. Нет пользовательских изменений — всё равно выполнить команду с кратким техническим описанием, пометив `[internal]`.
5. Тот же текст уходит в окно «Последние изменения» в приложении и в публичный GitHub Release — писать для людей, без идентификаторов. При голом `make deploy` release notes = то, что лежит в `Unreleased`: пустой раздел уйдёт как «Нет зафиксированных изменений», поэтому перед деплоем проверить `Unreleased` и при необходимости дописать запись `make logchange`.
6. `make deploy` и `make release-sync` запускать из рабочего дерева на `codex/main-current` (`release-sync` коммитит и пушит **текущую** ветку). Из worktree агента на своей ветке — нельзя: синк уйдёт не в ту ветку.
7. Плашка «Вышла новая версия Motio» в открытых вкладках появляется **только при смене второй цифры** версии (0.10.x → 0.11.0; `isNotableUpdate`, решение владельца 2026-11-09 — люди жаловались на плашку после каждого из частых релизов). Обычный релиз (PATCH+1) доходит тихо, при следующем открытии страницы. «Важный релиз» владельца = `NEXT_VERSION=<следующая минорная>.0` в `make release` / `make deploy`; без этих слов версию не поднимать.

## 5.5. Post-deploy минимум

1. Доступность приложения.
2. Auth flow (вход/выход).
3. Критичные сценарии: задачи, проекты, участники.
4. Логи и health endpoints на сервере: `ssh root@94.141.162.237 "cd /opt/new_toggl && docker compose -f infra/docker-compose.prod.yml --env-file .env logs --since 15m"` (для теста — §5.4.1.1). Локальная `make logs-prod` показывает только локальный контур, не сервер.

## 5.6. Self-host: установка на чужие серверы

Установщик: `infra/scripts/install.sh` (install / update / rollback / backup / restore / up / status / `--env-only`), обёртка `infra/scripts/selfhost-compose.sh`, оверлеи `infra/docker-compose.selfhost.yml` (+ `docker-compose.selfhost-tls.yml`, `docker-compose.selfhost-proxy-network.yml` при `MOTIO_PROXY_NETWORK` и незатреканный `docker-compose.selfhost.local.yml` пользователя), `infra/caddy/Caddyfile.selfhost`, `infra/scripts/keycloak-ensure-realm-smtp.sh`. Документация — `docs/self-hosting/` (§2 п.4): изменение поведения установщика или новой возможности для своих серверов — тем же коммитом в нужную страницу. **Прод и тест владельца ими не пользуются** — их путь `make deploy` / `make deploy-testing`. Клиенты ставят и обновляются с **тега релиза**: правка установщика доходит до них только после прод-релиза.

При изменениях держать self-host в согласии с продом:

1. **Новый публичный маршрут** (страница или файл без сессии) — во все три Caddyfile: `Caddyfile`, `Caddyfile.testing`, `Caddyfile.selfhost`. Паритет проверяет `src/test/smoke/publicRoutes.test.ts`.
2. **Новая переменная в `.env.example`** — решить, генерировать ли её или выводить из домена в `install.sh` (`generate_env`); описать в `docs/configuration.md`. При `install.sh update` новые ключи дописываются из `.env.example` с дефолтом — дефолт обязан работать на чужой установке.
3. **Новый `VITE_*`** — `ARG`/`ENV` в `infra/web/Dockerfile` и `build.args` в `docker-compose.prod.yml`; новый флаг фичи — осознанный дефолт для self-host в `install.sh` и строка в таблице `docs/self-hosting/settings.md`.
4. **Новый ensure-скрипт Keycloak** — в `prod-compose.sh`, `test-compose.sh` **и** в список `bring_up` в `install.sh`.
5. **Новый сервис, том или порт в `docker-compose.prod.yml`** — проверить оверлей self-host: имена томов через `MOTIO_INSTANCE`, наружу ничего, кроме Caddy, лимиты памяти под 4 ГБ. Проверка: `docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.selfhost.yml --env-file <тестовый .env> config`.
6. **Изменение, требующее действия от self-host** (новая обязательная настройка, ручной шаг) — отдельной строкой в CHANGELOG простым языком: «Для своих серверов: …».
7. **Домен, аналитика и мониторинг владельца** в коде не вписывать: адрес сайта — `VITE_PUBLIC_SITE_URL` (`vite/siteIdentity.ts`), аналитика владельца подставляется только `prod-compose.sh`; чужая установка по умолчанию никуда ничего не шлёт (проверяет `src/test/smoke/selfhostInstallEnv.test.ts`).
8. **Пробная установка** — чистого VPS нет; владелец разрешил тест-сервер при строгой изоляции: свой каталог и `--instance`, режим `proxy` на `127.0.0.1` (80/443 — nginx соседа), свои порты gateway/Keycloak, проверка через SSH-туннель, перед `up` — нет `external: true` томов. После проверки — `selfhost-compose.sh down -v`, удалить собранные образы `<instance>-*` и каталог; общие образы (`caddy:2.11` использует `motio-caddy`) не трогать.
9. Резервный админ (`RESERVE_ADMIN_*`) — служебная учётка, сразу в `/app/admin`; первый человек на чужой установке регистрируется сам. Не делать почту установщика резервным админом.
10. **Бэкап-наборы** (`infra/backups/install/<вид>-<время>/`) — холодная копия томов из `set_volumes` в `install.sh` + `.env` + коммит; `update` снимает набор перед миграциями, `rollback`/`restore` кладут тома обратно побайтно и переключают checkout. **Новый том с данными в `docker-compose.prod.yml` — сразу в `set_volumes`**, иначе откат вернёт всё, кроме него. Копирует `tar` из образа `db` (GNU tar: сохраняет владельцев и xattrs файлов storage-api).
11. **Пожелание чужой установки, которое меняет поведение у нас, — настройкой, по умолчанию «как на проде сейчас»** (решение владельца 2026-11-04). Кому нужно — переключит у себя. Новая настройка: ключ в `.env.example`, в compose с дефолтом `${KEY:-…}` (для `VITE_*` ещё `infra/web/Dockerfile` и `install.sh`), описание в `docs/configuration.md` и таблице `docs/self-hosting/settings.md`. Примеры: `VITE_START_PAGE=landing` (`app` — сразу вход вместо стартовой страницы), `KEYCLOAK_SUPER_ADMIN_FROM_GROUPS=false` (роль `app_super_admin` от группы Keycloak). Это постоянные настройки, не флаги фич §7.5 п.1: имя без `VITE_FEATURE_`, не удаляются. Переводы и чисто добавочные поля настройки не требуют.
12. **Настройки сервера** (решение владельца 2026-11-09) — для новых опций поведения это путь по умолчанию вместо ключа `.env`/`VITE_*`: ключ в реестре `infra/supabase/functions/_shared/instanceSettingsRegistry.ts` (копия байт-в-байт — `src/shared/contracts/instanceSettingsRegistry.ts`, тест сверяет), умолчание `false` = как сейчас на проде, значения — в таблице `instance_settings` (0176). Меняются без пересборки: админка «Настройки», `install.sh settings`, `make settings CONTOUR=…`; фронт получает их в ответе whoami (`useInstanceSetting`). Выключено = ровно прежнее поведение: ни интерфейса, ни лишних запросов, сохранённые значения не учитываются. Ключ `.env` — только для того, что нужно сервисам при старте; старые `KEYCLOAK_*_FROM_GROUPS=true` закрепляют свои переключатели. Описание — `docs/self-hosting/settings.md` и `docs/configuration.md`, «Server settings».

## 6. Правила логирования

1. Логи помогают диагностике, а не шумят. Не логировать секреты, токены, пароли, cookies; не логировать PII (email, полное имя) в открытом виде без необходимости. Пользователю — безопасное сообщение, в лог — технические детали.
2. Формат структурный: `module` (`planner.store`, `members.repo`), `action` (`loadWorkspaceData`, `deleteProject`), `workspaceId`/`entityId` (если есть), `result` (`success`/`error`), `errorCode`/`message` при ошибке.
3. Уровни: `debug` — временная диагностика (не оставлять в долгую); `info` — значимые бизнес-события; `warn` — деградация без падения; `error` — сбой сценария или операции.
4. Frontend: без `console.log` в финальном UI-коде; `console.error` — только в error-path, где ошибка также обрабатывается; без логов в рендерах и горячих циклах.
5. Журнал админки (`admin_audit_log`, 0181; «Админка → Журнал»): новое изменяющее действие функции `admin` — строкой в `adminAuditEntry` (`infra/supabase/functions/_shared/adminAudit.ts`, тест рядом). В журнал — id, роли, ключи и значения настроек; без почт, текстов писем, паролей и токенов.

Локализация UI — §4.2.

## 7. Правила коммитов

## 7.1. Формат

Conventional Commits: `feat`, `fix`, `refactor`, `test`, `docs`, `chore` со scope — например `feat(planner): add repeat scope selector for bulk updates`, `fix(members): prevent stale assignee tasks after workspace switch`, `docs(architecture): define supabase access boundaries`.

## 7.2. Содержимое коммита

1. Один коммит = одна логическая цель, только связанные изменения.
2. Для изменения поведения обновлять тесты и/или спецификацию в том же наборе коммитов.
3. Не коммитить `dist/`, `node_modules/`, временные файлы.
4. Репозиторий **публичный**. В код, комментарии, миграции, тесты, сообщения коммитов и `CHANGELOG` не попадают реальные люди и клиенты: имена, почты, логины, id пользователей, названия компаний-заказчиков, метрики прода. В примерах — вымышленные данные (`*.example`, «Анна», «Север»). Персональное — живые данные: задаётся SQL-ом на сервере, через админку или серверный `.env` (как `SEED_TESTING_EXTRA_MEMBERS`), а не сидом в миграции. Внутренняя аналитика и разборы — только в `notes/`.

## 7.3. Перед коммитом

1. `git status --porcelain` — убрать посторонние неотслеживаемые файлы. Особый случай — дубли `X 2.tsx` / `X 2.sql`: это артефакты облачной синхронизации, значит папка снова попала под iCloud (рабочая копия держится вне Рабочего стола и «Документов»). Искать `find . -name '* 2.*' -not -path './node_modules/*'` и удалять **до** `lingui:extract`, коммита и любого деплоя — они валят typecheck и попадают в `.po`.
2. `npm run lint`, `npm run check:health`, `npm run typecheck`, `npm run test`.
3. Проверить diff на случайные debug-логи и закомментированный код.

## 7.4. CI и гейты качества

CI (`.github/workflows/ci.yml`) на каждый push и pull request гоняет три параллельных job:

- `lint-test-build`: **lint → code health → SQL security lint → typecheck → edge-функции → i18n-каталоги → test → backup-service tests → build**. Code health — храповик §7.5 п.4. SQL security lint (`infra/scripts/lint-security-definer.sh`) падает на `SECURITY DEFINER` без `REVOKE ALL ... FROM public, anon` (§4.1 п.5); «i18n catalogs up to date» — если `npm run lingui:extract` даёт дифф в `src/locales` (§4.2).
- `integration-tests`: поднимает Supabase-Postgres, прогоняет Liquibase-миграции (`infra/scripts/ci-test-db.sh`) и `npm run test:integration` (каталог `tests/`: RLS, RPC, cron). Локально при изменениях в RPC/RLS/cron — той же схемой: `bash infra/scripts/ci-test-db.sh`, затем `npm run test:integration`.
- `e2e`: браузерные тесты на Playwright (каталог `e2e/`, `npm run test:e2e`) — собирает приложение с заглушками Supabase, отдаёт `dist/` через `vite preview` и гоняет `/demo` в Chromium: перетаскивание мышью на таймлайне (десктоп) и жесты касанием (телефон, через протокол DevTools — с `touch-action`, нативной прокруткой и `pointercancel`). Совместную работу двух клиентов не покрывает: в `/demo` нет Realtime. Агент локально стенд не поднимает (§5.1), поэтому гоняет набор против тестового стенда: `E2E_BASE_URL=https://test.motio.nikog.net E2E_BROWSER_CHANNEL=chrome npm run test:e2e` (свежий код — после `make deploy-testing`). Меняя перетаскивание, жесты или задачу из сида, которую берут тесты, — запускать; новый тест сначала заставить упасть, сломав поведение нарочно. Подробно — `e2e/README.md`.

Отдельный workflow `Image scan` (`.github/workflows/image-scan.yml`, по понедельникам, вручную и при смене образов) прогоняет `infra/scripts/scan-images.sh`: Trivy по всем образам Motio, HIGH/CRITICAL с готовым исправлением, таблица на странице прогона. Никогда не красный; по расписанию работает только с `main`. Обновление образа — по шагам `docs/operations.md`, «Upgrading a bundled image».

Отдельный workflow `Self-hosted upgrade` (`.github/workflows/selfhost-upgrade.yml`, по воскресеньям, вручную и при изменениях установщика, переноса на PostgreSQL 17, ensure-скриптов Keycloak и compose-файлов) прогоняет `infra/scripts/selfhost-upgrade-test.sh`. Это настоящий `install.sh`: установка v0.10.61 (Realtime на 0.1 CPU), v0.10.65 и последнего тега → данные → `update` на проверяемый коммит → `rollback` → снова `update` → `backup`/`restore`, после каждого шага сверка данных, файла, входа и Realtime. 20–40 мин на версию, не CI и не гейт; красный — разбирать (шаг и логи — на странице прогона). По расписанию работает только с `main`. Тот же скрипт можно запускать на тест-сервере в своём каталоге (`docs/operations.md`, «Self-hosted upgrade test»).

Отдельный workflow `Docs site` (`.github/workflows/docs-site.yml`) собирает сайт документации при изменениях в `docs/guides/`, `docs/self-hosting/` и `docs-site/` (красный — битая ссылка или сломанный конфиг) и с `main` публикует его на GitHub Pages. Свой `package.json` и lock в `docs-site/`, к зависимостям приложения не относится.

CI **не является гейтом мержа и деплоя**: `main` не защищена, прод собирается из рабочего дерева по rsync — красный пайплайн технически не мешает релизу. За зелёным CI следит агент (§5.4).

1. `vite build` НЕ проверяет типы (esbuild) — это делает `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`, затем `tsc -p e2e/tsconfig.json --noEmit` для браузерных тестов и `playwright.config.ts`; Playwright сам типы тоже не проверяет).
2. `tsconfig.app.json` и `infra/supabase/deno.check.json` — полный `strict` (с 2026-11-03): неявный `any`, непроверенный `null` и несовместимые колбэки валят typecheck. Модули без типов (как скомпилированные каталоги Lingui) описывать в `src/vite-env.d.ts`, а не ослаблять конфиг.
3. Результаты Supabase-запросов со строковым `select` кастовать как `... as unknown as <Row>` (Supabase не выводит тип такого select — принятый паттерн границы).
4. Edge Functions (`infra/supabase/functions`) в `tsconfig.app.json` не входят — их проверяет шаг «Edge Functions typecheck»: `infra/scripts/check-edge-functions.sh`, Deno 2.1.4 (как в `supabase/edge-runtime:v1.77.4`), строгость как у фронта — полный `strict` (`infra/supabase/deno.check.json`). Любая ошибка типов валит шаг. Строки Supabase без сгенерированных типов кастовать через `as unknown as <Row>` (п. 3), результаты вида «ошибка или успех» — явным типом, а не `return {}` (см. `WriteOutcome` в `_shared/supabaseAuth.ts`). Локально без Deno: `docker run --rm -v "$PWD:/repo:ro" -w /repo denoland/deno:2.1.4 bash infra/scripts/check-edge-functions.sh`.
5. Тесты backup-service (`infra/backup-service/*.test.js`) — отдельный набор на `node:test` вне vitest (`npm run test:backup`). Новые тесты сервиса класть рядом с кодом, без внешних зависимостей (CI не ставит `node_modules` сервиса).
6. Юнит-набор (`vitest.config.ts`) идёт на `pool: 'threads'` с `testTimeout` 15 с: ~1700 тестов за ~45 с. На `forks` тот же набор шёл 20+ минут с ложными падениями по таймауту — не возвращать. `isolate: false` не включать: тесты полагаются на чистые модули.
7. «Unhandled Errors» в выводе vitest при всех passed — красный прогон (код выхода 1, CI падает): смотреть код выхода, а не только счётчик тестов. Прогон, который висит, а не падает по таймауту, — часто бесконечный цикл рендера в одном файле: мок стора отдаёт новую функцию на каждый вызов селектора (`selector({ action: vi.fn() })`), и эффект с ней в зависимостях перезапускается без конца. Мок стора — один объект состояния через `vi.hoisted`.

## 7.5. Чтобы мусор не копился

1. **Флаг фичи живёт, пока фича раскатывается.** Включён на проде, на тесте и по умолчанию у self-host — убрать флаг вместе с кодом ветки «выключено» и тестами на неё: `featureFlags.ts`, `infra/web/Dockerfile`, compose-файлы, `.env.example`, `install.sh`, `docs/configuration.md` и `docs/self-hosting/settings.md`. Значения флагов на проде и тесте — `grep '^VITE_FEATURE' .env` на сервере (§9.0 п.1).
2. **Временный код совместимости** (для вкладок со старой сборкой, переходных путей и т. п.) помечать комментарием `REMOVE-AFTER: ГГГГ-ММ-ДД — что убрать и почему`. Просроченную дату `npm run check:health` показывает предупреждением — тогда код убрать.
3. **Удаляя код, удалять и тесты, которые проверяют только его.** Функция, которую вызывают одни тесты, — мёртвая: тест держит её на плаву.
4. **Храповик `npm run check:health`** (`infra/scripts/check-code-health.mjs`, шаг CI «Code health ratchet») следит за `src/`: неиспользуемые файлы, экспорты и зависимости, экспорты только для тестов, файлы длиннее 600 строк, прямой Supabase в фичах вне `store/`, импорт `features/A` → `features/B/components`. Старое записано в `infra/scripts/code-health-baseline.json`, новое валит CI. Починил старое — обновить базу тем же коммитом (`node infra/scripts/check-code-health.mjs --write-baseline`). Добавлять в базу новое — только осознанно и с объяснением в сообщении коммита.
   Файлов длиннее 600 строк в базе нет (с 2026-11-03): такой файл сразу валит CI. Растущий файл резать заранее — связную логику в хук `use…` рядом (`hooks/`), куски разметки — в компоненты фичи, чистые расчёты — в `lib/` или `shared/domain`. Поведение при этом не меняется: эффекты идут в прежнем порядке, в зависимости добавляются только стабильные сеттеры, на горячем пути (`TaskBar`, строки таймлайна) не появляется новых обёрток и подписок. Такой рефакторинг проверять сверкой `/demo` теста с `/demo` прода одними сценариями; изменения поведения, которые уже лежат на тесте, разбирать отдельно.
   Линт держится так же: `npm run lint` падает, если предупреждений больше `--max-warnings` в `package.json`. Оставшиеся — зависимости хуков, которые нельзя дописывать вслепую (нестабильный сеттер в зависимостях эффекта меняет поведение), и экспорт не-компонентов (варианты shadcn, контексты). Убрал предупреждение — понизь число тем же коммитом.
   Доступность разметки (`eslint-plugin-jsx-a11y`, все `src/**/*.tsx`, кроме тестов) — ошибки, не предупреждения. Нарушения, которые были до правила, записаны по файлам в `eslint-suppressions.json`; новое валит линт. Починил старое — `npx eslint . --prune-suppressions` тем же коммитом (иначе линт упадёт на лишней записи). Добавлять записи в файл — только осознанно, как в базу храповика.
5. После влития ветки удалить её worktree и локальную ветку; кадры, трейсы и профили браузера — во временную папку, не в `notes/` (§2).
6. В разрешения агента (`.claude/settings.local.json`) не сохранять команды с паролями и токенами.

## 8. Definition of Done

Изменение считается завершенным, если:

1. Соблюдены слоевые границы.
2. Нет дублирования ключевой бизнес-логики.
3. Ошибки обрабатываются предсказуемо.
4. Пройдены lint, typecheck и test.
5. Обновлены notes/spec при изменении пользовательского поведения (и `docs/`, если менялись операционные процессы).

## 9. Правила инфраструктуры

### 9.0. Известные грабли (сверяться до диагностики)

Рецепты — в `docs/troubleshooting.md`; здесь то, что регулярно сбивает с толку.

1. **Флаги фич живут в серверных `.env`, из репозитория их не видно.** `VITE_FEATURE_*` читаются при сборке `web` на сервере. Прежде чем считать фичу выключенной, проверить `grep '^VITE_FEATURE' /opt/new_toggl/.env` на нужном контуре. Тихий флип флага = правка серверного `.env` + пересборка `web`, без релиза.
2. **Applied ≠ live.** `EXECUTED` в `databasechangelog` не доказывает, что объект миграции есть в живой БД (триггер из 0008 однажды пропал на тесте). При странностях проверять `pg_catalog`, миграции писать идемпотентными и самодостаточными.
3. **Гранты новых таблиц** — §4.1 п.4 (иначе `42501`).
4. **`TLS handshake timeout` при сборке `web`** — anycast `public.ecr.aws` не маршрутизируется с сервера; повторный деплой не лечит, сначала `docker pull` базовых образов на сервере в цикле.
5. **Edge Functions и внешние зависимости** — `edge-runtime` тянет зависимости функций при холодном старте. Раньше это был `esm.sh`, чей anycast прод не маршрутизировал (пересоздание контейнера давало `502` на всех `/functions/v1/*`, лечилось пином `extra_hosts`). С Deno 2 (edge-runtime 1.77, 2026-11-04) функции импортируют пакеты как `npm:` из реестра npm, пин снят; кэш — постоянный том `motio_deno_cache`. Новые зависимости — только `npm:` (или `jsr:`), не `esm.sh`; при `502` после пересоздания сначала проверить доступность реестра с сервера и этот том.
6. **`KEYCLOAK_ADMIN_PASSWORD` не менять через `.env`** — рассинхрон с realm даёт `401` на деплое. Пароль admin меняется в Keycloak, `.env` подгоняется следом.
7. **Мёрж в `main` может зависнуть** — §5.4 п.5.
8. **Тома в `docker-compose.prod.yml` с фиксированными именами** (`supabase_db_data_pg17` external — PostgreSQL 17; `supabase_db_data` — прежняя PostgreSQL 15, откат, не удалять без владельца; `keycloak_db_data`, `supabase_storage_data`, `motio_deno_cache`). Вторая копия стека на той же машине без оверлея с переименованием подключится к чужой базе. Self-host оверлей переименовывает (§5.6).
9. **Конфиги gateway и Caddy смонтированы одним файлом.** rsync заменяет файл новым инодом — работающий контейнер видит старый, `reload` его не подхватит. Деплой прода и теста сравнивает хеш и пересоздаёт контейнер, `install.sh` пересоздаёт gateway и caddy в конце. Руками — `up -d --force-recreate --no-deps gateway`.
10. **GoTrue не стартует с пустым `GOTRUE_SMTP_PORT`** (даже без почты) — падает `auth`, за ним `gateway` (не резолвит `auth`), а миграции падают на `auth.identities`. Порт всегда числом.
11. **Realm с `verifyEmail` без SMTP** — регистрация застревает на «подтвердите почту». На self-host это переключает `keycloak-ensure-realm-smtp.sh`; на проде/тесте почта realm настроена руками.
12. **Realtime доставляет изменение, только если получатель может прочитать НОВУЮ строку.** Мягкое удаление под политикой `deleted_at is null` не доходит ни до кого — поэтому удалённые комментарии читаемы участникам, а текст стирает триггер (0161). Новая таблица в realtime: проверить, что её «удалённое» состояние видно тем, кому нужен сигнал; для `DELETE` с фильтром нужна `replica identity full` (0131, 0158).
13. **`realtime.messages` создаёт сам Realtime при первом подключении клиента.** Политики закрытых каналов (0159) на свежей установке пропускаются; `install.sh` повторяет тот же идемпотентный файл после миграций при каждом `up` и `update`. Новый закрытый канал — тема в формате, который разбирают его политики; имя канала на клиенте = тема, его не уникализировать.
14. **`motio-caddy` на проде и тесте живёт вне compose** (`docker run` руками, тома `caddy_data`/`caddy_config` с сертификатами). Смена образа Caddy в репозитории (`docker-compose.selfhost.yml`) доходит только до чужих установок; на проде и тесте контейнер пересоздаётся отдельно командой из `docs/operations.md` (сначала `docker rename` старого — для отката), на проде — только в рамках релиза с согласия владельца.
15. **Обновление Keycloak необратимо и меняет поведение.** Новый Keycloak при старте перестраивает свою базу — откатиться можно только из дампа: `prod-compose.sh` снимает его ДО старта нового Keycloak (с 2026-11-04). С 26.7 регистрация при включённом подтверждении почты перестаёт спрашивать пароль — прежнее поведение держит `keycloak-ensure-realm-register-password.sh` (`KEYCLOAK_REALM_REGISTER_PASSWORD_ON_FORM=true`, на старом Keycloak пропускает); письма `execute-actions-email` стали одноразовыми, изменилась раскладка страницы входа и блока внешних провайдеров (кнопка Google на проде). Тема входа держится без своего `template.ftl` (иконки — в `theme.properties`), чтобы работать и на общем Keycloak 26.1 теста. Новую версию Keycloak — отдельным релизом после репетиции на копии базы (регистрация, вход, сброс, приглашение, Google). Разбор — `notes/research/keycloak-26-8-upgrade-2026-11-04.md`.
16. **На проде вход только по почте и паролю: Google выключен** (решение владельца 2026-11-04). Делает `keycloak-ensure-identity-providers-disabled.sh` при каждом деплое: `prod-compose.sh` подставляет `KEYCLOAK_DISABLED_IDENTITY_PROVIDERS=google`, если в `.env` прода не задано иное (`none` — оставить всех); realm `timeline` и `master`, `enabled=false` — настройки и привязки учёток сохранены. На тесте и у чужих установок список пуст. Не включать Google кликом в админке: следующий деплой выключит его снова.
17. **Сервисы Supabase переводят свои схемы при старте** (GoTrue, Storage, Realtime; миграции Storage с 1.81 односторонние), а `pre-migrate-*.dump` снимается уже после их старта. Поэтому `prod-compose.sh` до `up -d` запускает `prod-snapshot.sh`: физический снимок базы (`pg_basebackup`, без простоя) + том файлов с xattrs + список образов в `infra/backups/snapshots/<время>/` (700, хранятся 5). Откат обновления сервиса — только из снимка (`docs/operations.md`, «Roll back a service upgrade»). Обновление стека Supabase — этапами, каждый с репетицией на копии данных прода на самом сервере прода (данные не выносить), план — `notes/research/supabase-stack-upgrade-2026-11-04.md`.
18. **PostgreSQL 17 (с 0.10.66).** Переезд с 15 делает `infra/scripts/pg-upgrade-17.sh` сам при первом деплое (prod-compose, test-compose, install.sh) — логической копией в новый том `<старый>_pg17` со сверкой структуры и контрольных сумм всех таблиц; старый том не трогается (откат = прошлый релиз). Грабли, которые он закрывает и которые нельзя ломать: образ 17 по умолчанию даёт `anon`… права на новые объекты в `public` — без их сброса до восстановления вернулся бы `EXECUTE` анониму на наши функции; `pg_dump -n public` не переносит состав публикации realtime; у `postgres` в образе 17 отняты права на `auth`/`storage` — их возвращает `infra/supabase/db/motio-init.sql` (GoTrue и storage-api ходят как `postgres`); сортировка текста — `builtin C.UTF-8`, как была (ICU `en-US` по умолчанию меняет порядок); в образе 17 busybox `tar` без xattrs — тома копировать образом `debian:12-slim`; backup-service — клиент 17 из apt PostgreSQL.

### 9.1. Docker Compose — перезапуск контейнеров

1. **Никогда не перезапускать upstream-сервисы (`rest`, `auth`, `realtime`, `backup`) без перезапуска `gateway`**: nginx резолвит их IP только при старте, после пересоздания (`--no-deps`) он шлёт запросы на старые IP (`111: Connection refused`). Правило: `docker compose ... restart rest auth realtime backup && docker compose ... restart gateway`. Предпочтительный путь — `make deploy-remote` / `prod-compose.sh`, они поднимают весь стек сразу.
2. После ручного `docker compose up -d --no-deps <service>` всегда проверять лог gateway на `connect() failed`.

### 9.2. Сетевая безопасность Docker

1. **Порты внутренних сервисов биндить только на `127.0.0.1`** (`"127.0.0.1:5432:5432"`), никогда на `0.0.0.0` (`"5432:5432"` открывает порт в интернет).
2. Публично доступны только 80 и 443 (через Caddy/reverse proxy).
3. Перед деплоем проверять `docker compose config | grep -A2 'ports:'` на `0.0.0.0`-биндинги.

### 9.3. PostgreSQL в Supabase-стеке

1. **Суперпользователь — `supabase_admin`, не `postgres`**: у `postgres` `rolsuper=f`, `rolreplication=t`, и его пароль меняет только `supabase_admin` — `docker exec -u postgres infra-db-1 psql -d postgres -U supabase_admin -c "ALTER ROLE postgres WITH PASSWORD '...'; ALTER ROLE supabase_admin WITH PASSWORD '...';"`.
2. После смены пароля в БД обязательно обновить `.env` на сервере и перезапустить `rest`, `auth`, `realtime`, `backup`, `gateway`.

### 9.4. Управление секретами

1. `.env` **не хранится в git** и **не копируется** деплоем (rsync `--exclude '.env'`). Локальный `.env` — только для local dev; серверный (`/opt/new_toggl/.env`) управляется вручную через SSH.
2. Никогда не использовать дефолтные пароли (`postgres`, `admin`, `secret`) в production.
3. При любом инциденте безопасности: сначала сменить пароли в БД → обновить `.env` на сервере → перезапустить контейнеры → только потом анализировать логи.

### 9.5. Признаки атаки на PostgreSQL

Массовые `FATAL: password authentication failed for user "postgres"` в `docker logs infra-db-1` за короткий период — брутфорс (дальше обычно `COPY FROM PROGRAM`). Что проверить — `docs/troubleshooting.md`, «Many `password authentication failed for user "postgres"` in the db log». Ответные меры: сначала пароли по §9.4 п.3, затем удалить подброшенные файлы из `/tmp`, заблокировать IP-источники в UFW (на тест-сервере UFW общий с ids-checker — только по согласованию с владельцем, §5.4.1.1) и убедиться, что порт БД забинден на `127.0.0.1` (§9.2 п.1).
