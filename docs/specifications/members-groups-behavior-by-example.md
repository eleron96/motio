# Members groups behavior by example

## Scenario 1: Add-member popover hides disabled people by default

Given:
- пользователь с правами `admin` открыт на `/app/members` в режиме `Groups`;
- в workspace есть активные и отключенные участники;
- часть участников уже состоит в выбранной группе.

When:
- пользователь открывает popover `Add member`;
- список кандидатов загружается при выключенном контроле показа disabled-участников.

Then:
- в списке отображаются только участники, которых ещё нет в группе;
- отключенные участники скрыты по умолчанию;
- рядом с поиском есть отдельная иконка-переключатель для показа отключенных участников;
- после включения переключателя отключенные участники появляются в списке и помечаются бейджем `Disabled`.

## Scenario 2: Add-member popover shows readable empty states

Given:
- пользователь открыт в выбранной группе;
- popover `Add member` открыт.

When:
- поиск не находит активных участников;
- либо поиск не находит вообще никого.

Then:
- UI показывает человекочитаемое сообщение, а не hash/id перевода;
- если совпадения есть только среди отключенных участников, UI подсказывает включить показ disabled-участников;
- если совпадений нет совсем, UI показывает нейтральное сообщение о пустом результате.

Покрытие:
- `src/features/members/pages/MembersPage.tsx`
- `src/features/members/lib/memberSelectors.ts`
- `src/test/members/memberSelectors.test.ts`
- `src/test/members/membersPage.groupAddMembers.test.tsx`
