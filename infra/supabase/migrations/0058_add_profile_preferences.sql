-- Добавляем колонку preferences (JSONB) для хранения пользовательских настроек.
-- Значение по умолчанию — {"daily_brief_enabled": true}, чтобы существующие
-- пользователи не потеряли функцию.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{"daily_brief_enabled": true}';
