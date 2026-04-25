-- Tightens workspace_invites RLS so that only workspace admins can read
-- pending invitations. The previous "members can read workspace invites"
-- policy let any workspace member (viewer/editor included) enumerate
-- email addresses and tokens of pending invites via direct PostgREST
-- access, even though the application UI only goes through the invite
-- Edge Function (which uses service-role and bypasses RLS).
--
-- The "admins can manage workspace invites" policy already grants admins
-- read access through its FOR ALL clause, so dropping the members-read
-- policy is sufficient — no replacement policy is needed.

drop policy if exists "members can read workspace invites" on public.workspace_invites;
