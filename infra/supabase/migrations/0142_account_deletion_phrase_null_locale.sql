-- Фраза подтверждения удаления аккаунта должна работать и без выбранного языка.
--
-- С миграции 0141 профиль нового пользователя рождается с locale = NULL
-- («ещё не выбирал»), а `case NULL` не совпадает ни с одной веткой WHEN и
-- возвращал NULL. Из-за этого request_account_deletion падал с
-- «no confirmation phrase defined for locale=» — то есть человек не мог
-- удалить свой аккаунт, пока язык не проставлен.
--
-- Ничего, кроме справочника фраз, не трогаем: сам RPC остаётся прежним.

create or replace function public.account_deletion_confirmation_phrase(p_locale text)
returns text
language sql
immutable
as $$
  select case coalesce(p_locale, 'en')
    when 'ru' then 'Я понимаю, что удаляю свой аккаунт навсегда и теряю доступ ко всем рабочим пространствам'
    when 'en' then 'I understand that I am permanently deleting my account and losing access to all workspaces'
    else null
  end
$$;
