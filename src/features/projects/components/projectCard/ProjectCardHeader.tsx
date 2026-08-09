import React, { useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { MoreHorizontal, Pencil, Plus, Star } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { Project, Customer } from '@/features/planner/types/planner';
import { buildProjectAccentVars } from '@/features/projects/lib/projectCard/projectAccent';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobileTextSheet } from './MobileTextSheet';
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
  /** Per-user tracking ("star") — same model the sidebar uses. */
  isTracked: boolean;
  onToggleTracked: () => void;
  /** Optional kebab-menu actions; rendered alongside the star when at least
   * `onOpenSettings` is provided. */
  onOpenSettings?: () => void;
  onToggleArchived?: () => void;
  onRequestDelete?: () => void;
}

export const ProjectCardHeader: React.FC<ProjectCardHeaderProps> = ({
  project,
  customer,
  canEdit,
  onSaveStatus,
  isTracked,
  onToggleTracked,
  onOpenSettings,
  onToggleArchived,
  onRequestDelete,
}) => {
  const customerLabel = customer?.name ?? t`No customer`;

  // Desktop opens an inline form; mobile opens a bottom sheet (M2). The chip
  // itself is interactive whenever the user has edit permission — mobile no
  // longer renders it as a disabled label.
  const isMobile = useIsMobile();
  const canEditStatus = canEdit;
  const canEditInline = canEdit && !isMobile;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.status ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
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
    setMobileSheetOpen(false);
  }, [project.id]);

  const beginEdit = () => {
    if (!canEditStatus) return;
    setDraft(project.status ?? '');
    if (isMobile) {
      setMobileSheetOpen(true);
      return;
    }
    setEditing(true);
  };

  const handleMobileSave = async (next: string): Promise<boolean> => {
    const normalized = next.trim() ? next.trim() : null;
    if (normalized === (project.status ?? null)) {
      // No change — close sheet without firing a network request.
      return true;
    }
    return onSaveStatus(normalized);
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
      {/* The breadcrumb shares its line with the actions; the name gets a line
          of its own. Keeping the name in a column next to the status chip, the
          star and the kebab left it about 140px on a phone — narrow enough that
          "Вернадского, 12Б" broke in the middle of a word. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-ui-xs text-muted-foreground">
            <span>{t`Projects`}</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="truncate">{customerLabel}</span>
          </div>
        </div>

        {/* Editable status chip + Star (track) + kebab menu in the top-right
            of the header. Star toggles instantly; kebab carries Edit /
            Archive / Delete (gated on canEdit). */}
        <div className="flex flex-shrink-0 items-start gap-1.5">
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
              disabled={!canEditStatus}
              title={canEditStatus ? t`Edit project status` : project.status}
              aria-label={canEditStatus
                ? t`Edit project status: ${project.status}`
                : t`Project status: ${project.status}`}
              className={`group inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${
                canEditStatus ? 'hover:bg-foreground hover:text-background' : 'cursor-default'
              }`}
            >
              <span>{project.status}</span>
              {canEditInline && (
                <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              )}
            </button>
          ) : canEditStatus ? (
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

          {/* Star = track-toggle. Always visible; outline when not tracked,
              filled amber when tracked. Per-user setting — works without
              edit permissions. */}
          <button
            type="button"
            onClick={onToggleTracked}
            aria-label={isTracked ? t`Stop tracking` : t`Track`}
            title={isTracked ? t`Stop tracking` : t`Track`}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
              isTracked
                ? 'text-amber-500 hover:text-amber-600'
                : 'text-muted-foreground/60 hover:text-amber-500'
            }`}
          >
            <Star
              className={`h-4 w-4 ${isTracked ? 'fill-amber-500' : ''}`}
              aria-hidden="true"
            />
          </button>

          {/* Kebab carries Edit / Archive / Delete; rendered only when at
              least one action is available. */}
          {canEdit && onOpenSettings && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
                  aria-label={t`Project actions`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={onOpenSettings}>
                  {t`Edit`}
                </DropdownMenuItem>
                {onToggleArchived && (
                  <DropdownMenuItem onSelect={onToggleArchived}>
                    {project.archived ? t`Unarchive` : t`Archive`}
                  </DropdownMenuItem>
                )}
                {onRequestDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={onRequestDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      {t`Delete...`}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {project.code && (
          <span
            className={`${styles.codePill} shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-foreground`}
          >
            [{project.code}]
          </span>
        )}
        {/* break-words, not overflow-wrap:anywhere: a word breaks only when it
            cannot fit a line of its own, so a name wraps between words. */}
        <h1 className="min-w-0 break-words text-ui-2xl font-semibold tracking-tight">
          {project.name}
        </h1>
        {project.archived && (
          <Badge variant="secondary" className="shrink-0">{t`Archived`}</Badge>
        )}
      </div>

      <MobileTextSheet
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        onSave={handleMobileSave}
        title={project.status ? t`Edit project status` : t`Add project status`}
        description={t`Set or clear the custom status label shown on this project.`}
        initialValue={project.status ?? ''}
        placeholder={t`Project status`}
        allowEmpty
      />
    </div>
  );
};
