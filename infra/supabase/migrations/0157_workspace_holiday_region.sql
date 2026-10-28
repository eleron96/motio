-- Регион праздничного календаря пространства (земля Германии, кантон, штат…).
--
-- Источник праздников помечает региональные дни (Fronleichnam только в части
-- земель и т.п.). Без региона пространство видит только общенациональные
-- праздники; с регионом — ещё и праздники этого региона. Код региона —
-- ISO 3166-2 ("DE-BY") и обязан принадлежать стране пространства.
--
-- NULL = «вся страна». Существующим пространствам ничего не проставляется.
-- Колонка на существующей таблице: гранты и RLS-политика UPDATE
-- («workspace admins can update», 0001) уже покрывают её.
--
-- Rollback:
--   alter table public.workspaces drop constraint if exists workspaces_holiday_region_check;
--   alter table public.workspaces drop column if exists holiday_region;

alter table public.workspaces
  add column if not exists holiday_region text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspaces_holiday_region_check'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_holiday_region_check
      check (
        holiday_region is null
        or (
          holiday_region ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'
          and left(holiday_region, 2) = holiday_country
        )
      );
  end if;
end;
$$;
