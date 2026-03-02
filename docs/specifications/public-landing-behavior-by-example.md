# Public Landing Behavior By Example

Спецификация фиксирует поведение публичной SEO-зоны и разделение с приватным приложением.

## Scenario 1: Public landing is available on root path

Given:
- пользователь открывает корневой URL приложения;
- пользователь не авторизован.

When:
- выполняется переход на `/`.

Then:
- отображается публичный лендинг с описанием продукта;
- пользователь видит кнопку `Sign in` в правом верхнем углу и может перейти к входу;
- страница допускает индексацию (`index, follow`).

Покрытие:
- `src/features/marketing/pages/LandingPage.tsx`
- `src/shared/lib/seo/usePageSeo.ts`

## Scenario 2: Private application routes are served under /app

Given:
- пользователь работает с приватной частью приложения.

When:
- открываются рабочие маршруты.

Then:
- таймлайн доступен на `/app`;
- дополнительные разделы доступны на `/app/dashboard`, `/app/projects`, `/app/members`;
- старые маршруты `/dashboard`, `/projects`, `/members` перенаправляют на новые `/app/*`.

Покрытие:
- `src/app/App.tsx`
- `src/features/workspace/components/WorkspaceNav.tsx`

## Scenario 3: Crawlers receive indexable SEO files without auth redirect

Given:
- поисковый бот запрашивает технические SEO-ресурсы.

When:
- запрашиваются `/robots.txt`, `/sitemap.xml` и публичный `/`.

Then:
- ответы доступны без forced login redirect;
- `robots.txt` разрешает индексировать публичную страницу и закрывает приватные `/app`, `/auth`, `/invite`.

Покрытие:
- `public/robots.txt`
- `public/sitemap.xml`
- `infra/caddy/Caddyfile`

## Scenario 4: Landing copy is English-first with video placeholder

Given:
- пользователь открывает публичную страницу `/`.

When:
- страница загружена без авторизации.

Then:
- основной контент лендинга отображается на английском языке по умолчанию;
- на странице есть отдельный блок под видео-обзор продукта (placeholder).

Покрытие:
- `src/features/marketing/pages/LandingPage.tsx`

## Scenario 5: Landing header reflects authenticated state

Given:
- пользователь открывает `/`;
- в приложении есть активная пользовательская сессия.

When:
- лендинг рендерится.

Then:
- в правой части хедера отображается email пользователя и кнопка `Sign out`;
- в хедере отображается отдельная кнопка `Go to timeline` с переходом в `/app`;
- кнопка `Sign in` не отображается до выхода пользователя.

Покрытие:
- `src/features/marketing/pages/LandingPage.tsx`

## Scenario 6: Private sections set route-specific page title

Given:
- пользователь авторизован и работает в приватной части приложения.

When:
- пользователь открывает маршруты `/app`, `/app/dashboard`, `/app/projects`, `/app/members`, `/app/admin/users`.

Then:
- заголовок вкладки соответствует текущему разделу, а не остаётся от `/auth`;
- приватные страницы помечены как `noindex, nofollow`.

Покрытие:
- `src/features/planner/pages/PlannerPage.tsx`
- `src/features/dashboard/pages/DashboardPage.tsx`
- `src/features/projects/pages/ProjectsPage.tsx`
- `src/features/members/pages/MembersPage.tsx`
- `src/features/admin/pages/AdminUsersPage.tsx`

## Scenario 7: Canonical host and transport compatibility are enforced at edge

Given:
- пользователь открывает сайт через `www.motio.nikog.net` или через нестабильную сеть.

When:
- запрос попадает на edge proxy (Caddy).

Then:
- `www.motio.nikog.net` перенаправляется на канонический `https://motio.nikog.net{uri}` c `308`;
- edge использует совместимый транспортный режим `h1` (без `h2/h3`);
- контент кодируется `gzip` без `zstd` для снижения проблем совместимости на части сетей.

Покрытие:
- `infra/caddy/Caddyfile`
