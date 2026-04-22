import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
    },
  },
}));

import {
  deleteTaskMedia,
  deleteTaskMediaBatch,
  uploadTaskMedia,
} from '@/infrastructure/tasks/taskMediaRepository';

describe('taskMediaRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uploads through the task-media edge function and returns the tokenized URL', async () => {
    authMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'media-1', token: 'download-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const url = await uploadTaskMedia(' ws-1 ', file);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/task-media',
      expect.objectContaining({
        method: 'POST',
        body: file,
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
          'Content-Type': 'image/png',
          'X-Workspace-Id': 'ws-1',
          'X-File-Name': 'utf8:photo.png',
        }),
      }),
    );
    expect(url).toBe('https://example.supabase.co/functions/v1/task-media/media-1?token=download-token');
  });

  it('encodes non-ascii file names before sending them as headers', async () => {
    authMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'media-2', token: 'download-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['image'], 'фото.png', { type: 'image/png' });
    await uploadTaskMedia('ws-1', file);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/task-media',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-File-Name': 'utf8:%D1%84%D0%BE%D1%82%D0%BE.png',
        }),
      }),
    );
  });

  it('throws the backend error message when upload fails', async () => {
    authMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Workspace storage quota exceeded.' }), {
        status: 413,
        headers: { 'content-type': 'application/json' },
      }),
    ));

    const file = new File(['image'], 'photo.png', { type: 'image/png' });

    await expect(uploadTaskMedia('ws-1', file)).rejects.toThrow('Workspace storage quota exceeded.');
  });

  it('fails early when the workspace is missing', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });

    await expect(uploadTaskMedia('   ', file)).rejects.toThrow('Workspace is not selected.');
  });
});

describe('deleteTaskMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/');
    authMocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'session-token' } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('issues a DELETE request to the task-media edge function and returns true on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteTaskMedia('media-42');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/task-media/media-42',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
        }),
      }),
    );
  });

  it('percent-encodes the media id in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteTaskMedia('id with space');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/task-media/id%20with%20space',
      expect.anything(),
    );
  });

  it('returns false when the backend responds with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    expect(await deleteTaskMedia('media-1')).toBe(false);
  });

  it('returns false (and does not throw) when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await deleteTaskMedia('media-1')).toBe(false);
    warnSpy.mockRestore();
  });

  it('returns false when there is no authenticated session', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await deleteTaskMedia('media-1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false for empty ids without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await deleteTaskMedia('  ')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleteTaskMediaBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/');
    authMocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'session-token' } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('deletes each unique id in parallel and swallows per-item failures', async () => {
    const responses: Record<string, Response> = {
      a: new Response('{}', { status: 200 }),
      b: new Response('{}', { status: 500 }),
    };
    const fetchMock = vi.fn((url: string) => {
      const id = decodeURIComponent(url.split('/').pop() ?? '');
      return Promise.resolve(responses[id] ?? new Response('{}', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await deleteTaskMediaBatch(['a', 'b', 'a']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calledUrls = fetchMock.mock.calls.map((call) => call[0]).sort();
    expect(calledUrls).toEqual([
      'https://example.supabase.co/functions/v1/task-media/a',
      'https://example.supabase.co/functions/v1/task-media/b',
    ]);
  });

  it('does nothing for an empty list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await deleteTaskMediaBatch([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
