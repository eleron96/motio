import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Image } from 'lucide-react';
import { sanitizeTaskRichText } from '@/shared/lib/sanitizer';
import { normalizePastedTaskHtml } from '@/shared/lib/pastedRichText';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/classNames';
import { uploadTaskMedia } from '@/infrastructure/tasks/taskMediaRepository';
import { t } from '@lingui/macro';

interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  workspaceId?: string | null;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Move focus into the editor on mount and place the caret at the end of
   * the existing content. Useful for composers that should accept paste /
   * typing immediately when opened.
   */
  autoFocus?: boolean;
  /**
   * Render the toolbar and the editable area inside a single bordered frame
   * (task-composer style) instead of two stacked blocks. Hides the inline
   * drag-and-drop hint — the parent provides its own.
   */
  framed?: boolean;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MIN_IMAGE_WIDTH = 120;
const DEFAULT_IMAGE_SCALE = 0.7;

const hasRichTags = (value: string) => (
  /<\/?(b|strong|i|em|u|s|strike|ul|ol|li|blockquote|br|div|p|span|img)\b/i.test(value)
);

const normalizePlainText = (text: string) => text.replace(/\u00a0/g, ' ');

const isEmptyText = (text: string) => normalizePlainText(text).trim().length === 0;

const sanitizeHtml = sanitizeTaskRichText;

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
  return sanitizeHtml(clone.innerHTML);
};

const extractEditorValue = (editor: HTMLDivElement) => {
  const html = sanitizeEditorHtml(editor);
  const text = editor.innerText ?? '';
  const hasImages = /<img\b/i.test(html);
  if (!hasImages && isEmptyText(text)) {
    return '';
  }
  return hasRichTags(html) ? html : normalizePlainText(text);
};

const setEditorValue = (editor: HTMLDivElement, value: string) => {
  if (!value) {
    editor.innerHTML = '';
    return;
  }
  if (hasRichTags(value)) {
    editor.innerHTML = sanitizeHtml(value);
    return;
  }
  editor.textContent = value;
};

// Mockup-style toolbar: related commands sit in groups separated by a thin
// vertical divider (text formatting | lists | blocks).
const toolbarGroups = [
  [
    { label: 'Bold', command: 'bold', icon: Bold },
    { label: 'Italic', command: 'italic', icon: Italic },
    { label: 'Underline', command: 'underline', icon: Underline },
    { label: 'Strike', command: 'strikeThrough', icon: Strikethrough },
  ],
  [
    { label: 'Bulleted list', command: 'insertUnorderedList', icon: List },
    { label: 'Numbered list', command: 'insertOrderedList', icon: ListOrdered },
  ],
  [
    { label: 'Quote', command: 'formatBlock', value: 'blockquote', icon: Quote },
  ],
] as Array<Array<{ label: string; command: string; value?: string; icon: typeof Bold }>>;

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  id,
  value,
  onChange,
  workspaceId,
  onBlur,
  placeholder,
  disabled = false,
  className,
  autoFocus = false,
  framed = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const resizeStateRef = useRef<{
    img: HTMLImageElement;
    startX: number;
    startY: number;
    startWidth: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const draggingImageRef = useRef<HTMLSpanElement | null>(null);
  const dragDepthRef = useRef(0);
  const contextImageRef = useRef<HTMLImageElement | null>(null);
  const lastValueRef = useRef(value);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const syncFromEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = extractEditorValue(editor);
    if (!nextValue && editor.innerHTML !== '') {
      editor.innerHTML = '';
    }
    if (nextValue === lastValueRef.current) return;
    lastValueRef.current = nextValue;
    onChange(nextValue);
  }, [onChange]);

  const applyCommand = useCallback((command: string, commandValue?: string) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, commandValue);
    syncFromEditor();
  }, [disabled, syncFromEditor]);

  const saveSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedSelectionRef.current = range;
  }, []);

  const restoreSelection = useCallback(() => {
    const selection = window.getSelection();
    const range = savedSelectionRef.current;
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const getDefaultImageWidth = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return `${Math.round(DEFAULT_IMAGE_SCALE * 100)}%`;
    const editorWidth = editor.clientWidth;
    if (!editorWidth) return `${Math.round(DEFAULT_IMAGE_SCALE * 100)}%`;
    const targetWidth = Math.round(editorWidth * DEFAULT_IMAGE_SCALE);
    const maxWidth = Math.max(MIN_IMAGE_WIDTH, editorWidth - 32);
    const safeWidth = Math.min(Math.max(MIN_IMAGE_WIDTH, targetWidth), maxWidth);
    return `${safeWidth}px`;
  }, []);

  const getCaretRangeFromPoint = useCallback((x: number, y: number) => {
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
  }, []);

  const hasImageFiles = useCallback((dataTransfer?: DataTransfer | null) => {
    if (!dataTransfer) return false;
    const hasImageItem = Array.from(dataTransfer.items ?? [])
      .some((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (hasImageItem) return true;
    return Array.from(dataTransfer.files ?? [])
      .some((file) => file.type.startsWith('image/'));
  }, []);

  const insertImage = useCallback((src: string, altText: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    restoreSelection();
    editor.focus();
    const safeAlt = altText.replace(/"/g, '&quot;');
    const defaultWidth = getDefaultImageWidth();
    const html = [
      '<span class="rte-image" contenteditable="false" draggable="true" data-rte-image="true">',
      `<img src="${src}" alt="${safeAlt}" style="width:${defaultWidth};height:auto;" />`,
      '<span class="rte-image-handle" data-handle="se"></span>',
      '</span>',
    ].join('');
    document.execCommand('insertHTML', false, html);
    saveSelection();
    syncFromEditor();
  }, [getDefaultImageWidth, restoreSelection, saveSelection, syncFromEditor]);

  const uploadTaskImage = useCallback(async (file: File) => {
    return uploadTaskMedia(workspaceId?.trim() ?? '', file);
  }, [workspaceId]);

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_IMAGE_SIZE) {
      toast(t`File is too large`, {
        description: t`Maximum image size is 5 MB.`,
      });
      return;
    }

    try {
      const uploadedUrl = await uploadTaskImage(file);
      insertImage(uploadedUrl, file.name || 'Image');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast(t`Failed to upload image`, message ? { description: message } : undefined);
    }
  }, [insertImage, uploadTaskImage]);

  useEffect(() => {
    if (!autoFocus) return;
    const editor = editorRef.current;
    if (!editor) return;
    // Defer focus by a frame so the parent's open animation doesn't steal it,
    // and place the caret at the very end of any pre-existing content so the
    // user can paste / type immediately.
    const id = window.requestAnimationFrame(() => {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [autoFocus]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastValueRef.current && editor.innerHTML !== '') return;
    setEditorValue(editor, value);
    lastValueRef.current = value;
    const defaultWidth = getDefaultImageWidth();
    const images = Array.from(editor.querySelectorAll('img'));
    images.forEach((img) => {
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
  }, [getDefaultImageWidth, value]);

  useEffect(() => {
    if (!disabled) return;
    dragDepthRef.current = 0;
    setIsFileDragOver(false);
  }, [disabled]);

  const handleResizeMove = useCallback((event: PointerEvent) => {
    const state = resizeStateRef.current;
    if (!state) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    const delta = Math.max(deltaX, deltaY);
    const editorWidth = editorRef.current?.clientWidth ?? state.startWidth;
    const maxWidth = Math.max(MIN_IMAGE_WIDTH, editorWidth - 32);
    const nextWidth = Math.min(
      Math.max(MIN_IMAGE_WIDTH, state.startWidth + delta),
      maxWidth,
    );
    state.img.style.width = `${Math.round(nextWidth)}px`;
    state.img.style.height = 'auto';
  }, []);

  const handleResizeEnd = useCallback(() => {
    window.removeEventListener('pointermove', handleResizeMove);
    window.removeEventListener('pointerup', handleResizeEnd);
    resizeStateRef.current = null;
    syncFromEditor();
  }, [handleResizeMove, syncFromEditor]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    contextImageRef.current = null;
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.rte-image-menu')) return;
      closeContextMenu();
    };
    const handleScroll = () => closeContextMenu();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeContextMenu, contextMenu]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!contextMenu || !menuRef.current || !container) return;
    const rect = menuRef.current.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const padding = 8;
    let nextX = contextMenu.x;
    let nextY = contextMenu.y;
    const maxX = containerRect.width - rect.width - padding;
    const maxY = containerRect.height - rect.height - padding;
    if (nextX > maxX) {
      nextX = Math.max(padding, maxX);
    }
    if (nextY > maxY) {
      nextY = Math.max(padding, maxY);
    }
    if (nextX < padding) nextX = padding;
    if (nextY < padding) nextY = padding;
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu({ x: nextX, y: nextY });
    }
  }, [contextMenu]);

  const isSelectionInsideList = useCallback(() => {
    const editor = editorRef.current;
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
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const isModifier = event.metaKey || event.ctrlKey;
    if (isModifier) {
      const key = event.key.toLowerCase();
      if (key === 'b') {
        event.preventDefault();
        applyCommand('bold');
      } else if (key === 'i') {
        event.preventDefault();
        applyCommand('italic');
      } else if (key === 'u') {
        event.preventDefault();
        applyCommand('underline');
      }
      return;
    }
    // Enter and Shift+Enter both insert a single <br> line break. A <br> is in
    // the sanitizer allowlist, round-trips through setEditorValue/
    // extractEditorValue without structural drift, and renders identically in
    // every read view (note modal + clamped feed row) without depending on
    // per-tag margins or risking empty-<div> collapse — which is why some line
    // breaks previously vanished in the project Notes feed.
    // Inside a list we defer to the browser so Enter still creates a new list
    // item (and a trailing empty item exits the list).
    if (event.key === 'Enter') {
      if (isSelectionInsideList()) return;
      event.preventDefault();
      document.execCommand('insertLineBreak');
      syncFromEditor();
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const clipboard = event.clipboardData;
    const items = Array.from(clipboard?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length > 0) {
      event.preventDefault();
      saveSelection();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          await handleImageFile(file);
        }
      }
      return;
    }

    // Rich text copied from another app carries that app's layout in its
    // inline styles — chat toolbars, backgrounds, fonts, and metadata parked
    // off-screen. Insert our own normalised version instead of letting the
    // browser drop the source markup in verbatim.
    const html = clipboard?.getData('text/html') ?? '';
    if (!html) return;
    event.preventDefault();
    const normalized = normalizePastedTaskHtml(html);
    if (normalized.trim()) {
      document.execCommand('insertHTML', false, normalized);
    } else {
      // Everything was layout — fall back to the plain-text flavour so the
      // paste still lands instead of silently doing nothing.
      const text = clipboard?.getData('text/plain') ?? '';
      if (text) {
        document.execCommand('insertText', false, text);
      }
    }
    syncFromEditor();
  };

  const handleImageButtonClick = () => {
    if (disabled) return;
    saveSelection();
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    for (const file of files) {
      await handleImageFile(file);
    }
    event.target.value = '';
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const handle = target.closest('.rte-image-handle');
    if (!handle) return;
    event.preventDefault();
    event.stopPropagation();
    const wrapper = handle.closest('.rte-image');
    const img = wrapper?.querySelector('img');
    if (!(img instanceof HTMLImageElement)) return;
    resizeStateRef.current = {
      img,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: img.getBoundingClientRect().width,
    };
    window.addEventListener('pointermove', handleResizeMove);
    window.addEventListener('pointerup', handleResizeEnd);
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest('.rte-image-handle')) return;
    const wrapper = target.closest('.rte-image');
    if (!(wrapper instanceof HTMLSpanElement)) return;
    draggingImageRef.current = wrapper;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'image');
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (draggingImageRef.current) return;
    if (!hasImageFiles(event.dataTransfer)) return;
    event.preventDefault();

    if (disabled) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }

    dragDepthRef.current += 1;
    if (!isFileDragOver) {
      setIsFileDragOver(true);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (draggingImageRef.current) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      return;
    }

    if (!hasImageFiles(event.dataTransfer)) return;

    if (disabled) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!isFileDragOver) {
      setIsFileDragOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (draggingImageRef.current) return;
    if (!hasImageFiles(event.dataTransfer)) return;
    const nextDepth = Math.max(0, dragDepthRef.current - 1);
    dragDepthRef.current = nextDepth;
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
    if (nextDepth === 0) {
      setIsFileDragOver(false);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    dragDepthRef.current = 0;
    setIsFileDragOver(false);
    const droppedFiles = Array.from(event.dataTransfer?.files ?? [])
      .filter((file) => file.type.startsWith('image/'));

    if (droppedFiles.length > 0) {
      event.preventDefault();
      if (disabled) return;
      const editor = editorRef.current;
      if (!editor) return;

      const dropRange = getCaretRangeFromPoint(event.clientX, event.clientY);
      if (dropRange && editor.contains(dropRange.startContainer)) {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(dropRange);
          savedSelectionRef.current = dropRange;
        }
      } else {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
        savedSelectionRef.current = range;
      }

      for (const file of droppedFiles) {
        await handleImageFile(file);
      }
      return;
    }

    const editor = editorRef.current;
    const wrapper = draggingImageRef.current;
    if (!editor || !wrapper) return;
    event.preventDefault();
    const range = getCaretRangeFromPoint(event.clientX, event.clientY);
    if (!range || !editor.contains(range.startContainer)) {
      draggingImageRef.current = null;
      return;
    }
    if (wrapper.contains(range.startContainer)) {
      draggingImageRef.current = null;
      return;
    }
    wrapper.remove();
    const targetNode = range.startContainer;
    if (targetNode.nodeType === Node.ELEMENT_NODE) {
      const element = targetNode as Element;
      const targetImage = element.closest('.rte-image');
      if (targetImage && targetImage !== wrapper) {
        targetImage.after(wrapper);
      } else {
        range.insertNode(wrapper);
      }
    } else {
      range.insertNode(wrapper);
    }
    draggingImageRef.current = null;
    syncFromEditor();
  };

  const handleDragEnd = () => {
    draggingImageRef.current = null;
    dragDepthRef.current = 0;
    setIsFileDragOver(false);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const wrapper = target.closest('.rte-image');
    const image = target instanceof HTMLImageElement ? target : wrapper?.querySelector('img');
    if (!(image instanceof HTMLImageElement)) return;
    event.preventDefault();
    const containerRect = containerRef.current?.getBoundingClientRect();
    const x = containerRect ? event.clientX - containerRect.left + 6 : event.clientX + 6;
    const y = containerRect ? event.clientY - containerRect.top + 6 : event.clientY + 6;
    contextImageRef.current = image;
    setContextMenu({ x, y });
  };

  const handleRemoveImage = () => {
    const image = contextImageRef.current;
    if (!image) return;
    const wrapper = image.closest('.rte-image');
    if (wrapper) {
      wrapper.remove();
    } else {
      image.remove();
    }
    closeContextMenu();
    syncFromEditor();
  };

  const handleOpenImage = () => {
    const image = contextImageRef.current;
    if (!image?.src) return;
    const popup = window.open('about:blank', '_blank');
    const src = image.src.replace(/"/g, '&quot;');
    if (!popup) {
      const link = document.createElement('a');
      link.href = image.src;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      closeContextMenu();
      return;
    }
    try {
      popup.opener = null;
    } catch {
      // noop
    }
    try {
      popup.document.open();
      popup.document.write(
        `<!doctype html><html><head><title>Image</title><style>
          html, body { height: 100%; margin: 0; background: #0b0b0b; }
          body { display: flex; align-items: center; justify-content: center; }
          img { max-width: 100%; max-height: 100%; }
        </style></head><body><img src="${src}" alt="Image" /></body></html>`,
      );
      popup.document.close();
    } catch {
      try {
        popup.location.href = image.src;
      } catch {
        const link = document.createElement('a');
        link.href = image.src;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      }
    }
    closeContextMenu();
  };

  const handleBlur = () => {
    syncFromEditor();
    onBlur?.();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative',
        framed
          ? 'overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-ring'
          : 'space-y-2',
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-0.5',
          framed
            ? 'border-b border-border/60 bg-secondary/70 px-2 py-1.5'
            : 'rounded-md border border-input bg-muted/30 p-1',
        )}
      >
        {toolbarGroups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {groupIndex > 0 && (
              <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
            )}
            {group.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.label}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyCommand(item.command, item.value)}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
          </React.Fragment>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleImageButtonClick}
          aria-label="Insert image"
          title="Insert image"
        >
          <Image className="h-4 w-4" />
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <div
        ref={editorRef}
        className={cn(
          'rich-text-editor',
          // ! needed: .rich-text-editor lives in @layer utilities too and wins
          // the source-order tie against plain utility overrides.
          framed && '!rounded-none !border-0 focus-visible:!ring-0 focus-visible:!ring-offset-0',
          disabled && 'bg-muted/40',
          isFileDragOver && !disabled && 'border-primary/60 bg-primary/5 ring-2 ring-primary/30',
          className
        )}
        id={id}
        contentEditable={!disabled}
        data-placeholder={placeholder}
        role="textbox"
        aria-multiline="true"
        aria-disabled={disabled}
        spellCheck
        onInput={syncFromEditor}
        onPaste={handlePaste}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        suppressContentEditableWarning
      />
      {!disabled && !framed && (
        <p className="text-xs text-muted-foreground">
          {t`Drag and drop image files into the description area.`}
        </p>
      )}
      {contextMenu && (
        <div
          ref={menuRef}
          className="rte-image-menu absolute z-[60] min-w-[160px] rounded-md border border-border bg-popover p-1 text-sm shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="w-full rounded-sm px-2 py-1 text-left hover:bg-muted"
            onClick={handleOpenImage}
          >
            {t`Open fullscreen`}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-2 py-1 text-left hover:bg-muted"
            onClick={handleRemoveImage}
          >
            {t`Remove image`}
          </button>
        </div>
      )}
    </div>
  );
};
