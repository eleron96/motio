import { supabase } from '@/shared/lib/supabaseClient';

const trimTrailingSlash = (v: string) => v.replace(/\/+$/, '');

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
      'X-File-Name': file.name,
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
