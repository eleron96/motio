import React, { useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { Calendar, Plus, Search, X } from 'lucide-react';
import type { ProjectActivity } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { getMonogramColor } from '@/shared/lib/monogramColor';
import { RichTextEditor } from '@/features/planner/components/RichTextEditor';
import { sanitizeCommentRichText } from '@/shared/lib/sanitizer';
import { ACTIVITY_HTML_TAG_RE } from '@/features/projects/lib/projectActivityContent';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import styles from './projectCard.module.css';

interface ActivityBlockProps {
  entries: ProjectActivity[];
  canEdit: boolean;
  formatDate: (iso: string) => string;
  /** Each handler resolves to `true` on success and `false` on failure. */
  onAdd: (content: string) => Promise<boolean>;
  onUpdate: (id: string, content: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
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

const renderRichTextHtml = (raw: string) => {
  if (!raw) return { __html: '' };
  if (ACTIVITY_HTML_TAG_RE.test(raw)) {
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

export const ActivityBlock: React.FC<ActivityBlockProps> = ({
  entries,
  canEdit,
  formatDate,
  onAdd,
  onUpdate,
  onDelete,
  workspaceId,
}) => {
  const isMobile = useIsMobile();
  // M1 mobile: read-only feed. Composer (RTE / textarea) and inline edit /
  // delete come in M2 with mobile-friendly sheet variants. The detail view
  // stays available so users can read full entries.
  const canEditEntries = canEdit && !isMobile;
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [jumpDate, setJumpDate] = useState('');
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
    return list;
  }, [entries, jumpDate, search]);

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
    <section className="flex max-h-[640px] min-h-[320px] flex-col rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Activity`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {entries.length}
        </span>
        {canEditEntries && (
          <button
            type="button"
            className="ml-auto grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={() => setComposerOpen((value) => !value)}
            aria-label={t`Add activity entry`}
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
            placeholder={t`Search activity...`}
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

      {composerOpen && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg bg-muted p-3">
          <RichTextEditor
            value={composerText}
            onChange={setComposerText}
            workspaceId={workspaceId ?? null}
            placeholder={t`Write a comment...`}
            disabled={composerSubmitting}
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

      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-ui-xs text-muted-foreground">
            {entries.length === 0
              ? t`No activity yet. Use + to add the first entry.`
              : t`Nothing matches the current filters.`}
          </div>
        ) : (
          <ol className="flex flex-col">
            {filtered.map((entry) => (
              <li
                key={entry.id}
                className={`${styles.feedItem} cursor-pointer`}
                onClick={() => setOpenItem(entry)}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="text-[11px] tabular-nums text-muted-foreground/80">
                    {formatDate(entry.createdAt)}
                    {entry.isEdited && (
                      <span className="ml-1.5 text-muted-foreground/60">{t`(edited)`}</span>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: getMonogramColor(entry.authorId ?? entry.authorDisplayName) }}
                    />
                    {entry.authorDisplayName}
                  </div>
                </div>
                <div
                  className={`${styles.feedTextClamp} ${styles.feedRichText} text-[14px] leading-[1.5]`}
                  dangerouslySetInnerHTML={renderRichTextHtml(entry.content)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

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
}) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.content);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setText(entry.content);
    setEditing(false);
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
    <RichTextEditor
      value={text}
      onChange={setText}
      workspaceId={workspaceId ?? null}
      placeholder={t`Write a comment...`}
      disabled={busy}
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
      {canEdit && (
        <Button variant="destructive" onClick={() => void handleDelete()} disabled={busy}>
          {t`Delete`}
        </Button>
      )}
      <Button variant="outline" onClick={onClose}>{t`Close`}</Button>
      {canEdit && (
        <Button onClick={() => setEditing(true)}>{t`Edit`}</Button>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>{t`Activity entry`}</SheetTitle>
            <SheetDescription className="sr-only">
              {t`Read or edit a single project activity entry.`}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-3">
            {meta}
            {body}
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              {actions}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t`Activity entry`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Read or edit a single project activity entry.`}
          </DialogDescription>
        </DialogHeader>
        {meta}
        {body}
        <DialogFooter className="gap-2">
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
