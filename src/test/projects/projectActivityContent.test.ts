/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { sanitizeProjectActivityContent } from '@/features/projects/lib/projectActivityContent';

describe('sanitizeProjectActivityContent', () => {
  describe('emptiness', () => {
    it('returns null for null input', () => {
      expect(sanitizeProjectActivityContent(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(sanitizeProjectActivityContent(undefined)).toBeNull();
    });

    it('returns null for non-string input', () => {
      // @ts-expect-error verifying runtime guard
      expect(sanitizeProjectActivityContent(42)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(sanitizeProjectActivityContent('')).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
      expect(sanitizeProjectActivityContent('   \n\t')).toBeNull();
    });

    it('returns null for tag-only HTML with no content', () => {
      expect(sanitizeProjectActivityContent('<p></p>')).toBeNull();
      expect(sanitizeProjectActivityContent('<p>&nbsp;</p>')).toBeNull();
      expect(sanitizeProjectActivityContent('<div><p></p></div>')).toBeNull();
    });

    it('returns null when allowlist HTML strips down to nothing', () => {
      // `<p>` is in the allowlist, so the detector triggers DOMPurify which
      // removes the inner `<script>` and leaves an empty `<p>` — empty.
      expect(sanitizeProjectActivityContent('<p><script>alert(1)</script></p>')).toBeNull();
    });
  });

  describe('plain text', () => {
    it('preserves trimmed plain text', () => {
      expect(sanitizeProjectActivityContent('  hello world  ')).toBe('hello world');
    });

    it('preserves literal angle-bracket text that is not in the allowlist', () => {
      // `<text>` is not on the rich-text-editor allowlist, so the detector
      // skips DOMPurify and the string is stored verbatim.
      expect(sanitizeProjectActivityContent('plain <text>')).toBe('plain <text>');
    });

    it('preserves prose with measurements like `<200 sq ft>`', () => {
      expect(sanitizeProjectActivityContent('size <200 sq ft>')).toBe('size <200 sq ft>');
    });

    it('preserves multi-line plain text', () => {
      expect(sanitizeProjectActivityContent('line1\nline2')).toBe('line1\nline2');
    });
  });

  describe('XSS', () => {
    it('strips <script> nested inside an allowlisted tag', () => {
      const result = sanitizeProjectActivityContent('<p>hi<script>alert(1)</script></p>');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert(1)');
      expect(result).toContain('hi');
    });

    it('treats a bare <script> as plain text (renderer escapes it)', () => {
      // The detector only matches allowlisted rich-text tags, so a stand-
      // alone `<script>` is stored verbatim. The render path escapes `<` to
      // `&lt;` so it cannot execute — verified in ActivityBlock unit tests.
      const result = sanitizeProjectActivityContent('<script>alert(1)</script>');
      expect(result).toBe('<script>alert(1)</script>');
    });

    it('strips <iframe>', () => {
      const result = sanitizeProjectActivityContent('<p>hi</p><iframe src="http://evil"></iframe>');
      expect(result).not.toContain('<iframe');
    });

    it('strips on* event handlers from allowed tags', () => {
      const result = sanitizeProjectActivityContent('<p onclick="alert(1)">hi</p>');
      expect(result).toContain('hi');
      expect(result).not.toContain('onclick');
    });

    it('strips javascript: URIs in img src', () => {
      // Per DOMPurify default URI regex: javascript: is rejected.
      const result = sanitizeProjectActivityContent(
        '<p>hi</p><img src="javascript:alert(1)">',
      );
      expect(result).not.toContain('javascript:');
    });
  });

  describe('rich content', () => {
    it('keeps allowed formatting tags', () => {
      const html = '<p><b>bold</b> <i>italic</i> <u>under</u> <s>strike</s></p>';
      const result = sanitizeProjectActivityContent(html);
      expect(result).toContain('<b>');
      expect(result).toContain('<i>');
      expect(result).toContain('<u>');
      expect(result).toContain('<s>');
    });

    it('keeps lists and blockquote', () => {
      const html = '<ul><li>one</li><li>two</li></ul><blockquote>quoted</blockquote>';
      const result = sanitizeProjectActivityContent(html);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>one</li>');
      expect(result).toContain('<blockquote>');
    });

    it('keeps an image-only entry as non-empty', () => {
      const result = sanitizeProjectActivityContent('<p><img src="https://example.com/a.png" alt="a"></p>');
      expect(result).toContain('<img');
      expect(result).toContain('src="https://example.com/a.png"');
    });

    it('keeps an image even when surrounding text is empty', () => {
      const result = sanitizeProjectActivityContent('<img src="https://example.com/a.png">');
      expect(result).toContain('<img');
    });
  });
});
