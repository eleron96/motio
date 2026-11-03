import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Image, AtSign } from 'lucide-react';
import { t } from '@lingui/macro';
import { normalizePastedCommentHtml } from '@/shared/lib/pastedRichText';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';
import {
  getCommentPlainLength,
  COMMENT_MAX_PLAIN_LENGTH,
} from '@/infrastructure/tasks/taskCommentsRepository';
import { uploadTaskMedia } from '@/infrastructure/tasks/taskMediaRepository';
import { toast } from '@/shared/ui/sonner';
import { type TaskCommentMentionCandidate } from '@/shared/domain/taskCommentMentionCandidates';
import { extractEditorValue, setEditorValue } from '@/features/planner/lib/commentEditorDom';
import { buildEditorImageHtml, defaultImageWidth, MIN_IMAGE_WIDTH } from '@/features/planner/lib/richTextEditorDom';
import { RICH_TEXT_TOOLBAR_GROUPS } from '@/features/planner/lib/richTextToolbarGroups';
import { useCommentMentions } from '@/features/planner/hooks/useCommentMentions';
import { CommentMentionPopover } from '@/features/planner/components/CommentMentionPopover';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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
  /** Plain text of the draft as it changes ('' once saved), for live drafts. */
  onDraftTextChange?: (text: string) => void;
  /** Whether the draft holds anything unsent (text or an image). */
  onDraftDirtyChange?: (dirty: boolean) => void;
  /**
   * Empty the editor as soon as Save is pressed, and put the text back if the
   * save fails — for the new-comment box, whose comment is already shown in
   * the list while it is on its way.
   */
  emptyWhileSaving?: boolean;
}

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
  onDraftTextChange,
  onDraftDirtyChange,
  emptyWhileSaving = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionButtonRef = useRef<HTMLButtonElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const lastValueRef = useRef(initialValue);
  const onDraftTextChangeRef = useRef(onDraftTextChange);
  onDraftTextChangeRef.current = onDraftTextChange;
  const dragDepthRef = useRef(0);
  const resizeStateRef = useRef<{
    img: HTMLImageElement; startX: number; startY: number; startWidth: number;
  } | null>(null);

  const [plainLength, setPlainLength] = useState(0);
  // Whether the draft holds anything worth sending — text or an image. Gates
  // the save button instead of the plain-text count, which is 0 for a
  // screenshot-only comment and used to leave that button dead.
  const [hasDraft, setHasDraft] = useState(initialValue.trim().length > 0);
  const onDraftDirtyChangeRef = useRef(onDraftDirtyChange);
  onDraftDirtyChangeRef.current = onDraftDirtyChange;
  useEffect(() => {
    onDraftDirtyChangeRef.current?.(hasDraft);
  }, [hasDraft]);
  useEffect(() => () => onDraftDirtyChangeRef.current?.(false), []);
  const [saving, setSaving] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  // ── initialise editor
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setEditorValue(editor, initialValue);
    lastValueRef.current = initialValue;
    setPlainLength(getCommentPlainLength(initialValue));
    setHasDraft(initialValue.trim().length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncFromEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = extractEditorValue(editor);
    if (next === lastValueRef.current) return;
    lastValueRef.current = next;
    setPlainLength(getCommentPlainLength(next));
    setHasDraft(next.trim().length > 0);
    onDraftTextChangeRef.current?.(editor.textContent ?? '');
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

  const mentions = useCommentMentions({
    editorRef,
    mentionButtonRef,
    candidates: mentionCandidates,
    saveSelection,
    restoreSelection,
    syncFromEditor,
  });

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

  // ── images: same markup and default width as the description editor
  const insertImage = useCallback(
    (src: string, alt: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      restoreSelection();
      editor.focus();
      document.execCommand('insertHTML', false, buildEditorImageHtml(src, alt, defaultImageWidth(editor)));
      saveSelection();
      syncFromEditor();
    },
    [restoreSelection, saveSelection, syncFromEditor],
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
    const clearDraft = () => {
      const editor = editorRef.current;
      if (editor) { editor.innerHTML = ''; lastValueRef.current = ''; }
      setPlainLength(0);
      setHasDraft(false);
      onDraftTextChangeRef.current?.('');
    };
    setSaving(true);
    if (emptyWhileSaving) clearDraft();
    try {
      await onSave(html);
      if (!emptyWhileSaving) clearDraft();
    } catch {
      // Keep the draft so the user can retry after a failed save: put it back,
      // unless the next comment is being typed already.
      const editor = editorRef.current;
      if (emptyWhileSaving && editor && !lastValueRef.current.trim()) {
        setEditorValue(editor, html);
        syncFromEditor();
      }
    } finally {
      setSaving(false);
    }
  }, [emptyWhileSaving, onSave, plainLength, syncFromEditor]);

  const isOverLimit = plainLength > COMMENT_MAX_PLAIN_LENGTH;

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-secondary/70 px-2 py-1.5">
        {RICH_TEXT_TOOLBAR_GROUPS.map((group, groupIndex) => (
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
          onClick={mentions.openFromButton}
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
          mentions.handleEditorInput();
        }}
        onKeyDown={(e) => {
          if (mentions.handleEditorKeyDown(e)) return;
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

      <CommentMentionPopover
        open={mentions.mentionOpen}
        position={mentions.mentionPopoverPosition}
        listRef={mentions.mentionListRef}
        loading={mentionsLoading}
        candidates={mentions.filteredMentionCandidates}
        highlight={mentions.mentionHighlight}
        onPick={mentions.insertMention}
        onHover={mentions.setMentionHighlight}
      />

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
            disabled={saving || disabled || isOverLimit || !hasDraft}
          >
            {saveLabel ?? t`Save`}
          </Button>
        </div>
      </div>
    </div>
  );
};
