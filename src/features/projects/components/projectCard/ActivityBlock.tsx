import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { Calendar, MoreHorizontal, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react';
import type { ProjectActivity } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { getMonogramColor } from '@/shared/lib/monogramColor';
import { RichTextEditor } from '@/features/planner/components/RichTextEditor';
import { sanitizeCommentRichText } from '@/shared/lib/sanitizer';
import { ACTIVITY_HTML_TAG_RE } from '@/features/projects/lib/projectActivityContent';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useKeyboardOffset } from '@/shared/hooks/useKeyboardOffset';
import { MobileNoteSheet } from './MobileNoteSheet';
import styles from './projectCard.module.css';

interface ActivityBlockProps {
  entries: ProjectActivity[];
  canEdit: boolean;
  formatDate: (iso: string) => string;
  /** Each handler resolves to `true` on success and `false` on failure. */
  onAdd: (content: string) => Promise<boolean>;
  onUpdate: (id: string, content: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  /** Toggle the pinned flag on a note. Pinned notes float to the top of the feed. */
  onSetPinned: (id: string, pinned: boolean) => Promise<boolean>;
  /** Workspace id used by RichTextEditor for image uploads. */
  workspaceId?: string | null;
}

const IMG_TAG_RE = /<img\b/i;
const ALL_TAGS_RE = /<[^>]+>/g;

const isContentMeaningful = (raw: string) => {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (IMG_TAG_RE.test(trimmed)) return true;
  const text = trimmed.replace(ALL_TAGS_RE, '').replace(/&nbsp;/gi, ' ').trim();
  return text.length > 0;
};

const stripHtmlForSearch = (raw: string) => {
  if (!ACTIVITY_HTML_TAG_RE.test(raw)) return raw;
  return raw.replace(ALL_TAGS_RE, ' ').replace(/&nbsp;/gi, ' ');
};

const escapeHtml = (raw: string): string => (
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
);

/**
 * Build an HTML fragment that shows a snippet of `content` centered on the
 * first occurrence of `query`, with the matched substring wrapped in `<mark>`.
 * Adds `…` ellipses when the snippet is trimmed at either edge.
 *
 * Returns `null` when there is no match — callers can fall back to the regular
 * note body in that case.
 */
const buildSearchSnippetHtml = (content: string, query: string): string | null => {
  const text = stripHtmlForSearch(content).replace(/\s+/g, ' ').trim();
  if (!text || !query) return null;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return null;
  const CONTEXT_BEFORE = 40;
  const CONTEXT_AFTER = 80;
  const start = Math.max(0, idx - CONTEXT_BEFORE);
  const end = Math.min(text.length, idx + query.length + CONTEXT_AFTER);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const before = escapeHtml(text.slice(start, idx));
  const matched = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length, end));
  return `${prefix}${before}<mark>${matched}</mark>${after}${suffix}`;
};

const renderRichTextHtml = (raw: string) => {
  if (!raw) return { __html: '' };
  if (ACTIVITY_HTML_TAG_RE.test(raw)) {
    // For the read-modal we trust the editor's HTML wholesale (after
    // DOMPurify): block structure (p/div/ul/ol/li/blockquote) survives,
    // inline formatting (b/strong/i/em/u/s/strike/span/img) survives. The
    // wrapper `.feedRichText` class in projectCard.module.css provides the
    // visual styling for every allowed tag (list bullets, blockquote
    // indent, bold/italic/underline, image clamping). Previous versions
    // flattened block tags to `<br>` to dodge browser-specific spacing,
    // but that killed list markers + quote indents entirely, so the user
    // saw no formatting outside edit mode.
    return { __html: sanitizeCommentRichText(raw) };
  }
  // Plain text — preserve newlines via <br>. Escapes literal angle brackets
  // so user input like `<200 sq ft>` renders as text rather than vanishing
  // (it doesn't match the allowlist regex above, so we land here).
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return { __html: escaped };
};

/**
 * Build the HTML snippet for a feed row (the compact preview under each
 * entry). Keeps inline formatting (`<b>`, `<strong>`, `<i>`, `<em>`, `<u>`,
 * `<s>`, `<strike>`, `<span>`) so users see bold / italic / underline /
 * strike at a glance — same way a chat list shows formatted messages.
 *
 * Block tags (`<p>`, `<div>`, `<blockquote>`, `<li>`, `<h1-6>`) collapse to
 * `<br>` for line breaks. Images and list containers (`<ul>`, `<ol>`) are
 * stripped — bullets/numbers would break `-webkit-line-clamp` and images
 * don't belong in a tight preview row anyway. Users see the full version
 * in the modal.
 *
 * Why inline-only: `-webkit-box` + `-webkit-line-clamp` (the only cross-
 * browser N-line clamp) only honours inline children. Block descendants
 * break the clamp silently. So we flatten everything to one inline run
 * with `<br>` line breaks, which clamps reliably across browsers.
 */
const buildFeedSnippetHtml = (raw: string): string => {
  if (!raw) return '';
  if (!ACTIVITY_HTML_TAG_RE.test(raw)) {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }
  const sanitized = sanitizeCommentRichText(raw);
  // Wrap blockquote in an inline <span> with our CSS-module class so we keep
  // a visible "this is a quote" indicator (italic + left border) inside the
  // clamped row. A block <blockquote> would break `-webkit-line-clamp`, so we
  // demote it to inline + use border-left on inline-block via CSS.
  const blockquoteClass = styles.feedRowBlockquote;
  return sanitized
    .replace(/<blockquote[^>]*>/gi, `<span class="${blockquoteClass}">`)
    .replace(/<\/blockquote>/gi, '</span><br>')
    // Other block boundaries become explicit <br>.
    .replace(/<\/(p|div|li|h[1-6])>/gi, '<br>')
    // Drop block-opening tags + list containers + images — keep inline
    // formatting (b/strong/i/em/u/s/strike/span).
    .replace(/<(p|div|li|ul|ol|h[1-6])[^>]*>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    // Cap consecutive <br>s so multi-paragraph entries don't eat the
    // whole 5-line clamp window with blank lines.
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    // Trim leading/trailing whitespace and <br>s.
    .replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '');
};

export const ActivityBlock: React.FC<ActivityBlockProps> = ({
  entries,
  canEdit,
  formatDate,
  onAdd,
  onUpdate,
  onDelete,
  onSetPinned,
  workspaceId,
}) => {
  const isMobile = useIsMobile();
  // M2: mobile users can publish + edit entries via bottom sheets. The
  // desktop inline RTE composer remains the same.
  const canEditEntries = canEdit;
  const useMobileComposer = canEdit && isMobile;
  const useDesktopComposer = canEdit && !isMobile;

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [mobileComposerOpen, setMobileComposerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [jumpDate, setJumpDate] = useState('');

  // Chat-style auto-scroll: park the feed at the bottom on initial mount and
  // whenever new entries arrive — but only if the user is already at (or
  // near) the bottom. If they've scrolled up to read older notes, leave
  // their position alone. `stickToBottomRef` flips on scroll and updates the
  // intent for subsequent layout passes.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastEntryIdRef = useRef<string | null>(null);
  const initialMountRef = useRef(true);
  const [openItem, setOpenItem] = useState<ProjectActivity | null>(null);

  const filtered = useMemo(() => {
    let list = entries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((entry) => (
        stripHtmlForSearch(entry.content).toLowerCase().includes(q)
        || entry.authorDisplayName.toLowerCase().includes(q)
      ));
    }
    if (jumpDate) {
      list = list.filter((entry) => entry.createdAt.slice(0, 10) === jumpDate);
    }
    // Pinned notes float to the top; within each group (pinned and non-pinned)
    // sort ascending by created_at — oldest first, newest at the bottom. The
    // SELECT returns DESC, so we explicitly reverse via localeCompare on the
    // ISO timestamp.
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [entries, jumpDate, search]);

  // Auto-scroll the feed to the bottom on initial mount and whenever a new
  // entry slides in at the end — but only when the user is parked at (or
  // near) the bottom. The threshold is generous (~80px) so the script feels
  // forgiving on touch trackpads where small inertial drifts are common.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const lastId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
    const lastChanged = lastId !== lastEntryIdRef.current;
    if (initialMountRef.current || (stickToBottomRef.current && lastChanged)) {
      container.scrollTop = container.scrollHeight;
      initialMountRef.current = false;
    }
    lastEntryIdRef.current = lastId;
  }, [filtered]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  };

  const submitComposer = async () => {
    if (composerSubmitting) return;
    if (!isContentMeaningful(composerText)) return;
    setComposerSubmitting(true);
    try {
      const ok = await onAdd(composerText);
      if (ok) {
        setComposerText('');
        setComposerOpen(false);
      }
    } finally {
      setComposerSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-[320px] flex-col rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Notes`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {entries.length}
        </span>
        {canEditEntries && (
          <button
            type="button"
            className="ml-auto grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={() => {
              if (isMobile) {
                setMobileComposerOpen(true);
              } else {
                setComposerOpen((value) => !value);
              }
            }}
            aria-label={t`Add note`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t`Search notes...`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="date"
            className="bg-transparent text-[12px] outline-none"
            value={jumpDate}
            onChange={(event) => setJumpDate(event.target.value)}
            aria-label={t`Jump to date`}
          />
          {jumpDate && (
            <button
              type="button"
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:text-foreground"
              onClick={() => setJumpDate('')}
              aria-label={t`Clear date filter`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {composerOpen && useDesktopComposer && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg bg-muted p-3">
          <RichTextEditor
            value={composerText}
            onChange={setComposerText}
            workspaceId={workspaceId ?? null}
            placeholder={t`Write a comment...`}
            disabled={composerSubmitting}
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComposerOpen(false);
                setComposerText('');
              }}
              disabled={composerSubmitting}
            >
              {t`Cancel`}
            </Button>
            <Button
              size="sm"
              onClick={() => void submitComposer()}
              disabled={!isContentMeaningful(composerText) || composerSubmitting}
            >
              {t`Publish`}
            </Button>
          </div>
        </div>
      )}

      {(() => {
        // Split into pinned (static block above the scroll area) + unpinned
        // (inside the scrollable area). Two-section layout means several
        // pinned rows simply stack vertically without overlapping — sticky
        // positioning is no longer needed and the unpinned scroll window
        // keeps its capped height independent of how many pinned exist.
        const pinnedItems = filtered.filter((entry) => entry.pinned);
        const unpinnedItems = filtered.filter((entry) => !entry.pinned);

        const renderEntry = (entry: ProjectActivity) => (
          <li
            key={entry.id}
            className={`${styles.feedItem} cursor-pointer ${entry.pinned ? styles.feedItemPinned : ''}`}
            onClick={() => setOpenItem(entry)}
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground/80">
                <span>{formatDate(entry.createdAt)}</span>
                {entry.isEdited && (
                  <span className="text-muted-foreground/60">{t`(edited)`}</span>
                )}
              </div>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: getMonogramColor(entry.authorId ?? entry.authorDisplayName) }}
                />
                <span>{entry.authorDisplayName}</span>
                {canEditEntries ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      // Don't open the modal — the row's onClick fires
                      // on the parent <li>, so we cancel propagation.
                      event.stopPropagation();
                      void onSetPinned(entry.id, !entry.pinned);
                    }}
                    aria-label={entry.pinned ? t`Unpin` : t`Pin to top`}
                    title={entry.pinned ? t`Unpin` : t`Pin to top`}
                    className={`ml-1 grid h-6 w-6 place-items-center rounded transition-colors ${
                      entry.pinned
                        ? 'text-amber-500 hover:text-amber-600'
                        : 'text-muted-foreground/40 hover:text-amber-500'
                    }`}
                  >
                    <Pin className={`h-3.5 w-3.5 ${entry.pinned ? 'fill-amber-500' : ''}`} aria-hidden="true" />
                  </button>
                ) : entry.pinned ? (
                  <Pin
                    className="ml-1 h-3 w-3 text-amber-500 fill-amber-500"
                    aria-label={t`Pinned`}
                  />
                ) : null}
              </div>
            </div>
            {(() => {
              const trimmedQuery = search.trim();
              const snippet = trimmedQuery
                ? buildSearchSnippetHtml(entry.content, trimmedQuery)
                : null;
              if (snippet) {
                return (
                  <div
                    className={`${styles.feedSnippet} text-[13px] leading-[1.5] text-muted-foreground`}
                    dangerouslySetInnerHTML={{ __html: snippet }}
                  />
                );
              }
              return (
                <div
                  className={`${styles.feedTextClamp} ${styles.feedRowRichText} text-[14px] leading-[1.5]`}
                  dangerouslySetInnerHTML={{ __html: buildFeedSnippetHtml(entry.content) }}
                />
              );
            })()}
          </li>
        );

        if (filtered.length === 0) {
          return (
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 lg:max-h-[420px]">
              <div className="py-8 text-center text-ui-xs text-muted-foreground">
                {entries.length === 0
                  ? t`No notes yet. Use + to add the first one.`
                  : t`Nothing matches the current filters.`}
              </div>
            </div>
          );
        }

        return (
          <>
            {/* Pinned section — statically laid out above the scroll area
                so multiple pinned rows simply stack without overlapping.
                The amber left-border + drop-shadow on the last row still
                separate pinned from the unpinned content below. */}
            {pinnedItems.length > 0 && (
              // Pinned section renders at its full natural height — no
              // internal scroll, no max-height cap. The whole Notes
              // block grows taller when there are many pinned notes.
              // `flex-shrink-0` keeps every pinned row visible even if
              // the parent is constrained.
              <ol
                className={`flex flex-shrink-0 flex-col pr-2 ${styles.feedPinnedSection}`}
              >
                {pinnedItems.map(renderEntry)}
              </ol>
            )}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              // Desktop: cap visible *unpinned* feed to ~5 rows (≈80 px
              // each) so the scrollable region never grows past one
              // card-height. Pinned section above grows the block as
              // needed without compressing this scroll window. Below
              // `lg`, the parent flex handles scrolling along with the
              // page.
              className="flex-shrink-0 overflow-y-auto pr-2 lg:max-h-[420px]"
            >
              {unpinnedItems.length === 0 ? (
                <div className="py-8 text-center text-ui-xs text-muted-foreground">
                  {t`No more notes — everything currently visible is pinned.`}
                </div>
              ) : (
                <ol className="flex flex-col">
                  {unpinnedItems.map(renderEntry)}
                </ol>
              )}
            </div>
          </>
        );
      })()}

      {openItem && (
        <ActivityModal
          entry={openItem}
          canEdit={canEditEntries}
          isMobile={isMobile}
          formatDate={formatDate}
          workspaceId={workspaceId}
          onClose={() => setOpenItem(null)}
          onSave={async (content) => {
            const ok = await onUpdate(openItem.id, content);
            if (ok) setOpenItem(null);
            return ok;
          }}
          onDelete={async () => {
            const ok = await onDelete(openItem.id);
            if (ok) setOpenItem(null);
            return ok;
          }}
          onTogglePinned={async () => {
            await onSetPinned(openItem.id, !openItem.pinned);
          }}
        />
      )}

      {useMobileComposer && (
        <MobileNoteSheet
          open={mobileComposerOpen}
          onClose={() => setMobileComposerOpen(false)}
          onSave={onAdd}
          title={t`Add note`}
          description={t`Write a note that will appear in the project notes.`}
          placeholder={t`Write a comment...`}
          saveLabel={t`Publish`}
          workspaceId={workspaceId}
        />
      )}
    </section>
  );
};

interface ActivityModalProps {
  entry: ProjectActivity;
  canEdit: boolean;
  /** When true, render as a bottom sheet instead of a centered dialog. */
  isMobile?: boolean;
  formatDate: (iso: string) => string;
  workspaceId?: string | null;
  onClose: () => void;
  /** Resolves to `true` on success; the modal closes itself on success only. */
  onSave: (content: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  /** Toggles the pinned flag on the open entry; modal stays open. */
  onTogglePinned: () => Promise<void>;
}

const ActivityModal: React.FC<ActivityModalProps> = ({
  entry,
  canEdit,
  isMobile = false,
  formatDate,
  workspaceId,
  onClose,
  onSave,
  onDelete,
  onTogglePinned,
}) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.content);
  const [busy, setBusy] = useState(false);
  // Mobile-only: explicit confirm step replaces the inline destructive button
  // so users don't accidentally tap "Delete" while reaching for "Edit".
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [togglingPin, setTogglingPin] = useState(false);
  const { offset: keyboardOffset, height: viewportHeight } = useKeyboardOffset();

  const handleTogglePin = async () => {
    if (togglingPin) return;
    setTogglingPin(true);
    try {
      await onTogglePinned();
    } finally {
      setTogglingPin(false);
    }
  };

  useEffect(() => {
    setText(entry.content);
    setEditing(false);
    setConfirmingDelete(false);
  }, [entry]);

  const handleSave = async () => {
    if (busy) return;
    if (!isContentMeaningful(text)) return;
    setBusy(true);
    try {
      // Parent closes the modal only on success; on failure we stay in edit
      // mode so the user keeps their draft and can retry.
      await onSave(text);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  const meta = (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <div className="font-medium">{entry.authorDisplayName}</div>
      <div className="tabular-nums text-muted-foreground">{formatDate(entry.createdAt)}</div>
    </div>
  );

  const body = editing ? (
    // Same RTE on mobile and desktop — formatting + image upload requested
    // by users post-M2. The toolbar is small on touch but functional.
    // Auto-focus so the user can paste / type the moment they tap Edit.
    <RichTextEditor
      value={text}
      onChange={setText}
      workspaceId={workspaceId ?? null}
      placeholder={t`Write a comment...`}
      disabled={busy}
      autoFocus
    />
  ) : (
    <div
      className={`${styles.feedRichText} break-words text-[14px] leading-[1.55]`}
      dangerouslySetInnerHTML={renderRichTextHtml(entry.content)}
    />
  );

  const actions = editing ? (
    <>
      <Button variant="outline" onClick={() => { setEditing(false); setText(entry.content); }} disabled={busy}>
        {t`Cancel`}
      </Button>
      <Button onClick={() => void handleSave()} disabled={busy || !isContentMeaningful(text)}>
        {t`Save`}
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={onClose}>{t`Close`}</Button>
      {canEdit && (
        <Button onClick={() => setEditing(true)}>{t`Edit`}</Button>
      )}
    </>
  );

  if (isMobile) {
    // Mobile read mode: header carries the title + a kebab `⋯` menu for the
    // destructive action (Delete). The bottom row holds a single full-width
    // Edit button so the primary task — "look at the note, maybe edit it" —
    // is one tap away. Sheet's built-in X covers the close affordance.
    //
    // Mobile edit mode: same Save / Cancel pair as desktop, but full-width
    // and h-11 for comfortable touch targets.
    //
    // Tapping Delete from the menu replaces the bottom area with an inline
    // confirm prompt — no second sheet stacked on top, just a momentary
    // "Are you sure?" within the same surface.
    return (
      <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
        <SheetContent
          side="bottom"
          className="overflow-y-auto rounded-t-2xl"
          style={{
            bottom: keyboardOffset,
            maxHeight: viewportHeight ? `${viewportHeight}px` : undefined,
            transition: 'bottom 150ms ease-out',
          }}
        >
          <SheetHeader className="text-left">
            <div className="flex items-start justify-between gap-2 pr-8">
              <SheetTitle>{t`Note`}</SheetTitle>
              {canEdit && !editing && !confirmingDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 -mt-1"
                      aria-label={t`More actions`}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        void handleTogglePin();
                      }}
                      disabled={togglingPin}
                    >
                      {entry.pinned ? (
                        <>
                          <PinOff className="mr-2 h-4 w-4" aria-hidden="true" />
                          {t`Unpin`}
                        </>
                      ) : (
                        <>
                          <Pin className="mr-2 h-4 w-4" aria-hidden="true" />
                          {t`Pin to top`}
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(event) => {
                        event.preventDefault();
                        setConfirmingDelete(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t`Delete`}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <SheetDescription className="sr-only">
              {t`Read or edit a single project note.`}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-3">
            {meta}
            {body}
            {confirmingDelete ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-[13px] text-foreground">
                  {t`Delete this note? This cannot be undone.`}
                </div>
                <div className="mt-3 flex gap-2 pb-[env(safe-area-inset-bottom)]">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={busy}
                  >
                    {t`Cancel`}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-11 flex-1"
                    onClick={() => void handleDelete()}
                    disabled={busy}
                  >
                    {t`Delete`}
                  </Button>
                </div>
              </div>
            ) : editing ? (
              <div className="mt-1 flex gap-2 pb-[env(safe-area-inset-bottom)]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => { setEditing(false); setText(entry.content); }}
                  disabled={busy}
                >
                  {t`Cancel`}
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-1"
                  onClick={() => void handleSave()}
                  disabled={busy || !isContentMeaningful(text)}
                >
                  {t`Save`}
                </Button>
              </div>
            ) : canEdit ? (
              <Button
                type="button"
                className="mt-1 h-11 w-full pb-[env(safe-area-inset-bottom)]"
                onClick={() => setEditing(true)}
              >
                {t`Edit`}
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t`Note`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Read or edit a single project note.`}
          </DialogDescription>
        </DialogHeader>
        {meta}
        {body}
        <DialogFooter className="gap-2">
          {actions}
        </DialogFooter>
        {/* Top-right kebab carries the secondary actions (Pin / Delete) so
            the action row stays clean and the destructive option needs a
            deliberate two-tap path. Rendered last in the DOM order so
            Radix's focus trap doesn't park initial focus on it when the
            user toggles read↔edit. The dialog's built-in close X sits at
            right-4 top-4; this kebab nests just to its left. */}
        {canEdit && !editing && (
          <div className="absolute right-12 top-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={t`More actions`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleTogglePin();
                  }}
                  disabled={togglingPin}
                >
                  {entry.pinned ? (
                    <>
                      <PinOff className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t`Unpin`}
                    </>
                  ) : (
                    <>
                      <Pin className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t`Pin to top`}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleDelete();
                  }}
                  disabled={busy}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t`Delete`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
