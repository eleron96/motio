import { describe, expect, it, beforeEach, vi } from 'vitest';
import { demoSupabaseClient } from '@/features/demo/lib/demoSupabaseClient';
import { demoStore } from '@/features/demo/lib/demoDataStore';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

describe('demoSupabaseClient', () => {
  beforeEach(() => {
    demoStore.__reset();
  });

  it('seeds 52 tasks for the visitor workspace', async () => {
    const workspaceId = demoStore.workspaceId();
    const { data, error } = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBe(52);
  });

  it('ensure_initial_workspace returns the seeded workspace id', async () => {
    const workspaceId = demoStore.workspaceId();
    const { data, error } = await demoSupabaseClient.rpc('ensure_initial_workspace');
    expect(error).toBeNull();
    expect(data).toBe(workspaceId);
  });

  it('insert / update / delete on tasks round-trip through demoStore', async () => {
    const workspaceId = demoStore.workspaceId();
    const inserted = await demoSupabaseClient
      .from('tasks')
      .insert({
        workspace_id: workspaceId,
        title: 'Test task',
        start_date: '2026-05-01',
        end_date: '2026-05-02',
        status_id: '33333333-0000-0000-0000-000000000001',
        type_id: '44444444-0000-0000-0000-000000000003',
        assignee_ids: [],
        tag_ids: [],
      })
      .select()
      .single();
    expect(inserted.error).toBeNull();
    const newId = (inserted.data as unknown as { id: string }).id;
    expect(newId).toBeTruthy();

    const after = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId);
    expect((after.data as unknown[]).length).toBe(53);

    await demoSupabaseClient
      .from('tasks')
      .update({ title: 'Renamed' })
      .eq('id', newId);
    const reloaded = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .eq('id', newId)
      .single();
    expect((reloaded.data as unknown as { title: string }).title).toBe('Renamed');

    await demoSupabaseClient.from('tasks').delete().eq('id', newId);
    const final = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId);
    expect((final.data as unknown[]).length).toBe(52);
  });

  it('order + limit chain returns sorted slice', async () => {
    const workspaceId = demoStore.workspaceId();
    const { data } = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('start_date', { ascending: true })
      .limit(3);
    const rows = data as Array<{ start_date: string }>;
    expect(rows.length).toBe(3);
    expect(rows[0].start_date <= rows[1].start_date).toBe(true);
    expect(rows[1].start_date <= rows[2].start_date).toBe(true);
  });

  it('auth.getSession returns a session for the seeded demo user', async () => {
    const { data, error } = await demoSupabaseClient.auth.getSession();
    expect(error).toBeNull();
    const session = (data as { session: { user: { id: string; is_anonymous: boolean } } }).session;
    expect(session.user.id).toBe(demoStore.user().id);
    expect(session.user.is_anonymous).toBe(true);
  });

  it('reset_demo_workspace replaces the seed and returns a new workspace id', async () => {
    const oldId = demoStore.workspaceId();
    await demoSupabaseClient.from('tasks').delete().eq('workspace_id', oldId);
    expect((await demoSupabaseClient.from('tasks').select('*').eq('workspace_id', oldId)).data).toEqual([]);

    const { data: newId } = await demoSupabaseClient.rpc('reset_demo_workspace');
    expect(newId).not.toBe(oldId);
    const fresh = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .eq('workspace_id', newId as string);
    expect((fresh.data as unknown[]).length).toBe(52);
  });

  it('milestones seed resolves dates to a window around today', async () => {
    const workspaceId = demoStore.workspaceId();
    const { data } = await demoSupabaseClient
      .from('milestones')
      .select('*')
      .eq('workspace_id', workspaceId);
    const dates = (data as Array<{ date: string }>).map((m) => m.date);
    expect(dates.length).toBe(42);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const allReasonable = dates.every((d) => {
      const diffDays = Math.abs(
        (new Date(d).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24),
      );
      return diffDays < 200;
    });
    expect(allReasonable).toBe(true);
  });

  it('channel and removeChannel are no-ops that do not throw', async () => {
    const ch = demoSupabaseClient.channel('demo');
    expect(ch).toBeDefined();
    expect(() => ch.on('postgres_changes' as never, {} as never, () => undefined)).not.toThrow();
    expect(() => ch.subscribe()).not.toThrow();
    await expect(demoSupabaseClient.removeChannel(ch)).resolves.toBe('ok');
  });
});
