/**
 * TaskCommentSection
 *
 * Renders the comments thread for a single task inside TaskDetailPanel.
 * Contains three private sub-components:
 *   - CommentEditor   – contenteditable editor with toolbar, image upload and @ mention
 *   - TaskCommentItem – one rendered comment (view / edit / delete)
 *   - TaskCommentSection (default export) – list + load-more + editor
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Bold,
  Image,
  Italic,
  List,
  ListOrdered,
  MessageSquare,
  MoreHorizontal,
  Quote,
  Strikethrough,
  Underline,
  AtSign,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { t } from '@lingui/macro';

import { Button } from '@/shared/ui/button';
import { ScrollArea } from '@/shared/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/classNames';
import { supabase } from '@/shared/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store/authStore';
import {
  hasTaskCommentRichTags,
  normalizeTaskCommentEditorHtml,
  normalizeTaskCommentPlainText,
} from '@/features/planner/lib/taskCommentEditorHtml';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { TaskComment } from '@/features/planner/types/planner';
import { getCommentMentionPopoverPosition } from '@/features/planner/lib/commentMentionPopoverPosition';
import {
  createTaskComment,
  deleteTaskComment,
  fetchTaskComments,
  getCommentPlainLength,
  COMMENT_MAX_PLAIN_LENGTH,
  sanitizeCommentHtml,
  extractMentionedUserIds,
  updateTaskComment,
} from '@/infrastructure/tasks/taskCommentsRepository';
import {
  buildTaskCommentMentionCandidates,
  type TaskCommentMentionCandidate,
} from '@/shared/domain/taskCommentMentionCandidates';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MIN_IMAGE_WIDTH = 120;
const DEFAULT_IMAGE_SCALE = 0.7;
const trimTrailingSlash = (v: string) => v.replace(/\/+$/, '');

/** Derives a deterministic background colour from a string (e.g. user ID). */
const monogramColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 55% 52%)`;
};

/** Returns the first two letters of a display name as a monogram. */
const monogram = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 2)).toUpperCase();
};

const isEmpty = (t: string) => normalizeTaskCommentPlainText(t).trim().length === 0;
const noopAdjustTaskCommentCount = () => undefined;
const noopRefreshTaskCommentCounts = async () => ({});

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
  const html = DOMPurify.sanitize(normalizeTaskCommentEditorHtml(clone.innerHTML), {
    ALLOWED_TAGS: [
      'b', 'strong', 'i', 'em', 'u', 's', 'strike',
      'ul', 'ol', 'li', 'blockquote',
      'br', 'div', 'p', 'span', 'img',
    ],
    ALLOWED_ATTR: [
      'src', 'alt', 'style', 'width', 'height',
      'class', 'data-mention-user-id', 'data-mention-name', 'contenteditable',
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|data:image\/)|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ALLOWED_CSS_PROPERTIES: ['width', 'height'],
  });
  const text = editor.innerText ?? '';
  const hasImages = /<img\b/i.test(html);
  if (!hasImages && isEmpty(text)) return '';
  return hasTaskCommentRichTags(html) ? html : normalizeTaskCommentPlainText(text);
};

// ─────────────────────────────────────────────────────────────────────────────
// CommentEditor
// ─────────────────────────────────────────────────────────────────────────────

interface CommentEditorProps {
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

const CommentEditor: React.FC<CommentEditorProps> = ({
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

  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      const wsId = workspaceId.trim();
      if (!wsId) throw new Error('Workspace is not selected.');
      const supabaseUrl = trimTrailingSlash(
        (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
      );
      if (!supabaseUrl) throw new Error('Upload service is not configured.');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated.');
      const res = await fetch(`${supabaseUrl}/functions/v1/task-media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
          'X-Workspace-Id': wsId,
          'X-File-Name': file.name,
        },
        body: file,
      });
      const payload = await res.json().catch(() => ({} as { error?: string; id?: string; token?: string }));
      if (!res.ok) throw new Error(payload.error ?? `Upload failed (${res.status})`);
      if (typeof payload.id !== 'string' || typeof payload.token !== 'string') {
        throw new Error('Invalid upload response.');
      }
      return `${supabaseUrl}/functions/v1/task-media/${encodeURIComponent(payload.id)}?token=${encodeURIComponent(payload.token)}`;
    },
    [workspaceId],
  );

  const handleImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > MAX_IMAGE_SIZE) {
        toast(t`File is too large`, { description: t`Maximum image size is 5 MB.` });
        return;
      }
      try {
        const url = await uploadImage(file);
        insertImage(url, file.name || 'Image');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        toast(t`Failed to upload image`, msg ? { description: msg } : undefined);
      }
    },
    [insertImage, uploadImage],
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
    if (!range.collapsed) return null;
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
    setMentionPopoverPosition(null);
  }, []);

  const syncMentionAnchor = useCallback((fallbackElement?: HTMLElement | null) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (typeof range.getBoundingClientRect === 'function') {
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0 || rect.top > 0 || rect.left > 0) {
          setMentionAnchorRect(rect);
          return;
        }
      }
    }

    const fallbackRect = fallbackElement?.getBoundingClientRect();
    if (fallbackRect) {
      setMentionAnchorRect(fallbackRect);
      return;
    }

    const editorRect = editorRef.current?.getBoundingClientRect();
    if (editorRect) {
      setMentionAnchorRect(editorRect);
    }
  }, []);

  const insertMention = useCallback(
    (candidate: TaskCommentMentionCandidate) => {
      const editor = editorRef.current;
      if (!editor) return;

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

      editor.focus();
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
    [closeMention, detectMentionContext, saveSelection, syncFromEditor],
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

    const handleResize = () => syncMentionPopoverPosition();
    const handleScroll = () => closeMention();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [closeMention, mentionOpen, syncMentionPopoverPosition]);

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

  const toolbarButtons = [
    { label: 'Bold', command: 'bold', icon: Bold },
    { label: 'Italic', command: 'italic', icon: Italic },
    { label: 'Underline', command: 'underline', icon: Underline },
    { label: 'Strike', command: 'strikeThrough', icon: Strikethrough },
    { label: 'Bulleted list', command: 'insertUnorderedList', icon: List },
    { label: 'Numbered list', command: 'insertOrderedList', icon: ListOrdered },
    { label: 'Quote', command: 'formatBlock', value: 'blockquote', icon: Quote },
  ];

  const isOverLimit = plainLength > COMMENT_MAX_PLAIN_LENGTH;

  return (
    <div className="rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input px-2 py-1">
        {toolbarButtons.map((btn) => (
          <button
            key={btn.command}
            type="button"
            title={btn.label}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
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
        {/* image */}
        <button
          type="button"
          title={t`Insert image`}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Image className="h-3.5 w-3.5" />
        </button>
        {/* @ mention */}
        <button
          type="button"
          title={t`Mention a person`}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          onClick={() => {
            const editor = editorRef.current;
            if (!editor) return;
            editor.focus();
            restoreSelection();
            document.execCommand('insertText', false, '@');
            saveSelection();
            syncMentionAnchor(editor);
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
          'rich-text-editor comment-editor-input border-0 ring-0 focus-visible:ring-0 max-h-[40vh] overflow-y-auto leading-5',
          isFileDragOver && 'border-primary/60 bg-primary/5 ring-2 ring-primary/30',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        onInput={() => {
          syncFromEditor();
          // Detect @ mention trigger
          const mentionContext = detectMentionContext();
          if (mentionContext !== null) {
            mentionQueryRef.current = mentionContext.query;
            setMentionQuery(mentionContext.query);
            if (!mentionOpen) {
              setMentionOpen(true);
              setMentionHighlight(0);
            }
            syncMentionAnchor(editorRef.current);
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
          }
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
      {mentionOpen && (
        <div
          data-mention-popover="true"
          className="fixed z-[60] w-64 rounded-md border bg-popover shadow-md"
          style={
            mentionPopoverPosition
              ? {
                  top: mentionPopoverPosition.top,
                  left: mentionPopoverPosition.left,
                }
              : { visibility: 'hidden' }
          }
          ref={mentionListRef}
          data-placement={mentionPopoverPosition?.placement}
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
          <div className="max-h-48 overflow-y-auto py-1">
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
                  insertMention(candidate);
                }}
              >
                {/* Avatar / monogram */}
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: monogramColor(candidate.userId) }}
                >
                  {monogram(candidate.name)}
                </span>
                <span className="truncate">{candidate.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* footer: char counter + actions */}
      <div className="flex items-center justify-between border-t border-input px-3 py-1.5">
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

// ─────────────────────────────────────────────────────────────────────────────
// TaskCommentItem
// ─────────────────────────────────────────────────────────────────────────────

interface TaskCommentItemProps {
  comment: TaskComment;
  currentUserId: string | null;
  isAdmin: boolean;
  workspaceId: string;
  mentionCandidates: TaskCommentMentionCandidate[];
  mentionsLoading: boolean;
  onUpdated: (updated: TaskComment) => void;
  onDeleted: (id: string) => void;
}

const TaskCommentItem: React.FC<TaskCommentItemProps> = ({
  comment,
  currentUserId,
  isAdmin,
  workspaceId,
  mentionCandidates,
  mentionsLoading,
  onUpdated,
  onDeleted,
}) => {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canEdit = comment.authorId === currentUserId;
  const canDelete = comment.authorId === currentUserId || isAdmin;

  const timeAgo = formatDistanceToNow(parseISO(comment.createdAt), {
    addSuffix: true,
  });

  const handleDelete = async () => {
    setDeleteLoading(true);
    const result = await deleteTaskComment(workspaceId, comment.id);
    setDeleteLoading(false);
    if (result.error) {
      toast(t`Failed to delete comment`, { description: result.error });
    } else {
      onDeleted(comment.id);
    }
    setDeleteOpen(false);
  };

  const handleSaveEdit = async (html: string) => {
    const result = await updateTaskComment(workspaceId, comment.id, html);
    if ('error' in result) {
      toast(t`Failed to update comment`, { description: result.error });
    } else {
      onUpdated(result.data);
      setEditing(false);
    }
  };

  return (
    <div className="group relative flex gap-2.5 py-2.5">
      {/* Avatar */}
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{
          backgroundColor: monogramColor(comment.authorId),
        }}
      >
        {monogram(comment.authorDisplayName)}
      </span>

      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="mb-0.5 flex flex-wrap items-baseline gap-1.5">
          <span className="text-sm font-medium leading-none">
            {comment.authorDisplayName}
          </span>
          <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
          {comment.isEdited && (
            <span className="text-[9px] text-muted-foreground/60">{t`(edited)`}</span>
          )}
        </div>

        {/* Body or editor */}
        {editing ? (
          <CommentEditor
            workspaceId={workspaceId}
            initialValue={comment.content}
            mentionCandidates={mentionCandidates}
            mentionsLoading={mentionsLoading}
            onSave={handleSaveEdit}
            onCancel={() => setEditing(false)}
            saveLabel={t`Update`}
          />
        ) : (
          <div
            className="comment-body rich-text-editor border-0 ring-0 p-0 min-h-0 text-sm"
            dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(comment.content) }}
          />
        )}
      </div>

      {/* Actions menu – shown on hover */}
      {(canEdit || canDelete) && !editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label={t`Comment actions`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            {canEdit && (
              <DropdownMenuItem onClick={() => setEditing(true)}>
                {t`Edit`}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                {t`Delete`}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete comment?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This comment will be permanently removed and cannot be recovered.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>
              {t`Cancel`}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
              disabled={deleteLoading}
            >
              {t`Delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TaskCommentSection (main export)
// ─────────────────────────────────────────────────────────────────────────────

interface TaskCommentSectionProps {
  taskId: string;
  workspaceId: string;
  canEdit: boolean;
}

export const TaskCommentSection: React.FC<TaskCommentSectionProps> = ({
  taskId,
  workspaceId,
  canEdit,
}) => {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? null;
  const currentUserDisplayName = useAuthStore(
    (s) => s.profileDisplayName ?? s.user?.email ?? '',
  );
  const currentWorkspaceRole = useAuthStore((s) => s.currentWorkspaceRole);
  const workspaceMembers = useAuthStore((s) => s.members);
  const membersWorkspaceId = useAuthStore((s) => s.membersWorkspaceId);
  const membersLoading = useAuthStore((s) => s.membersLoading);
  const fetchMembers = useAuthStore((s) => s.fetchMembers);
  const isAdmin = currentWorkspaceRole === 'admin';
  const taskCommentCount = usePlannerStore((s) => s.taskCommentCounts?.[taskId] ?? 0);
  const adjustTaskCommentCount = usePlannerStore(
    (s) => s.adjustTaskCommentCount ?? noopAdjustTaskCommentCount,
  );
  const refreshTaskCommentCounts = usePlannerStore(
    (s) => s.refreshTaskCommentCounts ?? noopRefreshTaskCommentCounts,
  );

  const mentionCandidates = buildTaskCommentMentionCandidates(workspaceMembers);

  useEffect(() => {
    if (!workspaceId) return;
    if (membersWorkspaceId === workspaceId || membersLoading) return;
    void fetchMembers(workspaceId);
  }, [fetchMembers, membersLoading, membersWorkspaceId, workspaceId]);

  // ── load comments when the task opens
  useEffect(() => {
    if (!taskId || !workspaceId) return;

    let cancelled = false;
    setLoading(true);
    setComments([]);
    setNextCursor(null);
    void refreshTaskCommentCounts(workspaceId, [taskId]);

    fetchTaskComments(workspaceId, taskId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if ('error' in result) {
        toast(t`Failed to load comments`, { description: result.error });
        return;
      }
      setComments(result.data.comments);
      setNextCursor(result.data.nextCursor);
    });

    return () => { cancelled = true; };
  }, [refreshTaskCommentCounts, taskId, workspaceId]);

  // ── load more (older) comments
  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const result = await fetchTaskComments(workspaceId, taskId, nextCursor);
    setLoadingMore(false);
    if ('error' in result) {
      toast(t`Failed to load comments`, { description: result.error });
      return;
    }
    // Older comments go to the TOP of the list
    setComments((prev) => [...result.data.comments, ...prev]);
    setNextCursor(result.data.nextCursor);
  };

  // ── create new comment
  const handleCreate = async (html: string) => {
    if (!currentUserId) {
      const message = t`You need to sign in again before adding comments.`;
      toast(t`Failed to add comment`, { description: message });
      throw new Error(message);
    }
    const mentionedUserIds = extractMentionedUserIds(html);
    const result = await createTaskComment({
      workspaceId,
      taskId,
      authorId: currentUserId,
      authorDisplayNameSnapshot: currentUserDisplayName,
      content: html,
    });
    if ('error' in result) {
      toast(t`Failed to add comment`, { description: result.error });
      throw new Error(result.error);
    }
    // Optimistic: append at the end (newest last)
    setComments((prev) => [...prev, result.data]);
    adjustTaskCommentCount(taskId, 1);
    void refreshTaskCommentCounts(workspaceId, [taskId]);
    void mentionedUserIds; // handled server-side via trigger
  };

  // ── callbacks for child items
  const handleUpdated = useCallback((updated: TaskComment) => {
    setComments((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    adjustTaskCommentCount(taskId, -1);
    void refreshTaskCommentCounts(workspaceId, [taskId]);
  }, [adjustTaskCommentCount, refreshTaskCommentCounts, taskId, workspaceId]);

  return (
    <div className="space-y-2 pt-1">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t`Comments`}
        </span>
        {taskCommentCount > 0 && (
          <span className="text-[9px] text-muted-foreground/70 tabular-nums">
            {taskCommentCount}
          </span>
        )}
      </div>

      {/* Comment list */}
      <ScrollArea className="max-h-[50vh]">
        <div className="pr-2">
          {/* Load more (older) */}
          {nextCursor && (
            <div className="mb-1 flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? t`Loading...` : t`Load older comments`}
              </Button>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3 py-2">
              {[1, 2].map((n) => (
                <div key={n} className="flex gap-2.5">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && comments.length === 0 && !canEdit && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              {t`Add a comment or update`}
            </p>
          )}

          {/* Comments */}
          {!loading &&
            comments.map((comment) => (
              <React.Fragment key={comment.id}>
                <TaskCommentItem
                  comment={comment}
                  currentUserId={currentUserId ?? null}
                  isAdmin={isAdmin}
                  workspaceId={workspaceId}
                  mentionCandidates={mentionCandidates}
                  mentionsLoading={membersLoading}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
                <div className="border-b border-border/50 last:hidden" />
              </React.Fragment>
            ))}
        </div>
      </ScrollArea>

      {/* New comment editor */}
      {canEdit && (
        <CommentEditor
          workspaceId={workspaceId}
          mentionCandidates={mentionCandidates}
          mentionsLoading={membersLoading}
          onSave={handleCreate}
          placeholder={t`Add a comment or update...`}
        />
      )}
    </div>
  );
};

export default TaskCommentSection;
