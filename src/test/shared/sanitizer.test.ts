import { describe, expect, it } from 'vitest';
import { sanitizeCommentRichText, sanitizeTaskRichText } from '@/shared/lib/sanitizer';

// Regression guard for the DOMPurify config: a dependency bump or an accidental
// ALLOWED_ATTR/ALLOWED_URI_REGEXP change must not reopen these XSS vectors.
describe('sanitizeTaskRichText', () => {
  it('strips <script> tags', () => {
    const sanitized = sanitizeTaskRichText('<strong>ok</strong><script>alert(1)</script>');

    expect(sanitized).toContain('<strong>ok</strong>');
    expect(sanitized).not.toContain('<script');
  });

  it('strips inline event handlers but keeps the element', () => {
    const sanitized = sanitizeTaskRichText('<img src="x" onerror="alert(1)">');

    expect(sanitized).toContain('<img');
    expect(sanitized).not.toContain('onerror');
  });

  it('drops javascript: URIs from img src', () => {
    const sanitized = sanitizeTaskRichText('<img src="javascript:alert(1)">');

    expect(sanitized).not.toContain('javascript:');
  });

  it('removes <iframe> embeds', () => {
    const sanitized = sanitizeTaskRichText('<iframe src="https://evil.example"></iframe>');

    expect(sanitized).not.toContain('<iframe');
  });
});

describe('sanitizeCommentRichText', () => {
  it('keeps mention metadata but strips event handlers', () => {
    const sanitized = sanitizeCommentRichText(
      '<span data-mention-user-id="u1" onclick="steal()">@alex</span>',
    );

    expect(sanitized).toContain('data-mention-user-id="u1"');
    expect(sanitized).toContain('@alex');
    expect(sanitized).not.toContain('onclick');
  });
});
