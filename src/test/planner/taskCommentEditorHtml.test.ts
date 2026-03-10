import { describe, expect, it } from 'vitest';
import {
  hasTaskCommentRichTags,
  normalizeTaskCommentEditorHtml,
  normalizeTaskCommentPlainText,
} from '@/features/planner/lib/taskCommentEditorHtml';

describe('taskCommentEditorHtml', () => {
  it('normalizes non-breaking spaces in plain text', () => {
    expect(normalizeTaskCommentPlainText('hello\u00a0world')).toBe('hello world');
  });

  it('detects rich comment markup', () => {
    expect(hasTaskCommentRichTags('plain text')).toBe(false);
    expect(hasTaskCommentRichTags('<span data-mention-user-id="1">@Jane</span>')).toBe(true);
  });

  it('removes trailing empty paragraph blocks added by contenteditable', () => {
    expect(normalizeTaskCommentEditorHtml('<div>Hello</div><div><br></div>')).toBe('Hello');
  });

  it('preserves an intentional blank line between paragraphs', () => {
    expect(
      normalizeTaskCommentEditorHtml('<div>Hello</div><div><br></div><div>World</div>'),
    ).toBe('Hello<br><br>World');
  });
});
