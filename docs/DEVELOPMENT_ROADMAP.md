# MOTIO — План развития продукта

> Версия плана: 1.2 | Дата: 2026-04-03 | Текущая версия продукта: 0.3.69
> Автор: Основатель | На основе комплексного аудита (PM, UX, QA, Arch, DevOps, Marketing)

---

## СОДЕРЖАНИЕ

1. [Текущее состояние продукта](#1-текущее-состояние-продукта)
2. [Стратегическое видение](#2-стратегическое-видение)
3. [Дорожная карта по фазам](#3-дорожная-карта-по-фазам)
4. [Фаза 0 — Фундамент (2 недели)](#фаза-0--фундамент-критическая-инфраструктура)
5. [Фаза 1 — Retention (4 недели)](#фаза-1--retention-удержание-пользователей)
6. [Фаза 2 — Core Value (6 недель)](#фаза-2--core-value-усиление-ядра-продукта)
7. [Фаза 3 — Growth (6 недель)](#фаза-3--growth-рост-и-привлечение)
8. [Фаза 4 — Scale (8 недель)](#фаза-4--scale-масштабирование)
9. [Фаза 5 — Monetization (4 недели)](#фаза-5--monetization-монетизация)
10. [Матрица приоритетов](#4-матрица-приоритетов-impact--effort)
11. [Метрики успеха](#5-метрики-успеха-по-фазам)
12. [Зависимости между задачами](#6-граф-зависимостей)
13. [Риски и митигация](#7-риски-и-митигация)
14. [Чеклист перед каждой фазой](#8-чеклист-перед-каждой-фазой)

---

## 1. ТЕКУЩЕЕ СОСТОЯНИЕ ПРОДУКТА

### Что уже есть (активы)

```
FRONTEND (304 файла, ~43K строк)
+------------------------------------------+
|  Timeline Planner     [###########] 90%  |  <- ядро, хорошо отполировано
|  Dashboard            [####------] 40%   |  <- базовые виджеты, нет шаблонов
|  Projects/Milestones  [########--] 80%   |  <- работает, есть Customer entity
|  Team/Groups          [########--] 80%   |  <- роли, инвайты, группы
|  Daily Brief          [######----] 60%   |  <- уникальная фича, но скрытая
|  Admin Console        [#######---] 70%   |  <- users, workspaces, backup
|  Auth/SSO             [##########] 95%   |  <- Keycloak, полноценный flow
|  Mobile Adaptation    [####------] 40%   |  <- Projects/Team ok, Timeline нет
|  i18n (RU/EN)         [##########] 95%   |  <- lingui, полное покрытие
|  Landing Page         [######----] 60%   |  <- есть, но generic
+------------------------------------------+

BACKEND / INFRA
+------------------------------------------+
|  Supabase + Postgres  [##########] 95%   |
|  Edge Functions       [########--] 80%   |
|  Keycloak SSO         [##########] 95%   |
|  Docker Compose       [##########] 95%   |
|  Liquibase Migrations [##########] 95%   |  <- 64 миграции
|  Backup/Restore       [#######---] 70%   |
|  Load Testing (k6)    [###-------] 30%   |
|  Monitoring           [##########] 95%   |  <- Beszel (CPU/RAM/disk/net)
|  Logging              [####------] 40%   |  <- stdout JSON, нет Loki
|  Error Tracking       [##########] 95%   |  <- GlitchTip (self-hosted Sentry)
+------------------------------------------+

PRODUCT / GROWTH
+------------------------------------------+
|  Product Analytics    [----------]  0%   |  <- КРИТИЧЕСКИЙ ПРОБЕЛ
|  Onboarding           [----------]  0%   |  <- КРИТИЧЕСКИЙ ПРОБЕЛ
|  Email Notifications  [----------]  0%   |
|  Integrations         [----------]  0%   |
|  Monetization         [----------]  0%   |
|  Documentation        [##--------] 20%   |
+------------------------------------------+
```

### Ключевые метрики проекта

| Метрика | Значение | Комментарий |
|---------|----------|-------------|
| Версия | 0.3.69 | 69 релизов, активная разработка |
| Строк кода (frontend) | ~43,000 | Зрелый frontend |
| Файлов TypeScript | 304 | Хорошая модуляризация |
| SQL миграций | 64 | Зрелая схема БД |
| Тестов | 8,081 строк | Хорошее покрытие бизнес-логики |
| Edge Functions | 6 | admin, invite, task-media, holidays, inbox, notifications |
| Поддерживаемые локали | 2 | RU (primary), EN |
| Контейнеров в prod | ~10 | db, keycloak, auth, rest, functions, backup, gateway, web, oauth2-proxy |

---

## 2. СТРАТЕГИЧЕСКОЕ ВИДЕНИЕ

### Позиционирование

```
     ЧТО:  Timeline-first планировщик для команд
     КТО:  Tech/product teams 5-50 человек (РФ/СНГ primary)
  ПОЧЕМУ:  Единственный self-hosted timeline с SSO из коробки
ОТЛИЧИЕ:  Timeline как ядро (не доп. вид), Daily Brief, self-hosted + Keycloak
```

### Целевой путь продукта (12 месяцев)

```
Сейчас           3 мес            6 мес            9 мес            12 мес
  |                |                |                |                |
  v                v                v                v                v
Pre-PMF    -->  Early PMF   -->  PMF          -->  Growth      -->  Scale

Solo tool  -->  Team tool   -->  Team+Mgmt    -->  Org tool    -->  Platform

0 users    -->  10 teams    -->  50 teams     -->  200 teams   -->  500+ teams

Free       -->  Free        -->  Open-core    -->  Paid tiers  -->  Enterprise
```

---

## 3. ДОРОЖНАЯ КАРТА ПО ФАЗАМ

### Обзор всех фаз

```
                        TIMELINE OVERVIEW

Апрель 2026                                              Март 2027
|============|============|============|============|============|
   Фаза 0       Фаза 1       Фаза 2       Фаза 3      Фаза 4+5
  ФУНДАМЕНТ    RETENTION    CORE VALUE     GROWTH     SCALE+MONEY
  (2 нед.)     (4 нед.)     (6 нед.)      (6 нед.)    (12 нед.)

  GlitchTip✅  Онбординг    Зависимости   Интеграции   Multi-tenant
  Beszel ✅    Уведомления  Cmd+K поиск   API+Webhooks Billing
  Бэкапы→S3✅ Empty states Custom fields  Telegram     Enterprise
  UFW ✅       PWA/push     Kanban вид    Календарь    HA infra
                                          Net isolation
```

---

## ФАЗА 0 — ФУНДАМЕНТ (Критическая инфраструктура)

> **Срок:** 2 недели (Апрель 1-14, 2026)
> **Цель:** Видеть что происходит в продакшене. Без этого всё остальное вслепую.
> **Принцип:** Ни одной новой фичи, только наблюдаемость и безопасность.

### 0.1 Error Tracking — GlitchTip ✅ ВЫПОЛНЕНО (v0.3.68–0.3.69)

**Зачем:** Баги обнаруживались только по жалобам. GlitchTip показывает ошибки в реальном времени.

> ⚠️ Sentry заблокирован в РФ с сентября 2024. Выбран GlitchTip — self-hosted Sentry-совместимый трекер.

```
Выполнено:
[x] GlitchTip v6 развёрнут на prod-сервере (errors.motio.nikog.net)
[x] Автоматический SSL через Caddy (Let's Encrypt)
[x] Подключён @sentry/react + browserTracingIntegration в frontend
[x] Source maps upload через sentryVitePlugin (production builds)
[x] Интегрирован с PageErrorBoundary (captureException)
[x] Лёгкий репортер для Deno Edge Functions (без SDK, чистый fetch)
[x] 4 Uptime Monitor: motio.nikog.net, errors, monitor, supabase gateway
[x] Performance tracing: tracesSampleRate 20% (каждая 5-я транзакция)
[x] Transaction groups появляются в реальном времени

Стек:
  - infra/docker-compose.glitchtip.yml (postgres + redis + web + worker)
  - src/shared/lib/sentry.ts
  - infra/supabase/functions/_shared/sentryCapture.ts
  - DSN: https://4e0c6eb07b6a4b2986690ac6cee1508f@errors.motio.nikog.net/1

Effort:  выполнено
Impact:  ВЫСОКИЙ — видимость ошибок и производительности в prod
```

### 0.2 Мониторинг инфраструктуры ✅ ВЫПОЛНЕНО (ранее)

**Зачем:** Знать, жив ли prod, до того как пожалуются пользователи.

```
Выполнено:
[x] Beszel — мониторинг CPU, RAM, диск, сеть (monitor.motio.nikog.net)
[x] Uptime мониторы в GlitchTip (4 эндпоинта, проверка каждые 60s)

Остаётся (при необходимости):
[ ] Алерты на CPU > 80%, RAM > 85%, Disk < 10%
[ ] JSON structured logging → Loki (если вырастет объём)

Effort:  выполнено
Impact:  КРИТИЧЕСКИЙ — узнаём о проблемах ДО пользователей
```

### 0.3 Бэкапы в облако ✅ ВЫПОЛНЕНО (v0.3.77, 2026-04-04)

**Зачем:** Бэкапы на том же диске = нет бэкапов.

```
Выполнено:
[x] @aws-sdk/client-s3 добавлен в backup-service
[x] uploadToS3() вызывается после каждого createBackup (manual, daily, pre-restore)
[x] Timeweb Cloud S3 — приватный бакет motio-backup (10 ГБ, ru-1)
[x] S3_* переменные в docker-compose.prod.yml и .env.example
[x] Проверено: файл появляется в бакете после ручного бэкапа

Отложено на будущее (не критично сейчас):
[ ] Шифрование бэкапов GPG перед upload
[ ] Расширить retention до 90 дней (сейчас 30)

Effort:  выполнено
Impact:  ВЫСОКИЙ — защита от потери данных
```

### 0.4 Безопасность ✅ ВЫПОЛНЕНО (частично)

```
Выполнено:
[x] UFW настроен: только 80/443/22 открыты наружу
[x] seccomp=unconfined — сознательное решение (host runtime limitation)

Отложено до Фазы 3 (обоснованно):
[ ] Docker network isolation — актуально перед открытием внешнего API
    Причина: при 0 пользователях риск теоретический, не практический

Effort:  выполнено
Impact:  СРЕДНИЙ
```

### Результат Фазы 0 ✅ ЗАВЕРШЕНА (2026-04-04)

```
BEFORE                              AFTER
+-----------------------------+     +-----------------------------+
| Prod работает? Не знаю      |     | Beszel: CPU/RAM/disk green  |
| Ошибки? Нет жалоб = ок      |     | GlitchTip: issues + perf   |
| Бэкап работает? Наверное    |     | Бэкапы local + S3 (Timeweb)|
| Безопасность? Ну вроде      |     | UFW настроен, порты закрыты |
+-----------------------------+     +-----------------------------+

Статус: 0.1 ✅  0.2 ✅  0.3 ✅  0.4 ✅
```

---

## ФАЗА 1 — RETENTION (Удержание пользователей)

> **Срок:** 4 недели (Апрель 15 — Май 12, 2026)
> **Цель:** Пользователь, который пришёл, остаётся. Первые 5 минут = success.
> **Принцип:** Всё, что делает первый опыт гладким.

### 1.1 Онбординг (Welcome Flow) ✅ ВЫПОЛНЕНО (2026-04-04)

**Зачем:** Сейчас после логина — пустой таймлайн. 15-30 минут до Aha-момента. Цель: 2-3 минуты.

```
Выполнено:
[x] driver.js тур — 9 шагов с затенением и подсветкой элементов
[x] Тур проходит через: Planner → Dashboard → Projects → Team
[x] На каждом шаге кнопки "Далее" и "Пропустить"
[x] Флаг onboarding_completed в profiles.preferences (JSONB)
[x] Существующие пользователи помечены через миграцию (не видят тур)
[x] Только новые регистрации видят тур
[x] Переводы RU/EN через lingui
[x] Миграция 0068_set_onboarding_completed_existing_users.sql

Effort:  выполнено
Impact:  КРИТИЧЕСКИЙ — определяет retention
```

### 1.2 Empty States

**Зачем:** Пустые страницы = "продукт сломан". Empty states = "вот что делать дальше".

```
Задачи:
[ ] Компонент EmptyState (иконка + заголовок + описание + CTA кнопка)

[ ] Применить на всех пустых страницах:
    - Пустой таймлайн → "Создай первую задачу" + иллюстрация
    - Нет проектов → "Создай проект для организации задач"
    - Нет участников → "Пригласи команду для совместной работы"
    - Пустой dashboard → "Добавь первый виджет"
    - Нет комментариев → "Напиши первый комментарий"
    - Нет уведомлений → "Нет новых уведомлений"

Effort:  2-3 дня
Impact:  ВЫСОКИЙ — убирает "стену" для новых пользователей
```

### 1.3 Email-уведомления

**Зачем:** Без внешних уведомлений продукт "мёртвый" между сессиями. Daily Brief бесполезен, если человек не открыл приложение.

```
Задачи:
[ ] Выбрать транспорт (Resend.com / Postmark / Amazon SES)
[ ] Edge Function send-email (или отдельный email-service)
[ ] Шаблоны писем (React Email или mjml):
    - Daily Brief digest (утренняя сводка по email)
    - Task assigned to you
    - @mention in comment
    - Invite to workspace
    - Task overdue reminder
[ ] Настройки email-уведомлений в user preferences:
    - Включить/выключить каждый тип
    - Частота daily brief: ежедневно / по будням / выключить
[ ] Unsubscribe link в каждом письме
[ ] Миграция БД: таблица notification_preferences

Effort:  5-7 дней
Impact:  КРИТИЧЕСКИЙ — основной драйвер возврата в продукт
```

### 1.4 PWA + Push-уведомления

**Зачем:** Мобильные пользователи без нативного приложения. PWA — минимальная инвестиция для максимального эффекта.

```
Задачи:
[ ] Service Worker (vite-plugin-pwa)
[ ] Web App Manifest (иконки, цвета, standalone display)
[ ] Offline fallback страница
[ ] Push-уведомления (Web Push API):
    - Назначение на задачу
    - @mention в комментарии
    - Daily Brief push в 9:00
[ ] Кнопка "Установить Motio" на лендинге и в app header

Effort:  3-4 дня
Impact:  ВЫСОКИЙ — мобильный доступ без App Store
```

### 1.5 Сохранение контекста при смене workspace

**Зачем:** Сейчас при переключении workspace все фильтры теряются (plannerStore.reset()). Раздражает.

```
Задачи:
[ ] Сохранять planner state per workspace в localStorage:
    - viewMode (day/week/calendar)
    - groupMode (assignee/project)
    - filters (projects, assignees, statuses, types, tags)
    - currentDate
    - selectedTaskId
[ ] При переключении workspace — восстанавливать сохранённый state
[ ] При первом входе в workspace — дефолтные настройки

Effort:  1-2 дня
Impact:  СРЕДНИЙ — убирает ежедневное раздражение
```

### 1.6 Sync Status Indicator

**Зачем:** Пользователь не знает, сохранились ли его изменения. console.error невидим.

```
Задачи:
[ ] UI компонент SyncStatusBadge в header:
    - Зелёная точка: "Синхронизировано"
    - Жёлтая: "Синхронизация..."
    - Красная: "Ошибка соединения" + кнопка "Повторить"
[ ] Подключить к usePlannerLiveSync.syncHealthy
[ ] Toast при восстановлении соединения

Effort:  1 день
Impact:  СРЕДНИЙ — доверие пользователя к продукту
```

### Результат Фазы 1

```
МЕТРИКА                  BEFORE    TARGET
Time to Aha moment       15-30мин  2-3мин
Day 1 retention          ???       70%+
Day 7 retention          ???       40%+
Daily Brief open rate    ???       50%+
Email notification CTR   N/A       15%+
PWA installs             N/A       20% of users
```

---

## ФАЗА 2 — CORE VALUE (Усиление ядра продукта)

> **Срок:** 6 недель (Май 13 — Июнь 23, 2026)
> **Цель:** Продукт делает то, что конкуренты не могут / делают хуже.
> **Принцип:** Table-stakes фичи + уникальные преимущества.

### 2.1 Глобальный поиск (Cmd+K / Ctrl+K)

**Зачем:** Table-stakes для любого рабочего инструмента. cmdk уже в зависимостях, но нигде не используется.

```
Задачи:
[ ] Command Palette на базе cmdk (уже установлен!):
    - Поиск задач по названию
    - Поиск проектов
    - Поиск участников
    - Quick actions: "Создать задачу", "Перейти к Dashboard"
[ ] Горячая клавиша Cmd+K / Ctrl+K
[ ] Recent searches
[ ] Keyboard navigation (стрелки + Enter)

Effort:  3-4 дня
Impact:  ВЫСОКИЙ — ожидается пользователями как базовая фича
```

### 2.2 Зависимости между задачами

**Зачем:** Для timeline-продукта это ключевая фича. Без неё Motio — календарь с полосками, а не планировщик.

```
Задачи:
[ ] Миграция БД: таблица task_dependencies
    (predecessor_id, successor_id, type: finish_to_start)
[ ] UI: стрелки между задачами на таймлайне (SVG overlay)
[ ] Создание зависимости: drag от края задачи к другой задаче
[ ] Удаление зависимости: клик по стрелке → "Удалить"
[ ] Логика: при сдвиге predecessor → автоматически сдвигать successor
[ ] Предупреждение при нарушении зависимости
[ ] API: CRUD через Supabase

Effort:  8-10 дней
Impact:  КРИТИЧЕСКИЙ — дифференциатор от "просто календаря"
```

### 2.3 Кастомные поля

**Зачем:** Enterprise-клиенты не могут работать без кастомизации. Blocker для продаж.

```
Задачи:
[ ] Миграция БД: таблицы custom_field_definitions + custom_field_values
[ ] Типы полей:
    - Text (строка)
    - Number (число)
    - Date (дата)
    - Select (выпадающий список, workspace-уровень)
    - Checkbox (да/нет)
[ ] UI: секция "Custom Fields" в TaskDetailPanel
[ ] Настройка полей: Workspace Settings → Custom Fields
[ ] Фильтрация по кастомным полям в FilterPanel
[ ] Отображение в таблицах (Projects → Tasks)

Effort:  7-10 дней
Impact:  ВЫСОКИЙ — открывает enterprise-сегмент
```

### 2.4 Kanban-вид

**Зачем:** Расширяет аудиторию на тех, кто привык к Trello-подобному опыту. Не замена таймлайна, а дополнение.

```
Задачи:
[ ] Новый viewMode: 'kanban' (добавить к day/week/calendar)
[ ] Колонки = статусы задач (configurable порядок)
[ ] Drag-and-drop между колонками (изменение статуса)
[ ] Карточка задачи: title, assignee avatar, project badge, due date
[ ] WIP limits (опционально — лимит задач в колонке)
[ ] Переключатель Timeline ↔ Kanban в header

Effort:  5-7 дней
Impact:  ВЫСОКИЙ — охват аудитории Trello-пользователей
```

### 2.5 Undo/Redo

**Зачем:** Перетянул задачу не туда — всё, обратного пути нет. Это неприемлемо.

```
Задачи:
[ ] Undo-стек в plannerStore (последние 20 действий)
[ ] Горячие клавиши: Ctrl+Z / Ctrl+Shift+Z
[ ] Toast после действия: "Задача перемещена" [Отменить]
[ ] Поддерживаемые операции:
    - Перемещение задачи (move)
    - Изменение дат (resize)
    - Удаление задачи
    - Изменение статуса
    - Изменение assignee

Effort:  4-5 дней
Impact:  СРЕДНИЙ — уверенность пользователя в действиях
```

### 2.6 Экспорт данных

**Зачем:** Table-stakes. Компании хотят знать, что могут забрать свои данные.

```
Задачи:
[ ] Экспорт задач в CSV (все задачи workspace или по фильтру)
[ ] Экспорт таймлайна в PDF (скриншот текущего вида)
[ ] Экспорт проекта в JSON (для переноса между workspace)
[ ] Кнопка "Export" в меню workspace settings

Effort:  3-4 дня
Impact:  СРЕДНИЙ — требование enterprise и compliance
```

### Результат Фазы 2

```
TABLE-STAKES CHECKLIST:
[x] Глобальный поиск        (было: НЕТ)
[x] Зависимости задач       (было: НЕТ)
[x] Кастомные поля           (было: НЕТ)
[x] Kanban-вид               (было: НЕТ)
[x] Undo/Redo                (было: НЕТ)
[x] Экспорт данных           (было: НЕТ)
[ ] API / Webhooks            (Фаза 3)
[ ] Автоматизации             (Фаза 4)
[ ] Email-уведомления         (Фаза 1 - done)
```

---

## ФАЗА 3 — GROWTH (Рост и привлечение)

> **Срок:** 6 недель (Июнь 24 — Август 4, 2026)
> **Цель:** Привлечение новых пользователей. Продукт можно показать миру.
> **Принцип:** Интеграции, лендинг, community.

### 3.1 API + Webhooks

**Зачем:** Без API продукт — изолированный остров. Интеграции невозможны.

```
Задачи:
[ ] REST API v1 через Edge Function:
    - GET/POST/PATCH/DELETE /api/v1/tasks
    - GET/POST/PATCH/DELETE /api/v1/projects
    - GET /api/v1/members
    - GET /api/v1/workspaces
[ ] API key management (workspace settings → API Keys)
[ ] Rate limiting (100 req/min per key)
[ ] API документация (OpenAPI/Swagger)
[ ] Webhooks:
    - task.created / task.updated / task.deleted
    - member.invited / member.removed
    - project.created / project.completed
[ ] Webhook management UI (workspace settings → Webhooks)

Effort:  7-10 дней
Impact:  ВЫСОКИЙ — основа для всех интеграций
```

### 3.2 Интеграция с Telegram

**Зачем:** Основной мессенджер целевой аудитории (РФ/СНГ). Telegram-бот = канал уведомлений + quick actions.

```
Задачи:
[ ] Telegram Bot (@MotioBot):
    - Уведомления: назначение, @mention, overdue, daily brief
    - Quick actions: /tasks (мои задачи на сегодня), /done <id>
    - Привязка аккаунта: /connect <workspace_token>
[ ] Edge Function telegram-webhook
[ ] Настройка в user preferences: Telegram notifications on/off

Effort:  5-7 дней
Impact:  ВЫСОКИЙ для RU-рынка — Telegram > Email для этой аудитории
```

### 3.3 Интеграция с календарём

**Зачем:** Частый запрос — синхронизация задач с Google Calendar / Outlook.

```
Задачи:
[ ] iCal feed (read-only URL для подписки):
    /api/v1/calendar/feed/:token.ics
[ ] Задачи с датами → calendar events
[ ] Milestones → all-day events
[ ] Двусторонняя sync (Google Calendar API) — v2

Effort:  3-4 дня (iCal), 7-10 дней (Google sync)
Impact:  СРЕДНИЙ — удобство, но не критичный
```

### Результат Фазы 3

```
GROWTH METRICS TARGET:
- New workspace/month:    20+
- API integrations:       10+
- Telegram bot users:     30% of active users
- Calendar feed подписок: 20%+ of users
```

---

## ФАЗА 4 — SCALE (Масштабирование)

> **Срок:** 8 недель (Август 5 — Сентябрь 29, 2026)
> **Цель:** Продукт выдерживает нагрузку 500+ пользователей. Инфраструктура надёжна.
> **Принцип:** Reliability, performance, multi-tenancy.

### 4.1 HA Infrastructure

```
Задачи:
[ ] 2 VPS + floating IP (или Kubernetes cluster)
[ ] Postgres read replica (streaming replication)
[ ] Keycloak cluster (2 nodes, Infinispan cache)
[ ] CDN для статики и аватарок (Cloudflare)
[ ] Load balancer перед Caddy (или Cloudflare proxy)
[ ] Redis для session cache и rate limiting
[ ] Health check endpoints для всех сервисов

Effort:  2-3 недели
Impact:  КРИТИЧЕСКИЙ для >100 users — устраняет SPOF
```

### 4.2 Performance: Timeline Virtualization

```
Задачи:
[ ] react-virtual для отрисовки только видимых строк
[ ] Lazy loading задач за пределами видимого окна
[ ] Paginated loading при >1000 задач
[ ] Performance budget: <16ms per frame при drag

Effort:  5-7 дней
Impact:  ВЫСОКИЙ — без этого >5K задач = лаги
```

### 4.3 Автоматизации (Rules Engine)

```
Задачи:
[ ] Модель: trigger → condition → action
[ ] Triggers: task created, status changed, due date passed, assignee changed
[ ] Conditions: if status = X, if assignee = Y, if project = Z
[ ] Actions: change status, assign to, send notification, move to project
[ ] UI: Workspace Settings → Automations
[ ] Шаблоны: "Auto-assign overdue to manager", "Notify on completion"

Effort:  10-14 дней
Impact:  ВЫСОКИЙ — конкурентная фича (Monday.com, Asana)
```

### 4.4 Audit Log

```
Задачи:
[ ] Таблица audit_events (who, what, when, workspace_id)
[ ] Логировать: task CRUD, member changes, settings changes, login/logout
[ ] UI: Admin Console → Audit Log
[ ] Фильтры: по пользователю, по типу, по дате
[ ] Export в CSV

Effort:  5-7 дней
Impact:  СРЕДНИЙ — требование enterprise/compliance
```

### 4.5 Multi-tenant Managed Hosting (подготовка)

```
Задачи:
[ ] Архитектура multi-tenancy:
    Schema per tenant (отдельная schema в Postgres)
    ИЛИ
    Row-level tenancy (tenant_id в каждой таблице — уже есть workspace_id!)
[ ] Tenant provisioning API
[ ] Tenant isolation validation (тесты)
[ ] Shared Keycloak realm с tenant mapping
[ ] Subdomain routing: team1.motio.app, team2.motio.app

Effort:  2-3 недели
Impact:  КРИТИЧЕСКИЙ для SaaS-модели
```

---

## ФАЗА 5 — MONETIZATION (Монетизация)

> **Срок:** 4 недели (Октябрь 2026)
> **Цель:** Продукт приносит деньги.
> **Принцип:** Open-core — бесплатное ядро, платные enterprise-фичи.

### 5.1 Pricing Model

```
Предлагаемая структура:

+------------------+-------------------+-------------------+
|    FREE           |    PRO            |    ENTERPRISE     |
|    (Self-hosted)  |    (Managed)      |    (Managed+)     |
+------------------+-------------------+-------------------+
| Timeline          | Everything Free + | Everything Pro +  |
| Kanban            | Managed hosting   | Custom fields     |
| Projects          | Email support     | Automations       |
| Dashboard         | Daily backups     | Audit log         |
| Daily Brief       | Custom domain     | SAML SSO          |
| API + Webhooks    | 99.9% SLA        | Priority support  |
| Telegram bot      |                   | Custom integrations|
| Community support | $8/user/month     | $15/user/month    |
+------------------+-------------------+-------------------+
```

### 5.2 Billing Integration

```
Задачи:
[ ] Stripe integration (subscriptions, invoices, payment methods)
[ ] Pricing page на лендинге
[ ] In-app upgrade flow (Free → Pro)
[ ] Usage tracking (seats, storage)
[ ] Trial period: 14 дней Pro при создании managed workspace
[ ] Downgrade flow (Pro → Free: данные сохраняются, фичи ограничиваются)

Effort:  7-10 дней
Impact:  КРИТИЧЕСКИЙ — без revenue продукт не выживет
```

### 5.3 Self-serve Signup для Managed

```
Задачи:
[ ] Регистрация на motio.app (без Docker, без DevOps)
[ ] Auto-provisioning workspace (< 30 секунд)
[ ] Onboarding wizard: название команды → пригласить коллег → первый проект
[ ] Free trial 14 дней (полный Pro)

Effort:  5-7 дней
Impact:  КРИТИЧЕСКИЙ — снижает friction до нуля
```

---

## 4. МАТРИЦА ПРИОРИТЕТОВ (Impact / Effort)

```
                          IMPACT
              Low              Medium              High
         +------------------+------------------+------------------+
         |                  |                  |                  |
   Low   |                  | 1.5 Context save | 0.1 Sentry       |
         |                  | 1.6 Sync status  | 0.4 Security     |
  E      |                  |                  |                  |
  f      +------------------+------------------+------------------+
  f      |                  |                  |                  |
  o      | 3.3 Calendar     | 2.5 Undo/Redo    | 0.2 Monitoring   |
  r   Med|                  | 2.6 Export       | 0.3 S3 backups   |
  t      |                  | 4.4 Audit Log    | 1.1 Onboarding   |
         |                  |                  |                  |
         +------------------+------------------+------------------+
         |                  |                  |                  |
         |                  | 4.3 Automations  | 1.3 Email notif  |
  High   |                  | 4.5 Multi-tenant | 2.2 Dependencies |
         |                  | 5.2 Billing      | 2.3 Custom fields|
         |                  |                  | 3.1 API+Webhooks |
         |                  |                  | 3.2 Telegram     |
         +------------------+------------------+------------------+

ПРИОРИТЕТ: Начинай с правого верхнего угла (High Impact / Low Effort)
           → потом правый средний → потом правый нижний
```

---

## 5. МЕТРИКИ УСПЕХА ПО ФАЗАМ

### Фаза 0 (Фундамент)

```
[ ] Sentry подключен, ошибки видны          → Да/Нет
[ ] Grafana dashboard показывает метрики    → Да/Нет
[ ] Бэкапы уходят в S3                     → Да/Нет
[ ] Алерты настроены и протестированы       → Да/Нет
```

### Фаза 1 (Retention)

```
Activation rate (signup → first task):     Цель: 60%+
Day 1 retention:                           Цель: 70%+
Day 7 retention:                           Цель: 40%+
Daily Brief open rate:                     Цель: 50%+
Onboarding completion rate:                Цель: 80%+
Email notification CTR:                    Цель: 15%+
```

### Фаза 2 (Core Value)

```
Feature adoption:
  - Cmd+K usage:          30%+ of sessions
  - Dependencies created: 20%+ of workspaces
  - Kanban view used:     25%+ of users
  - Custom fields used:   15%+ of workspaces
  - Export used:           10%+ of workspaces

NPS (Net Promoter Score):  Цель: 30+
```

### Фаза 3 (Growth)

```
New workspaces / month:    20+
API integrations created:  10+
Telegram bot users:        30% of active
Calendar feed подписок:    20%+ of users
```

### Фаза 4-5 (Scale + Money)

```
Active workspaces:         200+
Paying customers:          20+
MRR:                       $2,000+
Uptime:                    99.9%+
p95 response time:         <500ms
Error rate:                <0.1%
```

---

## 6. ГРАФ ЗАВИСИМОСТЕЙ

```
Что от чего зависит (нельзя менять порядок):

0.1 Sentry ──> стабильность до онбординга (ошибки видны до 1.1)

0.2 Monitoring ──> 4.1 HA Infrastructure (нужны метрики ДО масштабирования)

1.3 Email ──> 3.2 Telegram (общая архитектура уведомлений)

2.1 Cmd+K ──────> (независимый, можно делать в любой момент)

2.2 Dependencies ──> 4.3 Automations (зависимости = триггер для автоматизаций)

2.3 Custom fields ──> 5.1 Pricing (custom fields = платная фича)

3.1 API ──> 3.3 Calendar sync (API нужен раньше)
       ──> 4.3 Automations (webhooks — часть automation engine)

4.5 Multi-tenant ──> 5.2 Billing (billing только для managed)
                 ──> 5.3 Self-serve signup
```

---

## 7. РИСКИ И МИТИГАЦИЯ

### Технические риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Потеря данных (disk failure) | Средняя | Критическое | Фаза 0: S3 бэкапы |
| Race conditions в sync | Высокая | Среднее | Фаза 1: AbortController + sync indicator |
| Performance при >5K задач | Средняя | Высокое | Фаза 4: virtualization |
| Keycloak SPOF | Высокая | Критическое | Фаза 4: HA cluster |
| Edge Function cold starts | Низкая | Низкое | Мониторинг Фаза 0 |

### Продуктовые риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Building in vacuum (нет фидбэка) | ВЫСОКАЯ | Критическое | Регулярный фидбэк от коллег, использующих продукт |
| Feature creep (слишком много фич) | Средняя | Высокое | Строго следовать фазам, не перепрыгивать |
| Bus factor = 1 | Высокая | Критическое | Документация, AGENTS.md, onboarding новых контрибьюторов |
| Self-hosted friction | Высокая | Высокое | Managed hosting (Фаза 5), упрощённая установка |
| No monetization path | Средняя | Критическое | Pricing model определить в Фазе 2, реализовать в Фазе 5 |

---

## 8. ЧЕКЛИСТ ПЕРЕД КАЖДОЙ ФАЗОЙ

### Перед началом любой фазы

```
[ ] Предыдущая фаза полностью завершена (все задачи done)
[ ] Метрики предыдущей фазы достигнуты (или объяснено почему нет)
[ ] Sentry: 0 critical unresolved errors
[ ] Grafana: все метрики в зелёной зоне
[ ] Бэкап протестирован за последнюю неделю
[ ] Plan ревью: нужно ли скорректировать приоритеты?
```

### Перед релизом каждой крупной фичи

```
[ ] Тесты написаны и проходят
[ ] Empty state продуман
[ ] Mobile вид проверен
[ ] RU + EN локализация
[ ] Feature flag (если нужен постепенный rollout)
```

---

## QUICK REFERENCE: ЧТО ДЕЛАТЬ ПРЯМО СЕЙЧАС

```
НЕДЕЛЯ 1 (Апрель 1-7):
  Пн: Развернуть PostHog, интегрировать в frontend
  Вт: Настроить события и funnel'ы в PostHog
  Ср: Подключить Sentry (frontend + Edge Functions)
  Чт: Prometheus + Grafana (базовый dashboard)
  Пт: Настроить алерты, протестировать

НЕДЕЛЯ 2 (Апрель 8-14):
  Пн: S3 sync для бэкапов + шифрование
  Вт: Тест восстановления из S3
  Ср: Security fixes (seccomp, UFW, networks)
  Чт: Ревью метрик — PostHog показывает данные?
  Пт: Планирование Фазы 1, поиск 5 beta-teams

НЕДЕЛЯ 3 (Апрель 15-21):
  Начало Фазы 1: Онбординг + Empty States
  ...
```

---

> **Помни:** Лучший план — тот, которому следуют.
> Не перепрыгивай фазы. Каждая следующая строится на предыдущей.
> Главный враг сейчас — не конкуренты, а отсутствие реальных пользователей.
> Найди 5-10 команд, которые будут пользоваться Motio каждый день.
> Их фидбэк важнее любого пункта в этом плане.
