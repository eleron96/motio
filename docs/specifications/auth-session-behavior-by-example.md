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

## Scenario 3: OAuth2 logout chains through Keycloak end-session via oauth2-proxy backend logout

Given:
- включён oauth2-proxy logout flow;
- пользователь нажимает `Sign out` в приложении.

When:
- формируется URL выхода для `/oauth2/sign_out`.

Then:
- `oauth2-proxy` вызывает Keycloak end-session endpoint через `OAUTH2_PROXY_BACKEND_LOGOUT_URL`;
- в backend logout URL передаётся `id_token_hint={id_token}` для RP-initiated logout без подтверждающей страницы;
- browser redirect (`rd`) после `/oauth2/sign_out` всегда ведёт на `/` (public landing) для post-logout UX без автологина.

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
- после завершения logout-chain пользователь попадает на `/`, где не запускается OAuth flow.

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
- приложение выполняет logout через `/oauth2/sign_out` -> oauth2-proxy backend logout -> Keycloak end-session -> `/`;
- пользователь не попадает обратно в `/app` автоматически через оставшуюся IdP-сессию;
- на `/` пользователь остаётся в logged-out состоянии до явной попытки входа;
- logout не падает в Keycloak error-page, если IdP-сессия уже отсутствует.

Покрытие:
- `src/features/auth/store/authStore.ts`
- `src/features/auth/pages/AuthPage.tsx`

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
- при cross-tab `signed-out` событии во второй вкладке ставится recent sign-out marker, чтобы следующий login flow использовал `prompt=login`;
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
- пользователь снова инициирует вход на `/auth` или через переход на приватный маршрут.

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

## Scenario 9: Header account shortcut shows initials instead of generic user icon

Given:
- пользователь открыт в приватном разделе (`Timeline`, `Dashboard`, `Projects`, `Members`);
- профиль загружен, и доступно имя или email пользователя.

When:
- рендерится кнопка открытия `Account settings` в правом верхнем углу.

Then:
- вместо иконки пользователя отображается круглый бейдж с инициалами;
- вычисление инициалов совпадает с логикой в `Account settings`;
- если имя/email недоступны, отображается fallback `U`.

Покрытие:
- `src/features/auth/components/AccountBadgeButton.tsx`
- `src/features/auth/components/AccountSettingsDialog.tsx`
- `src/shared/lib/accountIdentity.ts`
