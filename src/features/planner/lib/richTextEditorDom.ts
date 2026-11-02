import { sanitizeTaskRichText } from '@/shared/lib/sanitizer';
import { hasRichTags } from '@/shared/domain/taskDescription';

// DOM work of the rich-text editor (a contenteditable div): reading and writing
// its value, the picture wrappers it keeps around <img>, and caret placement.

export const MIN_IMAGE_WIDTH = 120;
const DEFAULT_IMAGE_SCALE = 0.7;

const normalizePlainText = (text: string) => text.replace(/\u00a0/g, ' ');

const isEmptyText = (text: string) => normalizePlainText(text).trim().length === 0;

/** The editor's HTML without its own picture wrappers and resize handles. */
const sanitizeEditorHtml = (editor: HTMLDivElement) => {
  const clone = editor.cloneNode(true) as HTMLDivElement;
  clone.querySelectorAll('.rte-image-handle').forEach((node) => node.remove());
  clone.querySelectorAll('.rte-image').forEach((wrapper) => {
    const img = wrapper.querySelector('img');
    if (img) {
      wrapper.replaceWith(img);
    } else {
      wrapper.remove();
    }
  });
  return sanitizeTaskRichText(clone.innerHTML);
};

/** What the editor holds: rich HTML when it has formatting, plain text otherwise. */
export const extractEditorValue = (editor: HTMLDivElement) => {
  const html = sanitizeEditorHtml(editor);
  const text = editor.innerText ?? '';
  const hasImages = /<img\b/i.test(html);
  if (!hasImages && isEmptyText(text)) {
    return '';
  }
  return hasRichTags(html) ? html : normalizePlainText(text);
};

export const setEditorValue = (editor: HTMLDivElement, value: string) => {
  if (!value) {
    editor.innerHTML = '';
    return;
  }
  if (hasRichTags(value)) {
    editor.innerHTML = sanitizeTaskRichText(value);
    return;
  }
  editor.textContent = value;
};

/** A new picture takes 70% of the editor, within sensible bounds. */
export const defaultImageWidth = (editor: HTMLDivElement | null) => {
  const editorWidth = editor?.clientWidth;
  if (!editorWidth) return `${Math.round(DEFAULT_IMAGE_SCALE * 100)}%`;
  const targetWidth = Math.round(editorWidth * DEFAULT_IMAGE_SCALE);
  const maxWidth = Math.max(MIN_IMAGE_WIDTH, editorWidth - 32);
  const safeWidth = Math.min(Math.max(MIN_IMAGE_WIDTH, targetWidth), maxWidth);
  return `${safeWidth}px`;
};

/** Width of a picture being resized from `startWidth` by `delta` pixels. */
export const resizedImageWidth = (startWidth: number, delta: number, editorWidth: number) => {
  const maxWidth = Math.max(MIN_IMAGE_WIDTH, editorWidth - 32);
  return Math.min(Math.max(MIN_IMAGE_WIDTH, startWidth + delta), maxWidth);
};

/** Markup of a picture as the editor keeps it: a draggable wrapper with a resize handle. */
export const buildEditorImageHtml = (src: string, altText: string, width: string) => {
  const safeAlt = altText.replace(/"/g, '&quot;');
  return [
    '<span class="rte-image" contenteditable="false" draggable="true" data-rte-image="true">',
    `<img src="${src}" alt="${safeAlt}" style="width:${width};height:auto;" />`,
    '<span class="rte-image-handle" data-handle="se"></span>',
    '</span>',
  ].join('');
};

/** Gives every <img> loaded from a saved value the wrapper and handle the editor needs. */
export const wrapEditorImages = (editor: HTMLDivElement, defaultWidth: string) => {
  Array.from(editor.querySelectorAll('img')).forEach((img) => {
    let wrapper = img.closest('.rte-image');
    if (!wrapper) {
      const parent = img.parentNode;
      if (!parent) return;
      wrapper = document.createElement('span');
      wrapper.className = 'rte-image';
      wrapper.setAttribute('contenteditable', 'false');
      parent.insertBefore(wrapper, img);
      wrapper.appendChild(img);
    }
    if (wrapper instanceof HTMLElement) {
      wrapper.setAttribute('draggable', 'true');
      wrapper.setAttribute('data-rte-image', 'true');
    }
    if (!wrapper.querySelector('.rte-image-handle')) {
      const handle = document.createElement('span');
      handle.className = 'rte-image-handle';
      handle.setAttribute('data-handle', 'se');
      wrapper.appendChild(handle);
    }
    if (!img.style.width && !img.getAttribute('width')) {
      img.style.width = defaultWidth;
      img.style.height = 'auto';
    }
  });
};

export const getCaretRangeFromPoint = (x: number, y: number) => {
  const caretRangeFromPoint = (document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  }).caretRangeFromPoint;
  if (caretRangeFromPoint) {
    return caretRangeFromPoint.call(document, x, y);
  }
  const position = (document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  }).caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
};

export const hasImageFiles = (dataTransfer?: DataTransfer | null) => {
  if (!dataTransfer) return false;
  const hasImageItem = Array.from(dataTransfer.items ?? [])
    .some((item) => item.kind === 'file' && item.type.startsWith('image/'));
  if (hasImageItem) return true;
  return Array.from(dataTransfer.files ?? [])
    .some((file) => file.type.startsWith('image/'));
};

export const isSelectionInsideList = (editor: HTMLDivElement | null) => {
  const selection = window.getSelection();
  if (!editor || !selection || selection.rangeCount === 0) return false;
  let node: Node | null = selection.getRangeAt(0).startContainer;
  if (!node || !editor.contains(node)) return false;
  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === 'LI' || tag === 'UL' || tag === 'OL') return true;
    }
    node = node.parentNode;
  }
  return false;
};

/** Makes `range` the current selection. */
export const selectRange = (range: Range) => {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
};

/** A collapsed range at the very end of the editor's content. */
export const rangeAtEnd = (editor: HTMLDivElement) => {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
};
