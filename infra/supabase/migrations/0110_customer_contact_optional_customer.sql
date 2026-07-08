-- Workspace contact list: let a customer contact exist without a customer, so
-- the flat Contacts tab can hold standalone people (a contractor, a lead, a
-- person not yet tied to a client). Just drops the NOT NULL — the FK stays
-- ON DELETE CASCADE (0081), so deleting a customer still removes its own
-- contacts while standalone (NULL) contacts are untouched.
--
-- Rollback: any standalone contacts (customer_id IS NULL) must be reattached or
-- removed first, then `ALTER TABLE public.customer_contacts ALTER COLUMN
-- customer_id SET NOT NULL`.

ALTER TABLE public.customer_contacts
  ALTER COLUMN customer_id DROP NOT NULL;
