import React, { useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { Calendar, Plus, Search, X } from 'lucide-react';
import type { ProjectActivity } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { getMonogramColor } from '@/shared/lib/monogramColor';
import styles from './projectCard.module.css';

interface ActivityBlockProps {
  entries: ProjectActivity[];
  canEdit: boolean;
  formatDate: (iso: string) => string;
  onAdd: (content: string) => Promise<void>;
  onUpdate: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const ActivityBlock: React.FC<ActivityBlockProps> = ({
  entries,
  canEdit,
  formatDate,
  onAdd,
  onUpdate,
  onDelete,
}) => {
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
        entry.content.toLowerCase().includes(q)
        || entry.authorDisplayName.toLowerCase().includes(q)
      ));
    }
    if (jumpDate) {
      list = list.filter((entry) => entry.createdAt.slice(0, 10) === jumpDate);
    }
    return list;
  }, [entries, jumpDate, search]);

  const submitComposer = async () => {
    const text = composerText.trim();
    if (!text || composerSubmitting) return;
    setComposerSubmitting(true);
    try {
      await onAdd(text);
      setComposerText('');
      setComposerOpen(false);
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
        {canEdit && (
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
          <Textarea
            value={composerText}
            onChange={(event) => setComposerText(event.target.value)}
            placeholder={t`Write a comment...`}
            rows={3}
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
              disabled={!composerText.trim() || composerSubmitting}
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
                <div className={`${styles.feedTextClamp} text-[14px] leading-[1.5]`}>
                  {entry.content}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {openItem && (
        <ActivityModal
          entry={openItem}
          canEdit={canEdit}
          formatDate={formatDate}
          onClose={() => setOpenItem(null)}
          onSave={async (content) => {
            await onUpdate(openItem.id, content);
            setOpenItem(null);
          }}
          onDelete={async () => {
            await onDelete(openItem.id);
            setOpenItem(null);
          }}
        />
      )}
    </section>
  );
};

interface ActivityModalProps {
  entry: ProjectActivity;
  canEdit: boolean;
  formatDate: (iso: string) => string;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

const ActivityModal: React.FC<ActivityModalProps> = ({ entry, canEdit, formatDate, onClose, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.content);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setText(entry.content);
    setEditing(false);
  }, [entry]);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
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

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t`Activity entry`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Read or edit a single project activity entry.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <div className="font-medium">{entry.authorDisplayName}</div>
          <div className="tabular-nums text-muted-foreground">{formatDate(entry.createdAt)}</div>
        </div>
        {editing ? (
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            autoFocus
          />
        ) : (
          <div className="whitespace-pre-wrap break-words text-[14px] leading-[1.55]">
            {entry.content}
          </div>
        )}
        <DialogFooter className="gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setText(entry.content); }} disabled={busy}>
                {t`Cancel`}
              </Button>
              <Button onClick={() => void handleSave()} disabled={busy || !text.trim()}>
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
