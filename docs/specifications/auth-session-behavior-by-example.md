# Auth Session Behavior By Example

Спецификация фиксирует ожидаемое поведение авторизации и длительности пользовательской сессии.

## Scenario 1: Silent SSO login does not force credential prompt

Given:
- пользователь уже имеет активную SSO-сессию Keycloak;
- приложение открывает `/auth` и запускает авто-редирект на OAuth.

When:
- выполняется `signInWithKeycloak` для стандартного входа.

Then:
- OAuth-запрос не форсирует `prompt=login`;
- при активной SSO-сессии вход завершается без повторного ручного ввода логина/пароля.

Покрытие:
- `src/features/auth/store/authStore.ts`
- `src/features/auth/pages/AuthPage.tsx`

## Scenario 2: Remember Me session policy is applied in Keycloak

Given:
- включен `rememberMe`;
- задана политика realm для сессий.

When:
- запускается production compose workflow.

Then:
- `ssoSessionIdleTimeoutRememberMe` устанавливается в `86400` (1 day);
- `ssoSessionMaxLifespanRememberMe` устанавливается в `604800` (7 days);
- значения проверяются через Keycloak admin API после обновления.

Покрытие:
- `infra/scripts/keycloak-ensure-realm-session-policy.sh`
- `infra/scripts/prod-compose.sh`
- `infra/keycloak/realm/timeline-realm.prod.json`

## Scenario 3: OAuth2 logout chains through Keycloak end-session

Given:
- включён oauth2-proxy logout flow;
- пользователь нажимает `Sign out` в приложении.

When:
- формируется URL выхода для `/oauth2/sign_out`.

Then:
- параметр `rd` указывает на Keycloak end-session endpoint (`/protocol/openid-connect/logout`);
- в end-session URL передаются `client_id` и `post_logout_redirect_uri`;
- `post_logout_redirect_uri` всегда ведёт на `/auth?silent=1` для контролируемого post-logout UX;
- если Keycloak logout URL не может быть собран (неполный runtime config), fallback `rd` = `/auth?silent=1`.

Покрытие:
- `src/features/auth/store/authStore.ts`

## Scenario 4: Protected routes do not trigger auto-login during sign-out redirect

Given:
- пользователь выходит из приватного `/app` маршрута.

When:
- локальная сессия очищается и запускается redirect на `/oauth2/sign_out`.

Then:
- `ProtectedRoute` не перенаправляет пользователя на `/auth?redirect=/app` в этот момент;
- автоматический OAuth вход не стартует до завершения logout-chain;
- при попадании на `/auth?silent=1` страница не запускает auto OAuth и сохраняет ручной re-login.

Покрытие:
- `src/features/auth/store/authStore.ts`
- `src/app/ProtectedRoute.tsx`
- `src/features/auth/pages/AuthPage.tsx`

## Scenario 5: Sign out remains stable and requires explicit re-login

Given:
- пользователь авторизован через Keycloak SSO и oauth2-proxy.

When:
- пользователь нажимает `Sign out`.

Then:
- приложение выполняет logout через `/oauth2/sign_out` -> Keycloak end-session -> `/auth?silent=1`;
- если Keycloak показывает `logout-confirm`, подтверждение отправляется автоматически без ручного клика;
- пользователь не попадает обратно в `/app` автоматически через оставшуюся IdP-сессию;
- страница `/auth?silent=1` показывает кнопку входа и ждёт явного действия пользователя;
- logout не падает в Keycloak error-page, если IdP-сессия уже отсутствует.

Покрытие:
- `src/features/auth/store/authStore.ts`
- `src/features/auth/pages/AuthPage.tsx`
- `infra/keycloak/themes/timeline/login/resources/js/login.v4.js`

## Scenario 6: Session state is synchronized across browser tabs

Given:
- пользователь открывает две вкладки одного браузера на `motio.nikog.net`;
- хотя бы в одной вкладке меняется auth state (вход/выход).

When:
- во второй вкладке срабатывают browser events (`storage`, `focus`, `visibilitychange`, `online`);
- приложение выполняет reconcile текущей Supabase-сессии.

Then:
- вторая вкладка без ручного reload получает актуальный auth state;
- после logout в одной вкладке в другой вкладке не сохраняется stale authenticated UI;
- logout в любой вкладке не восстанавливает авторизацию из-за активной in-memory сессии в соседней вкладке;
- переход в `/app` не зависит от отдельной oauth2-proxy cookie, если локальная Supabase-сессия уже активна;
- синхронизация не зацикливается и не вызывает лишние постоянные refresh-запросы.

Покрытие:
- `src/features/auth/providers/AuthProvider.tsx`
- `src/features/auth/lib/authSessionSync.ts`

## Scenario 7: Stale OAuth callback params do not leave blank auth page

Given:
- пользователь оказался на `/auth?code=...&redirect=/app`;
- локальная сессия не восстановилась (например после logout в другой вкладке).

When:
- `AuthPage` фиксирует наличие callback `code`, но пользователь остаётся неавторизованным после grace-паузы.

Then:
- callback-параметры очищаются до безопасного `/auth?redirect=/app`;
- запускается обычный login flow и пользователь сразу попадает на страницу ввода логина Keycloak;
- страница `/auth?code=...` не зависает в пустом состоянии.

Покрытие:
- `src/features/auth/pages/AuthPage.tsx`
- `src/features/auth/lib/authRedirect.ts`

## Scenario 8: Recent sign-out forces prompt=login on the next auth attempt

Given:
- пользователь только что выполнил `Sign out`;
- в session storage установлен recent sign-out marker;
- открыта страница `/auth?silent=1`.

When:
- пользователь инициирует следующий auth attempt (auto flow или ручной `Continue with Keycloak`).

Then:
- `signInWithKeycloak` получает `forceLogin=true`;
- OAuth query params включают `prompt=login`;
- Keycloak показывает экран логина даже при существующей SSO-сессии.

Покрытие:
- `src/features/auth/store/authStore.ts`
- `src/features/auth/pages/AuthPage.tsx`
- `src/features/auth/lib/recentSignOut.ts`
