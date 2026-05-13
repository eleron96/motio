import { sanitizeCommentRichText } from '@/shared/lib/sanitizer';

/**
 * Detector for "this string looks like rich-text HTML we should sanitize".
 *
 * We match only the explicit allowlist of tags supported by the rich-text
 * editor + sanitizer. This way prose with literal angle brackets like
 * `<200 sq ft>` does NOT trigger DOMPurify (which would parse and drop it),
 * while real `<b>`, `<p>`, `<img>`, etc. still do.
 */
export const ACTIVITY_HTML_TAG_RE = (
  /<\/?(?:b|strong|i|em|u|s|strike|ul|ol|li|blockquote|br|div|p|span|img)\b/i
);
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
  const looksLikeHtml = ACTIVITY_HTML_TAG_RE.test(trimmed);
  const sanitized = looksLikeHtml ? sanitizeCommentRichText(trimmed) : trimmed;
  if (!sanitized) return null;
  if (IMG_TAG_RE.test(sanitized)) return sanitized;
  const textOnly = sanitized.replace(ALL_TAGS_RE, '').replace(NBSP_RE, ' ').trim();
  if (!textOnly) return null;
  return sanitized;
};
