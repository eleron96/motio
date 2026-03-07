# Private Navigation Mobile Behavior By Example

Спецификация фиксирует базовую мобильную навигацию приватного приложения без изменения desktop-потока.

## Scenario 1: Mobile header opens workspace navigation drawer

Given:
- пользователь авторизован;
- открыт приватный маршрут `/app` или `/app/*`;
- ширина экрана меньше `768px`.

When:
- пользователь нажимает на кнопку открытия меню в header.

Then:
- открывается мобильный drawer с навигацией по разделам;
- в drawer доступны workspace switcher и базовые инструменты аккаунта;
- текущее desktop-меню не рендерится как основной navigation layout.

Покрытие:
- `src/features/workspace/components/WorkspacePageHeader.tsx`
- `src/features/workspace/components/WorkspaceMobileMenu.tsx`
- `src/test/workspace/workspacePageHeader.mobileMenu.test.tsx`

## Scenario 2: Mobile drawer closes after section navigation

Given:
- пользователь работает в мобильном drawer приватной части приложения;
- drawer открыт.

When:
- пользователь выбирает раздел `Timeline`, `Dashboard`, `Projects` или `Members`.

Then:
- приложение переходит на выбранный маршрут `/app*`;
- drawer закрывается после перехода;
- пользователь видит заголовок текущего раздела в мобильном header.

Покрытие:
- `src/features/workspace/components/WorkspaceMobileMenu.tsx`
- `src/features/workspace/components/WorkspaceNav.tsx`
- `src/test/workspace/workspacePageHeader.mobileMenu.test.tsx`

## Scenario 3: Desktop header remains unchanged

Given:
- пользователь работает в приватной части приложения;
- ширина экрана `768px` и больше.

When:
- рендерится header рабочего экрана.

Then:
- отображаются текущие desktop-компоненты `WorkspaceSwitcher`, `WorkspaceNav`, `InviteNotifications`, `AccountBadgeButton`;
- кнопка мобильного burger-меню не отображается;
- существующий desktop flow не меняется.

Покрытие:
- `src/features/workspace/components/WorkspacePageHeader.tsx`
- `src/test/workspace/workspacePageHeader.mobileMenu.test.tsx`
