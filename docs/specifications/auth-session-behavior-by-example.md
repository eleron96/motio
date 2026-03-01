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

## Scenario 3: OAuth2 logout always returns to public root

Given:
- включён oauth2-proxy logout flow;
- пользователь нажимает `Sign out` в приложении.

When:
- формируется URL выхода для `/oauth2/sign_out`.

Then:
- параметр `rd` всегда принудительно равен `/`;
- пользователь возвращается на публичный лендинг, а не в приватный `/app`.

Покрытие:
- `src/features/auth/store/authStore.ts`

## Scenario 4: Protected routes do not trigger auto-login during sign-out redirect

Given:
- пользователь выходит из приватного `/app` маршрута.

When:
- локальная сессия очищается и запускается redirect на `/oauth2/sign_out`.

Then:
- `ProtectedRoute` не перенаправляет пользователя на `/auth?redirect=/app` в этот момент;
- автоматический OAuth вход не стартует до завершения redirect на публичный `/`.

Покрытие:
- `src/features/auth/store/authStore.ts`
- `src/app/ProtectedRoute.tsx`

## Scenario 5: Sign out remains stable and requires explicit re-login

Given:
- пользователь авторизован через Keycloak SSO и oauth2-proxy.

When:
- пользователь нажимает `Sign out`.

Then:
- приложение выполняет logout через `/oauth2/sign_out` и возвращает пользователя на `/`;
- при переходе на `/auth?redirect=/app` страница сразу запускает OAuth-редирект и переводит пользователя на страницу логина Keycloak;
- при следующем переходе в `/app` oauth2-proxy запрашивает новый логин (`prompt=login`);
- logout не падает в Keycloak error-page, если IdP-сессия уже отсутствует.

Покрытие:
- `src/features/auth/store/authStore.ts`
- `src/features/auth/pages/AuthPage.tsx`
