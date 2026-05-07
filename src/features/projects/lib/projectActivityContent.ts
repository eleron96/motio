import { sanitizeCommentRichText } from '@/shared/lib/sanitizer';

const HTML_TAG_RE = /<\/?[a-z][\s\S]*?>/i;
const IMG_TAG_RE = /<img\b/i;
const ALL_TAGS_RE = /<[^>]+>/g;
const NBSP_RE = /&nbsp;/gi;

/**
 * Normalize a `project_activity.content` payload that may arrive as plain
 * text or rich HTML from the rich-text editor.
 *
 * Returns a sanitized string ready for storage, or `null` if the content is
 * effectively empty (whitespace, empty tags like `<p>&nbsp;</p>`, etc.).
 *
 * The sanitizer allowlist matches `sanitizeCommentRichText` (no scripts, no
 * iframes, no event handlers, no `javascript:` URIs).
 *
 * Plain-text input bypasses DOMPurify so user input like `<not really html>`
 * is preserved as plain text by the caller (we detect tags only when the
 * input contains a real opening or closing tag like `<b>` or `</p>`).
 */
export const sanitizeProjectActivityContent = (raw: string | null | undefined): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const looksLikeHtml = HTML_TAG_RE.test(trimmed);
  const sanitized = looksLikeHtml ? sanitizeCommentRichText(trimmed) : trimmed;
  if (!sanitized) return null;
  if (IMG_TAG_RE.test(sanitized)) return sanitized;
  const textOnly = sanitized.replace(ALL_TAGS_RE, '').replace(NBSP_RE, ' ').trim();
  if (!textOnly) return null;
  return sanitized;
};
