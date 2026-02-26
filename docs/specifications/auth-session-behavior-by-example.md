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
