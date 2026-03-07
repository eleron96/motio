# Workspace Settings Behavior By Example

Спецификация фиксирует ожидаемое поведение диалога настроек рабочего пространства.

## Scenario 1: Workspace settings top-level tabs use the shared segmented style

Given:
- пользователь открывает диалог `Workspace settings`;
- в диалоге доступны верхние вкладки `General` и `Workflow`.

When:
- диалог рендерится;
- пользователь переключается между `General` и `Workflow`.

Then:
- верхние вкладки используют тот же segmented tabs pattern, что и в других внутренних разделах проекта;
- одновременно визуально выделена только одна активная вкладка;
- переключение вкладок меняет активный контент без отдельного локального tab-style.

Покрытие:
- `src/features/workspace/components/SettingsPanel.tsx`
- `src/test/workspace/settingsPanel.tabs.test.tsx`
