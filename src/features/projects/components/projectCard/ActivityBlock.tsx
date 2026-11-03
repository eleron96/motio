import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { Calendar, Image as ImageIcon, Pin, Plus, Search, X } from 'lucide-react';
import type { ProjectActivity } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { getMonogramColor } from '@/shared/lib/monogramColor';
import { usePersonColors } from '@/features/planner/hooks/usePersonColors';
import { RichTextEditor } from '@/features/planner/components/RichTextEditor';
import {
  buildFeedSnippetHtml,
  buildSearchSnippetHtml,
  hasActivityImage,
  isContentMeaningful,
  stripHtmlForSearch,
} from '@/features/projects/lib/projectActivityHtml';
import { ActivityModal } from './ActivityModal';
import { useIsMobile } from '@/shared/hooks/use-mobile';
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
  const personColors = usePersonColors();
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
                {hasActivityImage(entry.content) && (
                  // The clamped preview strips <img> tags, so an image-only note
                  // would otherwise look empty — this badge is the only hint the
                  // note carries a picture until it's opened.
                  <span
                    className="inline-flex items-center text-muted-foreground/70"
                    title={t`Contains an image`}
                    aria-label={t`Contains an image`}
                  >
                    <ImageIcon className="h-3 w-3" aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: (entry.authorId ? personColors.byUserId.get(entry.authorId) : undefined)
                      ?? getMonogramColor(entry.authorId ?? entry.authorDisplayName),
                  }}
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
                  dangerouslySetInnerHTML={{ __html: buildFeedSnippetHtml(entry.content, styles.feedRowBlockquote) }}
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
