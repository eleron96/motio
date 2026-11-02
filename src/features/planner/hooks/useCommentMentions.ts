import { type KeyboardEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getCommentMentionPopoverPosition } from '@/features/planner/lib/commentMentionPopoverPosition';
import {
  createEditorTextRange,
  getEditorTextBeforeCaret,
  getSelectionRangeWithinEditor,
  isVisibleRect,
} from '@/features/planner/lib/commentEditorDom';
import { type TaskCommentMentionCandidate } from '@/shared/domain/taskCommentMentionCandidates';

type MentionAnchorSource = 'button' | 'caret';

interface UseCommentMentionsOptions {
  editorRef: RefObject<HTMLDivElement>;
  mentionButtonRef: RefObject<HTMLButtonElement>;
  candidates: TaskCommentMentionCandidate[];
  saveSelection: () => void;
  restoreSelection: () => void;
  syncFromEditor: () => void;
}

/**
 * The @-mention picker of the comment editor: spotting an open `@` before the
 * caret, filtering people by what follows it, keeping the popover next to the
 * caret (or the @ button) as the page, the keyboard or the selection move, and
 * swapping the typed `@query` for a mention chip.
 */
export const useCommentMentions = ({
  editorRef,
  mentionButtonRef,
  candidates: mentionCandidates,
  saveSelection,
  restoreSelection,
  syncFromEditor,
}: UseCommentMentionsOptions) => {
  const mentionQueryRef = useRef<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(null);
  const [mentionAnchorSource, setMentionAnchorSource] = useState<MentionAnchorSource | null>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [mentionPopoverPosition, setMentionPopoverPosition] = useState<ReturnType<
    typeof getCommentMentionPopoverPosition
  > | null>(null);


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
  }, [editorRef]);

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
  }, [editorRef, mentionButtonRef]);

  const refreshMentionAnchor = useCallback(() => {
    if (!mentionAnchorSource) return;
    if (mentionAnchorSource === 'button') {
      syncMentionAnchor('button', mentionButtonRef.current);
      return;
    }
    syncMentionAnchor('caret', editorRef.current);
  }, [editorRef, mentionAnchorSource, mentionButtonRef, syncMentionAnchor]);

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
    [closeMention, detectMentionContext, editorRef, restoreSelection, saveSelection, syncFromEditor],
  );

  const syncMentionPopoverPosition = useCallback(() => {
    if (!mentionOpen || !mentionAnchorRect) {
      setMentionPopoverPosition(null);
      return;
    }

    const popoverElement = mentionListRef.current;
    // Measure the height the list WANTS, with the previous cap lifted. Reading
    // it capped would make "does it fit below?" true by construction, and the
    // popover would latch onto the cramped side and stay cropped there even
    // after the room came back. This runs inside a layout effect, so the clear
    // and restore both happen before the next paint.
    let naturalHeight = 224;
    if (popoverElement) {
      const cappedMaxHeight = popoverElement.style.maxHeight;
      popoverElement.style.maxHeight = 'none';
      naturalHeight = popoverElement.offsetHeight || naturalHeight;
      popoverElement.style.maxHeight = cappedMaxHeight;
    }
    // The visible band, not the whole layout viewport. iOS does not shrink the
    // layout viewport for the keyboard, so `window.innerHeight` still counts the
    // strip the keyboard covers — measured against it, the popover looks like it
    // has plenty of room below the caret and gets placed under the keyboard.
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const nextPosition = getCommentMentionPopoverPosition({
      anchorRect: mentionAnchorRect,
      popoverSize: {
        width: popoverElement?.offsetWidth || 256,
        height: naturalHeight,
      },
      viewportSize: {
        width: vv?.width ?? window.innerWidth,
        height: vv?.height ?? window.innerHeight,
      },
      // Both the anchor rect and a `position: fixed` popover live in client
      // coordinates, so the offsets are the whole conversion — no scaling.
      viewportOrigin: { top: vv?.offsetTop ?? 0, left: vv?.offsetLeft ?? 0 },
    });

    setMentionPopoverPosition((current) => (
      current &&
      current.top === nextPosition.top &&
      current.left === nextPosition.left &&
      current.placement === nextPosition.placement &&
      current.maxHeight === nextPosition.maxHeight
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
    // Opening the keyboard fires neither of the two above — the layout viewport
    // never changes and the page never scrolls. Only the visual viewport moves,
    // so without these the popover would keep its stale, buried position.
    const vv = window.visualViewport;
    vv?.addEventListener('resize', handleResize);
    vv?.addEventListener('scroll', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      vv?.removeEventListener('resize', handleResize);
      vv?.removeEventListener('scroll', handleResize);
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
  }, [editorRef, mentionAnchorSource, mentionOpen, refreshMentionAnchor]);

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
  }, [closeMention, editorRef, mentionButtonRef, mentionOpen]);

  /** The @ button: types "@" at the caret and opens the picker under the button. */
  const openFromButton = useCallback(() => {
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
  }, [editorRef, mentionButtonRef, restoreSelection, saveSelection, syncMentionAnchor]);

  /** After each input: open, follow or close the picker by the text before the caret. */
  const handleEditorInput = () => {
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
    } else if (mentionOpen) {
      closeMention();
    }
  };

  /** Arrows, Enter and Escape while the picker is open; true when the key was taken. */
  const handleEditorKeyDown = (e: KeyboardEvent<HTMLDivElement>): boolean => {
    if (!mentionOpen) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionHighlight((h) => Math.min(h + 1, filteredMentionCandidates.length - 1));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionHighlight((h) => Math.max(h - 1, 0));
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const candidate = filteredMentionCandidates[mentionHighlight];
      if (candidate) insertMention(candidate);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMention();
      return true;
    }
    return false;
  };

  return {
    mentionOpen,
    filteredMentionCandidates,
    mentionHighlight,
    setMentionHighlight,
    mentionPopoverPosition,
    mentionListRef,
    insertMention,
    openFromButton,
    handleEditorInput,
    handleEditorKeyDown,
  };
};
