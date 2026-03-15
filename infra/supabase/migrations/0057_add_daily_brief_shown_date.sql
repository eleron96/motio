alter table public.profiles
  add column if not exists daily_brief_shown_date date;
