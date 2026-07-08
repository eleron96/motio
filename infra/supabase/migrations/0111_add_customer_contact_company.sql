-- Give customer contacts their own free-form "company" field, so the customer
-- contact form matches the external team-member form field-for-field (name,
-- company, role, tag, email, phone). The tag stays a separate grouping label.
-- Nullable, no backfill — existing rows are unaffected.
--
-- Rollback: ALTER TABLE public.customer_contacts DROP COLUMN company;

ALTER TABLE public.customer_contacts
  ADD COLUMN IF NOT EXISTS company text;
