import React, { useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import type { Project, Customer } from '@/features/planner/types/planner';
import { buildProjectAccentVars } from '@/features/projects/lib/projectCard/projectAccent';
import styles from './projectCard.module.css';

interface ProjectCardHeaderProps {
  project: Project;
  customer: Customer | null;
  canEdit: boolean;
  /**
   * Resolves to `true` on success and `false` on failure. The form stays in
   * edit mode on failure so the user can retry without losing their draft.
   */
  onSaveStatus: (next: string | null) => Promise<boolean>;
}

export const ProjectCardHeader: React.FC<ProjectCardHeaderProps> = ({
  project,
  customer,
  canEdit,
  onSaveStatus,
}) => {
  const customerLabel = customer?.name ?? t`No customer`;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.status ?? '');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // When the user opens a different project, drop the in-progress draft. We
  // intentionally do NOT depend on `project.status` here — a live-sync update
  // arriving while the user is mid-edit (or while a save is in flight) must
  // not stomp the draft they're typing.
  useEffect(() => {
    setDraft(project.status ?? '');
    setEditing(false);
    setSubmitting(false);
  }, [project.id]);

  const beginEdit = () => {
    if (!canEdit) return;
    setDraft(project.status ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setDraft(project.status ?? '');
    setEditing(false);
  };

  const submit = async () => {
    if (submitting) return;
    const next = draft.trim() ? draft.trim() : null;
    if (next === (project.status ?? null)) {
      setEditing(false);
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSaveStatus(next);
      // Stay in edit mode on failure so the user keeps the draft and can retry.
      if (ok) setEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      style={buildProjectAccentVars(project.color)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-ui-xs text-muted-foreground">
            <span>{t`Projects`}</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="truncate">{customerLabel}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {project.code && (
              <span
                className={`${styles.codePill} rounded-md px-2 py-1 text-[11px] font-semibold text-foreground`}
              >
                [{project.code}]
              </span>
            )}
            <h1 className="break-words text-ui-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
              {project.name}
            </h1>
            {project.archived && (
              <Badge variant="secondary">{t`Archived`}</Badge>
            )}
          </div>
        </div>

        {/* Editable status chip in the top-right of the header. */}
        <div className="flex flex-shrink-0 items-start">
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 shadow-sm"
            >
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancel();
                  }
                }}
                placeholder={t`Project status`}
                className="w-44 bg-transparent text-[12px] font-medium uppercase tracking-wide text-foreground outline-none placeholder:text-muted-foreground/70"
                disabled={submitting}
              />
              <Button type="submit" size="sm" disabled={submitting} className="h-7 px-2.5">
                {t`Save`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancel}
                disabled={submitting}
                className="h-7 px-2.5"
              >
                {t`Cancel`}
              </Button>
            </form>
          ) : project.status ? (
            <button
              type="button"
              onClick={beginEdit}
              disabled={!canEdit}
              title={canEdit ? t`Edit project status` : project.status}
              aria-label={canEdit
                ? t`Edit project status: ${project.status}`
                : t`Project status: ${project.status}`}
              className={`group inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${
                canEdit ? 'hover:bg-foreground hover:text-background' : 'cursor-default'
              }`}
            >
              <span>{project.status}</span>
              {canEdit && (
                <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              )}
            </button>
          ) : canEdit ? (
            <button
              type="button"
              onClick={beginEdit}
              title={t`Add project status`}
              aria-label={t`Add project status`}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              {t`Status`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
