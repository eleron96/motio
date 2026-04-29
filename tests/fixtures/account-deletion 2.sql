-- Fixtures for account deletion integration tests.
-- Four users, three workspaces covering the three deletion scenarios.
--
-- Designed for use inside a tx that rolls back (see withRollback), but is also
-- idempotent on its own: deletes fixture rows first, then re-inserts.
--
-- Fixed UUIDs so tests can reference them without lookups. See TEST_USER_IDS
-- and TEST_WORKSPACE_IDS in tests/helpers/setup-test-db.ts.
--
-- Scenarios covered:
--   Alice   → sole admin in W1 (Charlie is editor there). Deletion must force
--             ownership transfer.
--   Bob     → admin in W2 with Charlie as co-admin. Deletion can auto-transfer.
--   Charlie → plain member in W1 and co-admin in W2. Deletion just leaves W1
--             (no transfer needed) and auto-transfers W2.
--   David   → alone in W3. Deletion must offer to delete the workspace.

delete from auth.users where id in (
  '11111111-1111-1111-1111-000000000001',
  '11111111-1111-1111-1111-000000000002',
  '11111111-1111-1111-1111-000000000003',
  '11111111-1111-1111-1111-000000000004'
);

insert into auth.users (
  id, email, aud, role, instance_id, raw_app_meta_data, raw_user_meta_data
) values
  ('11111111-1111-1111-1111-000000000001', 'alice@fixture.local',
   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
   '{}'::jsonb, '{}'::jsonb),
  ('11111111-1111-1111-1111-000000000002', 'bob@fixture.local',
   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
   '{}'::jsonb, '{}'::jsonb),
  ('11111111-1111-1111-1111-000000000003', 'charlie@fixture.local',
   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
   '{}'::jsonb, '{}'::jsonb),
  ('11111111-1111-1111-1111-000000000004', 'david@fixture.local',
   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
   '{}'::jsonb, '{}'::jsonb);

update public.profiles set display_name = 'Alice Fixture'
  where id = '11111111-1111-1111-1111-000000000001';
update public.profiles set display_name = 'Bob Fixture'
  where id = '11111111-1111-1111-1111-000000000002';
update public.profiles set display_name = 'Charlie Fixture'
  where id = '11111111-1111-1111-1111-000000000003';
update public.profiles set display_name = 'David Fixture'
  where id = '11111111-1111-1111-1111-000000000004';

insert into public.workspaces (id, name, owner_id) values
  ('22222222-2222-2222-2222-000000000001', 'Alice Solo',
   '11111111-1111-1111-1111-000000000001'),
  ('22222222-2222-2222-2222-000000000002', 'Bob Shared',
   '11111111-1111-1111-1111-000000000002'),
  ('22222222-2222-2222-2222-000000000003', 'David Alone',
   '11111111-1111-1111-1111-000000000004');

insert into public.workspace_members (workspace_id, user_id, role) values
  -- W1: Alice admin, Charlie editor
  ('22222222-2222-2222-2222-000000000001',
   '11111111-1111-1111-1111-000000000001', 'admin'),
  ('22222222-2222-2222-2222-000000000001',
   '11111111-1111-1111-1111-000000000003', 'editor'),
  -- W2: Bob + Charlie both admin
  ('22222222-2222-2222-2222-000000000002',
   '11111111-1111-1111-1111-000000000002', 'admin'),
  ('22222222-2222-2222-2222-000000000002',
   '11111111-1111-1111-1111-000000000003', 'admin'),
  -- W3: David alone
  ('22222222-2222-2222-2222-000000000003',
   '11111111-1111-1111-1111-000000000004', 'admin');
