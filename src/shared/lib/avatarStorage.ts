import { supabase } from '@/shared/lib/supabaseClient';

const BUCKET = 'avatars';
const MAX_SIZE = 512; // px
const QUALITY = 0.85;

/**
 * Resizes an image file to MAX_SIZE×MAX_SIZE using Canvas API (client-side compression).
 * Returns a Blob ready for upload.
 */
const resizeImage = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = MAX_SIZE;
      canvas.height = MAX_SIZE;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.drawImage(img, sx, sy, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/jpeg',
        QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image load failed'));
    };

    img.src = objectUrl;
  });

const avatarPath = (userId: string) => `${userId}/avatar.jpg`;

/**
 * Returns the public URL for a user's avatar, or null if no avatar stored.
 */
export const getAvatarPublicUrl = (userId: string): string => {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(avatarPath(userId));
  return data.publicUrl;
};

/**
 * Compresses the image, uploads it to Supabase Storage, and saves the URL to profiles.
 * Returns the new public URL or an error string.
 */
export const uploadAvatar = async (
  userId: string,
  file: File,
): Promise<{ url?: string; error?: string }> => {
  let blob: Blob;
  try {
    blob = await resizeImage(file);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const path = avatarPath(userId);

  let uploadResult: Awaited<ReturnType<ReturnType<typeof supabase.storage.from>['upload']>>;
  try {
    uploadResult = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
  } catch (e) {
    // Supabase Storage SDK can throw (instead of returning { error })
    // when the server responds with non-JSON (e.g. bucket not found, gateway error).
    const raw = (e as Error).message ?? '';
    const isJsonParse = raw.includes('not valid JSON') || raw.includes('Unexpected token');
    return { error: isJsonParse ? 'Storage service unavailable. Please try again later.' : raw };
  }

  if (uploadResult.error) return { error: uploadResult.error.message };

  // Cache-bust so the browser fetches the new image even if URL is the same.
  const cacheBust = Date.now();
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = `${urlData.publicUrl}?v=${cacheBust}`;

  const { error: dbError } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId);

  if (dbError) return { error: dbError.message };

  return { url };
};

/**
 * Removes the avatar from Storage and clears avatar_url in profiles.
 */
export const deleteAvatar = async (userId: string): Promise<{ error?: string }> => {
  let removeResult: Awaited<ReturnType<ReturnType<typeof supabase.storage.from>['remove']>>;
  try {
    removeResult = await supabase.storage.from(BUCKET).remove([avatarPath(userId)]);
  } catch (e) {
    const raw = (e as Error).message ?? '';
    const isJsonParse = raw.includes('not valid JSON') || raw.includes('Unexpected token');
    return { error: isJsonParse ? 'Storage service unavailable. Please try again later.' : raw };
  }

  if (removeResult.error) return { error: removeResult.error.message };

  const { error: dbError } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId);

  if (dbError) return { error: dbError.message };

  return {};
};
