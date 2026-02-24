import { describe, expect, it } from 'vitest';
import { hasRichTags, sanitizeTaskDescription } from '@/shared/domain/taskDescription';

describe('taskDescription', () => {
  it('detects rich-text html tags', () => {
    expect(hasRichTags('plain text')).toBe(false);
    expect(hasRichTags('<strong>bold</strong>')).toBe(true);
  });

  it('removes disallowed markup and keeps allowed tags', () => {
    const sanitized = sanitizeTaskDescription('<script>alert(1)</script><strong>ok</strong>');
    expect(sanitized).toContain('<strong>ok</strong>');
    expect(sanitized).not.toContain('<script>');
  });
});
