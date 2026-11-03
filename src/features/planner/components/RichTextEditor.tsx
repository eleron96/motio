import React, { useCallback, useEffect, useRef, useState } from 'react';
import { normalizePastedTaskHtml } from '@/shared/lib/pastedRichText';
import { ImageLightbox } from '@/shared/ui/image-lightbox';
import { LightboxImage, getClickedLightboxImage } from '@/shared/lib/lightboxImage';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/classNames';
import { uploadTaskMedia } from '@/infrastructure/tasks/taskMediaRepository';
import { t } from '@lingui/macro';
import {
  buildEditorImageHtml,
  defaultImageWidth,
  extractEditorValue,
  getCaretRangeFromPoint,
  hasImageFiles,
  isSelectionInsideList,
  rangeAtEnd,
  resizedImageWidth,
  selectRange,
  setEditorValue,
  wrapEditorImages,
} from '@/features/planner/lib/richTextEditorDom';
import { useRichTextImageMenu } from '@/features/planner/hooks/useRichTextImageMenu';
import { RichTextImageMenu } from '@/features/planner/components/RichTextImageMenu';
import { RichTextToolbar } from '@/features/planner/components/RichTextToolbar';

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
  const draggingImageRef = useRef<HTMLSpanElement | null>(null);
  const dragDepthRef = useRef(0);
  const lastValueRef = useRef(value);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
  const closeLightbox = useCallback(() => setLightboxImage(null), []);
  const imageMenu = useRichTextImageMenu(containerRef);

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

  const insertImage = useCallback((src: string, altText: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    restoreSelection();
    editor.focus();
    document.execCommand('insertHTML', false, buildEditorImageHtml(src, altText, defaultImageWidth(editor)));
    saveSelection();
    syncFromEditor();
  }, [restoreSelection, saveSelection, syncFromEditor]);

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
      selectRange(rangeAtEnd(editor));
    });
    return () => window.cancelAnimationFrame(id);
  }, [autoFocus]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastValueRef.current && editor.innerHTML !== '') return;
    setEditorValue(editor, value);
    lastValueRef.current = value;
    wrapEditorImages(editor, defaultImageWidth(editor));
  }, [value]);

  useEffect(() => {
    if (!disabled) return;
    dragDepthRef.current = 0;
    setIsFileDragOver(false);
  }, [disabled]);

  const handleResizeMove = useCallback((event: PointerEvent) => {
    const state = resizeStateRef.current;
    if (!state) return;
    const delta = Math.max(event.clientX - state.startX, event.clientY - state.startY);
    const editorWidth = editorRef.current?.clientWidth ?? state.startWidth;
    const nextWidth = resizedImageWidth(state.startWidth, delta, editorWidth);
    state.img.style.width = `${Math.round(nextWidth)}px`;
    state.img.style.height = 'auto';
  }, []);

  const handleResizeEnd = useCallback(() => {
    window.removeEventListener('pointermove', handleResizeMove);
    window.removeEventListener('pointerup', handleResizeEnd);
    resizeStateRef.current = null;
    syncFromEditor();
  }, [handleResizeMove, syncFromEditor]);

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
      if (isSelectionInsideList(editorRef.current)) return;
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
        if (window.getSelection()) {
          selectRange(dropRange);
          savedSelectionRef.current = dropRange;
        }
      } else {
        const range = rangeAtEnd(editor);
        selectRange(range);
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
    imageMenu.openAt(image, event.clientX, event.clientY);
  };

  const handleRemoveImage = () => {
    const image = imageMenu.imageRef.current;
    if (!image) return;
    const wrapper = image.closest('.rte-image');
    if (wrapper) {
      wrapper.remove();
    } else {
      image.remove();
    }
    imageMenu.close();
    syncFromEditor();
  };

  const handleOpenImage = () => {
    const image = imageMenu.imageRef.current;
    imageMenu.close();
    if (!image?.src) return;
    setLightboxImage({ src: image.src, alt: image.alt });
  };

  /**
   * A click on a picture opens it in the lightbox — in the editable
   * description as well as the read-only one. Text selection, the resize
   * handle and drag-to-reorder never produce a click whose target is the
   * <img> itself, so editing is untouched.
   */
  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const image = getClickedLightboxImage(event);
    if (!image) return;
    event.preventDefault();
    setLightboxImage(image);
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
      <RichTextToolbar
        framed={framed}
        disabled={disabled}
        onCommand={applyCommand}
        onInsertImage={handleImageButtonClick}
      />
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
        onClick={handleEditorClick}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        suppressContentEditableWarning
      />
      {!disabled && !framed && (
        <p className="text-xs text-muted-foreground">
          {t`Drag and drop image files into the description area.`}
        </p>
      )}
      <RichTextImageMenu
        menuRef={imageMenu.menuRef}
        position={imageMenu.position}
        onOpenImage={handleOpenImage}
        onRemoveImage={handleRemoveImage}
      />
      <ImageLightbox image={lightboxImage} onClose={closeLightbox} />
    </div>
  );
};
