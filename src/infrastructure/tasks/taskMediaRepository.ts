import { supabase } from '@/shared/lib/supabaseClient';

const trimTrailingSlash = (v: string) => v.replace(/\/+$/, '');
const UTF8_HEADER_PREFIX = 'utf8:';

const encodeFileNameHeader = (fileName: string) => {
  const normalized = fileName.trim();
  if (!normalized) return '';
  return `${UTF8_HEADER_PREFIX}${encodeURIComponent(normalized)}`;
};

/**
 * Uploads an image file to the task-media Supabase Function.
 * Returns the public download URL (includes a signed token).
 * Throws an Error with a human-readable message on failure.
 */
export const uploadTaskMedia = async (workspaceId: string, file: File): Promise<string> => {
  const wsId = workspaceId.trim();
  if (!wsId) throw new Error('Workspace is not selected.');

  const supabaseUrl = trimTrailingSlash(
    (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  );
  if (!supabaseUrl) throw new Error('Upload service is not configured.');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${supabaseUrl}/functions/v1/task-media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-Workspace-Id': wsId,
      'X-File-Name': encodeFileNameHeader(file.name),
    },
    body: file,
  });

  const payload = await res.json().catch(
    () => ({} as { error?: string; id?: string; token?: string }),
  );

  if (!res.ok) throw new Error(payload.error ?? `Upload failed (${res.status})`);
  if (typeof payload.id !== 'string' || typeof payload.token !== 'string') {
    throw new Error('Invalid upload response.');
  }

  return `${supabaseUrl}/functions/v1/task-media/${encodeURIComponent(payload.id)}?token=${encodeURIComponent(payload.token)}`;
};

/**
 * Deletes a single task-media record (and its Storage blob) via the edge function.
 * Swallows failures by default and returns `false` — callers (task save, task
 * delete) should never be blocked by media GC hiccups.
 */
export const deleteTaskMedia = async (mediaId: string): Promise<boolean> => {
  const id = mediaId.trim();
  if (!id) return false;

  const supabaseUrl = trimTrailingSlash(
    (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  );
  if (!supabaseUrl) return false;

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;

    const res = await fetch(
      `${supabaseUrl}/functions/v1/task-media/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return res.ok;
  } catch (error) {
    console.warn('[taskMedia] delete failed', { mediaId: id, error });
    return false;
  }
};

export const deleteTaskMediaBatch = async (mediaIds: string[]): Promise<void> => {
  const unique = Array.from(new Set(mediaIds.map((id) => id.trim()).filter(Boolean)));
  if (unique.length === 0) return;
  await Promise.allSettled(unique.map((id) => deleteTaskMedia(id)));
};
