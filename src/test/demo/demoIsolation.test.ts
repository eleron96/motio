// Security-focused tests for demo sandbox isolation.
// The demo route must not leak data into / from a production-signed-in
// session, and the mock must never make outbound requests.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { demoSupabaseClient } from '@/features/demo/lib/demoSupabaseClient';
import { demoStore } from '@/features/demo/lib/demoDataStore';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

describe('demo isolation', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;
  let xhrSpy: ReturnType<typeof vi.spyOn> | null = null;
  let beaconSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    demoStore.__reset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch was called inside the demo mock — leak!');
    });
    if (typeof XMLHttpRequest !== 'undefined') {
      xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {
        throw new Error('XMLHttpRequest opened inside the demo mock — leak!');
      });
    }
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => {
        throw new Error('sendBeacon called inside the demo mock — leak!');
      });
    }
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    xhrSpy?.mockRestore();
    beaconSpy?.mockRestore();
  });

  it('mock select never triggers a network request', async () => {
    const wsId = demoStore.workspaceId();
    await demoSupabaseClient.from('tasks').select('*').eq('workspace_id', wsId);
    await demoSupabaseClient.from('projects').select('*').eq('workspace_id', wsId);
    await demoSupabaseClient.from('milestones').select('*').eq('workspace_id', wsId);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('mock insert / update / delete never triggers a network request', async () => {
    const wsId = demoStore.workspaceId();
    await demoSupabaseClient
      .from('tasks')
      .insert({ workspace_id: wsId, title: 'x', start_date: '2026-05-01', end_date: '2026-05-01', status_id: 's', type_id: 't', assignee_ids: [], tag_ids: [] });
    await demoSupabaseClient.from('tasks').update({ title: 'y' }).eq('workspace_id', wsId);
    await demoSupabaseClient.from('tasks').delete().eq('title', 'y');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('every rpc call is local — no outbound fetch', async () => {
    await demoSupabaseClient.rpc('ensure_initial_workspace');
    await demoSupabaseClient.rpc('dashboard_task_counts');
    await demoSupabaseClient.rpc('reset_demo_workspace');
    await demoSupabaseClient.rpc('demo_heartbeat');
    await demoSupabaseClient.rpc('assignee_unique_task_counts');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('auth surface never makes outbound calls', async () => {
    await demoSupabaseClient.auth.getSession();
    await demoSupabaseClient.auth.getUser();
    await demoSupabaseClient.auth.signInAnonymously();
    await demoSupabaseClient.auth.signOut();
    await demoSupabaseClient.auth.signInWithPassword();
    await demoSupabaseClient.auth.signInWithOAuth();
    await demoSupabaseClient.auth.signUp();
    await demoSupabaseClient.auth.resetPasswordForEmail();
    await demoSupabaseClient.auth.updateUser();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    if (beaconSpy) expect(beaconSpy).not.toHaveBeenCalled();
  });

  it('functions.invoke and storage operations fail gracefully without network', async () => {
    const fnRes = await demoSupabaseClient.functions.invoke('admin', { body: {} });
    const stRes = await demoSupabaseClient.storage.from('avatars').upload();
    const dlRes = await demoSupabaseClient.storage.from('avatars').download();
    expect(fnRes.error).not.toBeNull();
    expect(stRes.error).not.toBeNull();
    expect(dlRes.error).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('demo session never carries a real-looking email', async () => {
    const { data } = await demoSupabaseClient.auth.getSession();
    const session = (data as { session: { user: { email: string; is_anonymous: boolean } } }).session;
    expect(session.user.email).toMatch(/@motio\.local$|@demo\.local$/);
    expect(session.user.email).not.toContain('gmail');
    expect(session.user.is_anonymous).toBe(true);
  });

  it('demo workspace and user ids are freshly generated and not predictable across sessions', () => {
    const firstUserId = demoStore.user().id;
    const firstWsId = demoStore.workspaceId();
    demoStore.__reset();
    const secondUserId = demoStore.user().id;
    const secondWsId = demoStore.workspaceId();
    expect(firstUserId).not.toBe(secondUserId);
    expect(firstWsId).not.toBe(secondWsId);
    // Hex-style UUID — never an email, never a known prod identifier.
    expect(firstUserId).toMatch(/^demo-user-[0-9a-f-]+$/i);
  });

  it('the persisted state contains no prod-looking identifiers', () => {
    // Force a hydrate so sessionStorage is populated.
    demoStore.get();
    const raw = window.sessionStorage.getItem('motio.demo.state.v1');
    expect(raw).not.toBeNull();
    // Lifted directly from the user's bug report, plus generic prod
    // hostnames that should never appear in demo persisted state.
    const forbidden = ['eleron96', '@gmail.com', 'motio.nikog.net', 'sb-auth-token'];
    forbidden.forEach((needle) => {
      expect(raw).not.toContain(needle);
    });
  });

  it('mock query results are deep-cloned — caller cannot mutate the store via the response', async () => {
    const wsId = demoStore.workspaceId();
    const before = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .eq('workspace_id', wsId);
    const rows = before.data as Array<{ id: string; title: string }>;
    const originalTitle = rows[0].title;
    rows[0].title = 'PWNED via response mutation';
    const after = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .eq('workspace_id', wsId)
      .eq('id', rows[0].id)
      .single();
    expect((after.data as { title: string }).title).toBe(originalTitle);
  });

  it('removeChannel does nothing observable and never throws', async () => {
    const ch = demoSupabaseClient.channel('any');
    await expect(demoSupabaseClient.removeChannel(ch)).resolves.toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
