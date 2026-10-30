/**
 * SHA-256 of a text as lowercase hex — the same value Postgres gives for
 * encode(sha256(convert_to(text, 'UTF8')), 'hex'). Used to ask the server to
 * write only while it still holds the text the person started from.
 */
export const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
