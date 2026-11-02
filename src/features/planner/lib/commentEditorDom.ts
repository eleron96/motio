// DOM work of the comment editor: its value, the caret and text ranges the
// @-mention picker needs.

import { sanitizeCommentRichText } from '@/shared/lib/sanitizer';
import {
  hasTaskCommentRichTags,
  normalizeTaskCommentEditorHtml,
  normalizeTaskCommentPlainText,
} from '@/features/planner/lib/taskCommentEditorHtml';
import { sanitizeCommentHtml } from '@/infrastructure/tasks/taskCommentsRepository';

const isEmpty = (text: string) => normalizeTaskCommentPlainText(text).trim().length === 0;

export const setEditorValue = (editor: HTMLDivElement, value: string) => {
  if (!value) { editor.innerHTML = ''; return; }
  if (hasTaskCommentRichTags(value)) { editor.innerHTML = sanitizeCommentHtml(value); return; }
  editor.textContent = value;
};

export const getSelectionRangeWithinEditor = (editor: HTMLDivElement): Range | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
};

export const isVisibleRect = (
  rect: Pick<DOMRect, 'width' | 'height' | 'top' | 'left'> | null | undefined,
) => {
  if (!rect) return false;
  return (
    (rect.width > 0) ||
    (rect.height > 0) ||
    (rect.top > 0) ||
    (rect.left > 0)
  );
};

export const getEditorTextBeforeCaret = (editor: HTMLDivElement, range: Range): string => {
  const prefixRange = range.cloneRange();
  prefixRange.selectNodeContents(editor);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  return normalizeTaskCommentPlainText(prefixRange.cloneContents().textContent ?? '');
};

const getTextNodePosition = (editor: HTMLDivElement, textOffset: number) => {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  let node = walker.nextNode();
  let lastTextNode: Text | null = null;

  while (node) {
    const textNode = node as Text;
    const textLength = textNode.textContent?.length ?? 0;
    if (textOffset <= traversed + textLength) {
      return {
        node: textNode,
        offset: Math.max(0, textOffset - traversed),
      };
    }
    traversed += textLength;
    lastTextNode = textNode;
    node = walker.nextNode();
  }

  if (!lastTextNode) return null;
  return {
    node: lastTextNode,
    offset: lastTextNode.textContent?.length ?? 0,
  };
};

export const createEditorTextRange = (editor: HTMLDivElement, startOffset: number, endOffset: number) => {
  const start = getTextNodePosition(editor, startOffset);
  const end = getTextNodePosition(editor, endOffset);
  if (!start || !end) return null;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
};

export const extractEditorValue = (editor: HTMLDivElement): string => {
  const clone = editor.cloneNode(true) as HTMLDivElement;
  clone.querySelectorAll('.rte-image-handle').forEach((n) => n.remove());
  clone.querySelectorAll('.rte-image').forEach((wrapper) => {
    const img = wrapper.querySelector('img');
    if (img) wrapper.replaceWith(img); else wrapper.remove();
  });
  const html = sanitizeCommentRichText(normalizeTaskCommentEditorHtml(clone.innerHTML));
  const text = editor.innerText ?? '';
  const hasImages = /<img\b/i.test(html);
  if (!hasImages && isEmpty(text)) return '';
  return hasTaskCommentRichTags(html) ? html : normalizeTaskCommentPlainText(text);
};

// ─────────────────────────────────────────────────────────────────────────────
// CommentEditor
// ─────────────────────────────────────────────────────────────────────────────
