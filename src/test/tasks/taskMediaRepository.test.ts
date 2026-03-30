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

import { uploadTaskMedia } from '@/infrastructure/tasks/taskMediaRepository';

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
