import { sanitizeCommentRichText } from '@/shared/lib/sanitizer';
import {
  ACTIVITY_HTML_TAG_RE,
  ALL_TAGS_RE,
  IMG_TAG_RE,
} from '@/features/projects/lib/projectActivityContent';

// How project notes are shown: the clamped feed preview, the search snippet
// and the full body in the read modal. What is stored is decided in
// projectActivityContent.ts.

export const isContentMeaningful = (raw: string) => {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (IMG_TAG_RE.test(trimmed)) return true;
  const text = trimmed.replace(ALL_TAGS_RE, '').replace(/&nbsp;/gi, ' ').trim();
  return text.length > 0;
};

export const stripHtmlForSearch = (raw: string) => {
  if (!ACTIVITY_HTML_TAG_RE.test(raw)) return raw;
  return raw.replace(ALL_TAGS_RE, ' ').replace(/&nbsp;/gi, ' ');
};

const escapeHtml = (raw: string): string => (
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
);

/**
 * Build an HTML fragment that shows a snippet of `content` centered on the
 * first occurrence of `query`, with the matched substring wrapped in `<mark>`.
 * Adds `…` ellipses when the snippet is trimmed at either edge.
 *
 * Returns `null` when there is no match — callers can fall back to the regular
 * note body in that case.
 */
export const buildSearchSnippetHtml = (content: string, query: string): string | null => {
  const text = stripHtmlForSearch(content).replace(/\s+/g, ' ').trim();
  if (!text || !query) return null;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return null;
  const CONTEXT_BEFORE = 40;
  const CONTEXT_AFTER = 80;
  const start = Math.max(0, idx - CONTEXT_BEFORE);
  const end = Math.min(text.length, idx + query.length + CONTEXT_AFTER);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const before = escapeHtml(text.slice(start, idx));
  const matched = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length, end));
  return `${prefix}${before}<mark>${matched}</mark>${after}${suffix}`;
};

export const renderRichTextHtml = (raw: string) => {
  if (!raw) return { __html: '' };
  if (ACTIVITY_HTML_TAG_RE.test(raw)) {
    // For the read-modal we trust the editor's HTML wholesale (after
    // DOMPurify): block structure (p/div/ul/ol/li/blockquote) survives,
    // inline formatting (b/strong/i/em/u/s/strike/span/img) survives. The
    // wrapper `.feedRichText` class in projectCard.module.css provides the
    // visual styling for every allowed tag (list bullets, blockquote
    // indent, bold/italic/underline, image clamping). Previous versions
    // flattened block tags to `<br>` to dodge browser-specific spacing,
    // but that killed list markers + quote indents entirely, so the user
    // saw no formatting outside edit mode.
    return { __html: sanitizeCommentRichText(raw) };
  }
  // Plain text — preserve newlines via <br>. Escapes literal angle brackets
  // so user input like `<200 sq ft>` renders as text rather than vanishing
  // (it doesn't match the allowlist regex above, so we land here).
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return { __html: escaped };
};

/**
 * Build the HTML snippet for a feed row (the compact preview under each
 * entry). Keeps inline formatting (`<b>`, `<strong>`, `<i>`, `<em>`, `<u>`,
 * `<s>`, `<strike>`, `<span>`) so users see bold / italic / underline /
 * strike at a glance — same way a chat list shows formatted messages.
 *
 * Block tags (`<p>`, `<div>`, `<blockquote>`, `<li>`, `<h1-6>`) collapse to
 * `<br>` for line breaks. Images and list containers (`<ul>`, `<ol>`) are
 * stripped — bullets/numbers would break `-webkit-line-clamp` and images
 * don't belong in a tight preview row anyway. Users see the full version
 * in the modal.
 *
 * Why inline-only: `-webkit-box` + `-webkit-line-clamp` (the only cross-
 * browser N-line clamp) only honours inline children. Block descendants
 * break the clamp silently. So we flatten everything to one inline run
 * with `<br>` line breaks, which clamps reliably across browsers.
 */
export const buildFeedSnippetHtml = (raw: string, blockquoteClass: string): string => {
  if (!raw) return '';
  if (!ACTIVITY_HTML_TAG_RE.test(raw)) {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }
  const sanitized = sanitizeCommentRichText(raw);
  // Wrap blockquote in an inline <span> with our CSS-module class so we keep
  // a visible "this is a quote" indicator (italic + left border) inside the
  // clamped row. A block <blockquote> would break `-webkit-line-clamp`, so we
  // demote it to inline + use border-left on inline-block via CSS.
  return sanitized
    // Literal newlines (notes saved as rich HTML can still carry "\n" inside
    // text nodes) become explicit <br> so the clamped preview keeps the breaks
    // instead of collapsing them onto one line — matching the plain-text path.
    .replace(/\n/g, '<br>')
    .replace(/<blockquote[^>]*>/gi, `<span class="${blockquoteClass}">`)
    .replace(/<\/blockquote>/gi, '</span><br>')
    // Other block boundaries become explicit <br>.
    .replace(/<\/(p|div|li|h[1-6])>/gi, '<br>')
    // Drop block-opening tags + list containers + images — keep inline
    // formatting (b/strong/i/em/u/s/strike/span).
    .replace(/<(p|div|li|ul|ol|h[1-6])[^>]*>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    // Cap consecutive <br>s so multi-paragraph entries don't eat the
    // whole 5-line clamp window with blank lines.
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    // Trim leading/trailing whitespace and <br>s.
    .replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '');
};

/** The clamped preview drops pictures, so the feed marks notes that carry one. */
export const hasActivityImage = (raw: string) => IMG_TAG_RE.test(raw);
