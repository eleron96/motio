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

## Scenario 10: Notifications dropdown can mark all task notifications as read

Given:
- пользователь открыл выпадающий список `Notifications`;
- в блоке `Task updates` есть непрочитанные уведомления.

When:
- пользователь нажимает bulk-действие `Mark as read` в заголовке блока `Task updates`.

Then:
- все непрочитанные task-уведомления пользователя помечаются как прочитанные одним запросом;
- счетчик непрочитанных в колокольчике обновляется без перезагрузки страницы;
- удаленные уведомления (`deleted_at`) не затрагиваются.

Покрытие:
- `src/features/auth/components/InviteNotifications.tsx`
- `src/features/auth/lib/notificationReadState.ts`
- `src/test/auth/notificationReadState.test.ts`
- `infra/supabase/functions/notifications/index.ts`

## Scenario 11: Expired OAuth callback state does not show raw JSON error page

Given:
- пользователь оставил вкладку открытой, и OAuth callback завершился с устаревшим `state`;
- backend `/auth/v1/callback` возвращает ошибку `bad_oauth_state`.

When:
- браузер открывает callback endpoint.

Then:
- пользователь не остаётся на сырой JSON-странице backend;
- gateway перенаправляет на `/auth` с безопасными error-параметрами;
- `AuthPage` показывает человекочитаемое сообщение и кнопку повторного входа.

Покрытие:
- `infra/supabase/nginx.conf`
- `src/features/auth/pages/AuthPage.tsx`
- `src/test/auth/authPage.forceLogin.test.tsx`

## Scenario 12: Keycloak login screens keep Motio styling and home exit action

Given:
- пользователь находится на Keycloak-экранах входа (`Sign in to your account`);
- пользователь может попасть в дополнительный шаг выбора метода (`Try Another Way` -> `Select login method`).

When:
- Keycloak рендерит страницу выбора метода входа и страницу логина.

Then:
- список методов (`Select login method`) рендерится в том же визуальном стиле Motio, без «сырых» дефолтных блоков;
- ссылка `Try Another Way` отображается как явное action-контрол;
- на экранах входа есть отдельная кнопка возврата на главную страницу;
- подпись `© Motio, NIKO G.` остается последним элементом внизу карточки, ниже кнопки возврата.

Покрытие:
- `infra/keycloak/themes/timeline/login/resources/css/styles.v7.css`
- `infra/keycloak/themes/timeline/login/footer.ftl`
- `infra/keycloak/themes/timeline/login/messages/messages_en.properties`
- `infra/keycloak/themes/timeline/login/messages/messages_ru.properties`

## Scenario 13: "Account already exists" linking screens follow Motio visual style

Given:
- пользователь входит через внешний IdP (например Google), а email уже существует в realm;
- Keycloak показывает сценарий link-account (`Account already exists`).

When:
- открываются экраны подтверждения/связывания (`login-idp-link-email`, `login-idp-link-confirm`, `login-idp-link-confirm-override`).

Then:
- экран использует карточки действий в стиле Motio вместо сырых дефолтных блоков;
- действия связывания визуально читаемы и единообразны, без сливающегося текста в кнопках;
- первый action явно подписан как возврат к другому способу входа;
- предупреждение `account already exists` отображается в той же карточной стилистике;
- общий футер с возвратом на главную остается доступен.

Покрытие:
- `infra/keycloak/themes/timeline/login/login-idp-link-email.ftl`
- `infra/keycloak/themes/timeline/login/login-idp-link-confirm.ftl`
- `infra/keycloak/themes/timeline/login/login-idp-link-confirm-override.ftl`
- `infra/keycloak/themes/timeline/login/resources/css/styles.v7.css`
- `infra/keycloak/themes/timeline/login/messages/messages_en.properties`
- `infra/keycloak/themes/timeline/login/messages/messages_ru.properties`
