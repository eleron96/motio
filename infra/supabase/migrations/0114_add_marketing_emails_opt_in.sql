-- Product broadcast emails (announcements) are opt-in only: nobody receives
-- them until they flip the toggle in account settings. The unsubscribe link
-- in every email flips this back off.
alter table public.profiles
  add column if not exists marketing_emails_opt_in boolean not null default false;
