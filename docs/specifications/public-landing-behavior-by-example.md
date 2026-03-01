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
