do $$
begin
  if to_regprocedure('public.dashboard_task_counts(uuid,date,date)') is not null then
    execute 'alter function public.dashboard_task_counts(uuid, date, date) set jit = off';
  end if;

  if to_regprocedure('public.dashboard_task_counts_base(uuid,date,date)') is not null then
    execute 'alter function public.dashboard_task_counts_base(uuid, date, date) set jit = off';
  end if;

  if to_regprocedure('public.dashboard_task_time_series(uuid,date,date)') is not null then
    execute 'alter function public.dashboard_task_time_series(uuid, date, date) set jit = off';
  end if;

  if to_regprocedure('public.dashboard_task_time_series_base(uuid,date,date)') is not null then
    execute 'alter function public.dashboard_task_time_series_base(uuid, date, date) set jit = off';
  end if;
end
$$;
