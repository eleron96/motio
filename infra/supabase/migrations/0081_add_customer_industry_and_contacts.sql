-- Phase 3 (Project Card): customer industry + per-customer contacts.
-- The `customers` table grows an optional `industry` text column. A new
-- `customer_contacts` table holds people on the customer side (name, role,
-- email, phone). Both inherit the workspace-membership RLS pattern that
-- migration 0020 established for `customers`.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS industry text;

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_contacts_customer_id_idx
  ON public.customer_contacts (customer_id);
CREATE INDEX IF NOT EXISTS customer_contacts_workspace_id_idx
  ON public.customer_contacts (workspace_id);

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read customer_contacts" ON public.customer_contacts;
DROP POLICY IF EXISTS "workspace editors can write customer_contacts" ON public.customer_contacts;
DROP POLICY IF EXISTS "workspace editors can update customer_contacts" ON public.customer_contacts;
DROP POLICY IF EXISTS "workspace editors can delete customer_contacts" ON public.customer_contacts;

CREATE POLICY "workspace members can read customer_contacts" ON public.customer_contacts
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace editors can write customer_contacts" ON public.customer_contacts
  FOR INSERT WITH CHECK (public.is_workspace_editor(workspace_id));

CREATE POLICY "workspace editors can update customer_contacts" ON public.customer_contacts
  FOR UPDATE USING (public.is_workspace_editor(workspace_id));

CREATE POLICY "workspace editors can delete customer_contacts" ON public.customer_contacts
  FOR DELETE USING (public.is_workspace_editor(workspace_id));

-- Bump updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.touch_customer_contacts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_contacts_set_updated_at ON public.customer_contacts;
CREATE TRIGGER customer_contacts_set_updated_at
  BEFORE UPDATE ON public.customer_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_customer_contacts_updated_at();
