import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer';
import {
  Bold,
  Image,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
  AtSign,
} from 'lucide-react';
import { t } from '@lingui/macro';
import { sanitizeCommentRichText } from '@/shared/lib/sanitizer';
import { normalizePastedCommentHtml } from '@/shared/lib/pastedRichText';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import {
  hasTaskCommentRichTags,
  normalizeTaskCommentEditorHtml,
  normalizeTaskCommentPlainText,
} from '@/features/planner/lib/taskCommentEditorHtml';
import { getCommentMentionPopoverPosition } from '@/features/planner/lib/commentMentionPopoverPosition';
import {
  getCommentPlainLength,
  COMMENT_MAX_PLAIN_LENGTH,
  sanitizeCommentHtml,
} from '@/infrastructure/tasks/taskCommentsRepository';
import { uploadTaskMedia } from '@/infrastructure/tasks/taskMediaRepository';
import { toast } from '@/shared/ui/sonner';
import { type TaskCommentMentionCandidate } from '@/shared/domain/taskCommentMentionCandidates';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MIN_IMAGE_WIDTH = 120;
const DEFAULT_IMAGE_SCALE = 0.7;

const isEmpty = (text: string) => normalizeTaskCommentPlainText(text).trim().length === 0;

const setEditorValue = (editor: HTMLDivElement, value: string) => {
  if (!value) { editor.innerHTML = ''; return; }
  if (hasTaskCommentRichTags(value)) { editor.innerHTML = sanitizeCommentHtml(value); return; }
  editor.textContent = value;
};

const getSelectionRangeWithinEditor = (editor: HTMLDivElement): Range | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
};

const isVisibleRect = (
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

const getEditorTextBeforeCaret = (editor: HTMLDivElement, range: Range): string => {
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

const createEditorTextRange = (editor: HTMLDivElement, startOffset: number, endOffset: number) => {
  const start = getTextNodePosition(editor, startOffset);
  const end = getTextNodePosition(editor, endOffset);
  if (!start || !end) return null;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
};

const extractEditorValue = (editor: HTMLDivElement): string => {
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

export interface CommentEditorProps {
  workspaceId: string;
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
  mentionCandidates: TaskCommentMentionCandidate[];
  mentionsLoading?: boolean;
  onSave: (html: string) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
}

type MentionAnchorSource = 'button' | 'caret';

export const CommentEditor: React.FC<CommentEditorProps> = ({
  workspaceId,
  initialValue = '',
  placeholder,
  disabled = false,
  mentionCandidates,
  mentionsLoading = false,
  onSave,
  onCancel,
  saveLabel,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionButtonRef = useRef<HTMLButtonElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const lastValueRef = useRef(initialValue);
  const dragDepthRef = useRef(0);
  const resizeStateRef = useRef<{
    img: HTMLImageElement; startX: number; startY: number; startWidth: number;
  } | null>(null);
  const mentionQueryRef = useRef<string | null>(null);

  const [plainLength, setPlainLength] = useState(0);
  const [saving, setSaving] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  // Mention popover
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(null);
  const [mentionAnchorSource, setMentionAnchorSource] = useState<MentionAnchorSource | null>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [mentionPopoverPosition, setMentionPopoverPosition] = useState<ReturnType<
    typeof getCommentMentionPopoverPosition
  > | null>(null);

  // ── initialise editor
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setEditorValue(editor, initialValue);
    lastValueRef.current = initialValue;
    setPlainLength(getCommentPlainLength(initialValue));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncFromEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = extractEditorValue(editor);
    if (next === lastValueRef.current) return;
    lastValueRef.current = next;
    setPlainLength(getCommentPlainLength(next));
  }, []);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor || !editor.contains(range.commonAncestorContainer)) return;
    savedSelectionRef.current = range.cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const sel = window.getSelection();
    const range = savedSelectionRef.current;
    if (!sel || !range) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  // ── toolbar formatting
  const applyCommand = useCallback(
    (command: string, value?: string) => {
      if (disabled) return;
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      document.execCommand(command, false, value);
      syncFromEditor();
    },
    [disabled, syncFromEditor],
  );

  // ── image helpers (mirrors RichTextEditor)
  const getDefaultImageWidth = useCallback((): string => {
    const editor = editorRef.current;
    if (!editor) return `${Math.round(DEFAULT_IMAGE_SCALE * 100)}%`;
    const w = editor.clientWidth;
    if (!w) return `${Math.round(DEFAULT_IMAGE_SCALE * 100)}%`;
    const target = Math.round(w * DEFAULT_IMAGE_SCALE);
    const maxW = Math.max(MIN_IMAGE_WIDTH, w - 32);
    const safe = Math.min(Math.max(MIN_IMAGE_WIDTH, target), maxW);
    return `${safe}px`;
  }, []);

  const insertImage = useCallback(
    (src: string, alt: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      restoreSelection();
      editor.focus();
      const safeAlt = alt.replace(/"/g, '&quot;');
      const width = getDefaultImageWidth();
      document.execCommand(
        'insertHTML',
        false,
        [
          '<span class="rte-image" contenteditable="false" draggable="true" data-rte-image="true">',
          `<img src="${src}" alt="${safeAlt}" style="width:${width};height:auto;" />`,
          '<span class="rte-image-handle" data-handle="se"></span>',
          '</span>',
        ].join(''),
      );
      saveSelection();
      syncFromEditor();
    },
    [getDefaultImageWidth, restoreSelection, saveSelection, syncFromEditor],
  );

  const handleImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > MAX_IMAGE_SIZE) {
        toast(t`File is too large`, { description: t`Maximum image size is 5 MB.` });
        return;
      }
      try {
        const url = await uploadTaskMedia(workspaceId, file);
        insertImage(url, file.name || 'Image');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        toast(t`Failed to upload image`, msg ? { description: msg } : undefined);
      }
    },
    [insertImage, workspaceId],
  );

  // ── @ mention detection
  /**
   * Scans backwards from the current caret position looking for an unclosed `@`.
   * Returns the query string (text after `@`) or null if not in a mention context.
   */
  const detectMentionContext = useCallback((): { query: string; triggerStart: number; triggerEnd: number } | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const range = getSelectionRangeWithinEditor(editor);
    if (!range || !range.collapsed) return null;
    const before = getEditorTextBeforeCaret(editor, range);
    // Find the last `@` that is not immediately preceded by a word character
    // (prevents false positives inside email addresses etc.)
    const atIndex = before.lastIndexOf('@');
    if (atIndex === -1) return null;
    const charBeforeAt = atIndex > 0 ? before[atIndex - 1] : ' ';
    if (/\w/.test(charBeforeAt)) return null; // preceded by word char → not a trigger
    const query = before.slice(atIndex + 1);
    // If the query contains a space, the mention context was closed
    if (/\s/.test(query)) return null;
    return {
      query,
      triggerStart: atIndex,
      triggerEnd: before.length,
    };
  }, []);

  const filteredMentionCandidates = mentionCandidates.filter((a) => {
    if (!mentionQuery) return true;
    return a.name.toLowerCase().includes(mentionQuery.toLowerCase());
  });

  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMentionQuery('');
    mentionQueryRef.current = null;
    setMentionHighlight(0);
    setMentionAnchorRect(null);
    setMentionAnchorSource(null);
    setMentionPopoverPosition(null);
  }, []);

  const syncMentionAnchor = useCallback((
    source: MentionAnchorSource,
    fallbackElement?: HTMLElement | null,
  ) => {
    setMentionAnchorSource((current) => (current === source ? current : source));

    if (source === 'caret') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (typeof range.getClientRects === 'function') {
          const rects = range.getClientRects();
          const caretRect = rects.length > 0 ? rects[rects.length - 1] : null;
          if (isVisibleRect(caretRect)) {
            setMentionAnchorRect(caretRect as DOMRect);
            return;
          }
        }
        if (typeof range.getBoundingClientRect === 'function') {
          const rect = range.getBoundingClientRect();
          if (isVisibleRect(rect)) {
            setMentionAnchorRect(rect);
            return;
          }
        }
      }
    }

    const buttonRect = mentionButtonRef.current?.getBoundingClientRect();
    if (source === 'button' && isVisibleRect(buttonRect)) {
      setMentionAnchorRect(buttonRect as DOMRect);
      return;
    }

    const fallbackRect = fallbackElement?.getBoundingClientRect();
    if (isVisibleRect(fallbackRect)) {
      setMentionAnchorRect(fallbackRect as DOMRect);
      return;
    }

    const editorRect = editorRef.current?.getBoundingClientRect();
    if (isVisibleRect(editorRect)) {
      setMentionAnchorRect(editorRect as DOMRect);
    }
  }, []);

  const refreshMentionAnchor = useCallback(() => {
    if (!mentionAnchorSource) return;
    if (mentionAnchorSource === 'button') {
      syncMentionAnchor('button', mentionButtonRef.current);
      return;
    }
    syncMentionAnchor('caret', editorRef.current);
  }, [mentionAnchorSource, syncMentionAnchor]);

  const insertMention = useCallback(
    (candidate: TaskCommentMentionCandidate) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      restoreSelection();
      const mentionContext = detectMentionContext();
      const selection = window.getSelection();
      if (mentionContext && selection) {
        const triggerRange = createEditorTextRange(
          editor,
          mentionContext.triggerStart,
          mentionContext.triggerEnd,
        );
        if (triggerRange) {
          triggerRange.deleteContents();
          selection.removeAllRanges();
          selection.addRange(triggerRange);
        }
      }

      const mentionHtml = [
        `<span class="comment-mention" contenteditable="false"`,
        ` data-mention-user-id="${candidate.userId}"`,
        ` data-mention-name="${candidate.name.replace(/"/g, '&quot;')}"`,
        `>@${candidate.name}</span>`,
        '&nbsp;',
      ].join('');
      document.execCommand('insertHTML', false, mentionHtml);
      saveSelection();
      syncFromEditor();
      closeMention();
    },
    [closeMention, detectMentionContext, restoreSelection, saveSelection, syncFromEditor],
  );

  const syncMentionPopoverPosition = useCallback(() => {
    if (!mentionOpen || !mentionAnchorRect) {
      setMentionPopoverPosition(null);
      return;
    }

    const popoverElement = mentionListRef.current;
    const nextPosition = getCommentMentionPopoverPosition({
      anchorRect: mentionAnchorRect,
      popoverSize: {
        width: popoverElement?.offsetWidth || 256,
        height: popoverElement?.offsetHeight || 224,
      },
      viewportSize: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });

    setMentionPopoverPosition((current) => (
      current &&
      current.top === nextPosition.top &&
      current.left === nextPosition.left &&
      current.placement === nextPosition.placement
        ? current
        : nextPosition
    ));
  }, [mentionAnchorRect, mentionOpen]);

  useLayoutEffect(() => {
    if (!mentionOpen) return;
    syncMentionPopoverPosition();
  }, [filteredMentionCandidates.length, mentionOpen, mentionQuery, mentionHighlight, syncMentionPopoverPosition]);

  useEffect(() => {
    if (!mentionOpen) return;

    const handleResize = () => {
      refreshMentionAnchor();
      syncMentionPopoverPosition();
    };
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && mentionListRef.current?.contains(target)) {
        return;
      }
      refreshMentionAnchor();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [mentionOpen, refreshMentionAnchor, syncMentionPopoverPosition]);

  useEffect(() => {
    if (!mentionOpen) return;

    const handleSelectionChange = () => {
      if (mentionAnchorSource !== 'caret') return;
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      if (!editor.contains(selection.anchorNode)) return;
      refreshMentionAnchor();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [mentionAnchorSource, mentionOpen, refreshMentionAnchor]);

  useEffect(() => {
    if (!mentionOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mentionListRef.current?.contains(target)) return;
      if (editorRef.current?.contains(target)) return;
      if (mentionButtonRef.current?.contains(target)) return;
      closeMention();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closeMention, mentionOpen]);

  // ── image resize (identical to RichTextEditor logic)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const dx = e.clientX - state.startX;
      const newWidth = Math.max(MIN_IMAGE_WIDTH, state.startWidth + dx);
      state.img.style.width = `${newWidth}px`;
      state.img.style.height = 'auto';
    };
    const onMouseUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      syncFromEditor();
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [syncFromEditor]);

  // ── save / cancel
  const handleSave = useCallback(async () => {
    const html = lastValueRef.current;
    if (!html.trim() || plainLength > COMMENT_MAX_PLAIN_LENGTH) return;
    setSaving(true);
    try {
      await onSave(html);
      const editor = editorRef.current;
      if (editor) { editor.innerHTML = ''; lastValueRef.current = ''; }
      setPlainLength(0);
    } catch {
      // Keep the draft intact so the user can retry after a failed save.
    } finally {
      setSaving(false);
    }
  }, [onSave, plainLength]);

  // Same grouping as the description editor toolbar: formatting | lists | blocks.
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

  const isOverLimit = plainLength > COMMENT_MAX_PLAIN_LENGTH;

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-secondary/70 px-2 py-1.5">
        {toolbarGroups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {groupIndex > 0 && (
              <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
            )}
            {group.map((btn) => (
              <button
                key={btn.command}
                type="button"
                title={btn.label}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  applyCommand(btn.command, btn.value);
                }}
                disabled={disabled}
              >
                <btn.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </React.Fragment>
        ))}
        {/* image */}
        <button
          type="button"
          title={t`Insert image`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Image className="h-3.5 w-3.5" />
        </button>
        {/* @ mention */}
        <button
          ref={mentionButtonRef}
          type="button"
          title={t`Mention a person`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          onClick={() => {
            const editor = editorRef.current;
            if (!editor) return;
            editor.focus();
            restoreSelection();
            document.execCommand('insertText', false, '@');
            saveSelection();
            syncMentionAnchor('button', mentionButtonRef.current ?? editor);
            setMentionQuery('');
            mentionQueryRef.current = '';
            setMentionOpen(true);
            setMentionHighlight(0);
          }}
          disabled={disabled}
        >
          <AtSign className="h-3.5 w-3.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImageFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* contenteditable area */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder ?? t`Add a comment or update...`}
        className={cn(
          // ! needed: .rich-text-editor lives in @layer utilities too and wins
          // the source-order tie against plain utility overrides.
          'rich-text-editor comment-editor-input !rounded-none !border-0 !ring-0 focus-visible:!ring-0 focus-visible:!ring-offset-0 max-h-[35svh] md:max-h-[40vh] overflow-y-auto leading-5',
          isFileDragOver && 'bg-primary/5',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        onInput={() => {
          syncFromEditor();
          // Detect @ mention trigger
          const mentionContext = detectMentionContext();
          if (mentionContext !== null) {
            saveSelection();
            mentionQueryRef.current = mentionContext.query;
            setMentionQuery(mentionContext.query);
            if (!mentionOpen) {
              setMentionOpen(true);
              setMentionHighlight(0);
            }
            syncMentionAnchor('caret', editorRef.current);
          } else {
            if (mentionOpen) closeMention();
          }
        }}
        onKeyDown={(e) => {
          if (mentionOpen) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMentionHighlight((h) => Math.min(h + 1, filteredMentionCandidates.length - 1));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMentionHighlight((h) => Math.max(h - 1, 0));
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              const candidate = filteredMentionCandidates[mentionHighlight];
              if (candidate) insertMention(candidate);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              closeMention();
              return;
            }
          }
          // Ctrl/Cmd + Enter → save
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleSave();
          }
        }}
        onBlur={() => saveSelection()}
        onMouseUp={() => saveSelection()}
        onDragEnter={(e) => {
          dragDepthRef.current++;
          if (dragDepthRef.current === 1 && e.dataTransfer?.types.includes('Files')) {
            setIsFileDragOver(true);
          }
        }}
        onDragLeave={() => {
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsFileDragOver(false);
        }}
        onDragOver={(e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => {
          dragDepthRef.current = 0;
          setIsFileDragOver(false);
          const file = e.dataTransfer?.files?.[0];
          if (file?.type.startsWith('image/')) {
            e.preventDefault();
            void handleImageFile(file);
          }
        }}
        onPaste={(e) => {
          const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
            f.type.startsWith('image/'),
          );
          if (file) {
            e.preventDefault();
            void handleImageFile(file);
            return;
          }
          // Same normalisation as the description editor: strip the source
          // app's layout instead of pasting its markup verbatim.
          const html = e.clipboardData?.getData('text/html') ?? '';
          if (!html) return;
          e.preventDefault();
          const normalized = normalizePastedCommentHtml(html);
          if (normalized.trim()) {
            document.execCommand('insertHTML', false, normalized);
          } else {
            const text = e.clipboardData?.getData('text/plain') ?? '';
            if (text) document.execCommand('insertText', false, text);
          }
          syncFromEditor();
        }}
        onMouseDown={(e) => {
          // Resize handle interaction (mirrors RichTextEditor)
          const target = e.target as HTMLElement;
          if (target.classList.contains('rte-image-handle')) {
            e.preventDefault();
            const wrapper = target.closest('.rte-image');
            const img = wrapper?.querySelector('img') as HTMLImageElement | null;
            if (!img) return;
            resizeStateRef.current = {
              img,
              startX: e.clientX,
              startY: e.clientY,
              startWidth: img.offsetWidth,
            };
          }
        }}
      />

      {/* mention floating popover */}
      {mentionOpen && typeof document !== 'undefined' && createPortal(
        <DismissableLayerBranch
          data-mention-branch="true"
          className="pointer-events-auto"
        >
          <div
            data-mention-popover="true"
            className="fixed z-[60] w-64 rounded-md border bg-popover shadow-md pointer-events-auto"
            style={
              mentionPopoverPosition
                ? {
                    top: mentionPopoverPosition.top,
                    left: mentionPopoverPosition.left,
                    pointerEvents: 'auto',
                  }
                : {
                    visibility: 'hidden',
                    pointerEvents: 'auto',
                  }
            }
            ref={mentionListRef}
            data-placement={mentionPopoverPosition?.placement}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="border-b px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                {mentionsLoading
                  ? t`Loading members...`
                  : filteredMentionCandidates.length === 0
                  ? t`No members found`
                  : t`Select a member`}
              </span>
            </div>
            <div
              data-mention-options="true"
              className="max-h-48 overflow-y-auto overscroll-contain py-1"
              onWheel={(e) => e.stopPropagation()}
            >
              {filteredMentionCandidates.map((candidate, idx) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                    idx === mentionHighlight
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    insertMention(candidate);
                  }}
                  onMouseEnter={() => setMentionHighlight(idx)}
                >
                  {/* Avatar / monogram */}
                  <PersonAvatar
                    userId={candidate.userId}
                    name={candidate.name}
                    colorSeed={candidate.userId}
                    size="xs"
                    className="shrink-0"
                  />
                  <span className="truncate">{candidate.name}</span>
                </button>
              ))}
            </div>
          </div>
        </DismissableLayerBranch>
      , document.body)}

      {/* footer: char counter + actions */}
      <div className="flex items-center justify-between border-t border-border/60 bg-secondary/70 px-3 py-1.5">
        <span
          className={cn(
            'text-[10px] tabular-nums',
            isOverLimit ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {plainLength}/{COMMENT_MAX_PLAIN_LENGTH}
        </span>
        <div className="flex gap-1.5">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onCancel}
              disabled={saving}
            >
              {t`Cancel`}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => void handleSave()}
            disabled={saving || disabled || isOverLimit || plainLength === 0}
          >
            {saveLabel ?? t`Save`}
          </Button>
        </div>
      </div>
    </div>
  );
};
