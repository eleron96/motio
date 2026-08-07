import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Check, Copy, Mail, MoreHorizontal, Phone, User } from 'lucide-react';
import type { Project } from '@/features/planner/types/planner';
import type { ContactEntry } from '@/features/projects/lib/contactList';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Badge } from '@/shared/ui/badge';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib/classNames';

type CopyField = 'name' | 'email' | 'phone';

interface ContactDetailsMobileScreenProps {
  entry: ContactEntry | null;
  onOpenChange: (open: boolean) => void;
  /** Projects this person appears on (external members only). */
  projects: Project[];
  canEdit: boolean;
  onEdit: (entry: ContactEntry) => void;
  onDelete: (entry: ContactEntry) => void;
}

/**
 * One contact, opened from the directory.
 *
 * Tapping the name, the email or the phone copies it — on a phone that is what
 * people are here for, and selecting text inside a scrolling list is a fight.
 * The mail and call buttons stay beside each row rather than inside it: a row
 * is already a button, and nesting one in another sends the tap to the wrong
 * place.
 */
export const ContactDetailsMobileScreen: React.FC<ContactDetailsMobileScreenProps> = ({
  entry,
  onOpenChange,
  projects,
  canEdit,
  onEdit,
  onDelete,
}) => {
  const [copied, setCopied] = useState<CopyField | null>(null);

  const copy = async (value: string, field: CopyField) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      window.setTimeout(() => setCopied((current) => (current === field ? null : current)), 1400);
    } catch {
      // Clipboard access can be denied or missing; the value stays on screen.
    }
  };

  const copyRow = (
    field: CopyField,
    icon: React.ReactNode,
    value: string,
    label: string,
    href?: string,
    hrefLabel?: string,
  ) => (
    <div className="relative">
      <button
        type="button"
        onClick={() => void copy(value, field)}
        aria-label={label}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          href ? 'pr-14' : 'pr-12',
        )}
        style={{ minHeight: 56 }}
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-muted text-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight">{value}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {copied === field ? t`Copied` : t`Tap to copy`}
          </span>
        </span>
        {copied === field ? (
          <Check className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        )}
      </button>

      {href && (
        <a
          href={href}
          aria-label={hrefLabel}
          className="absolute right-1.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted/60"
        >
          {icon}
        </a>
      )}
    </div>
  );

  return (
    <MobileScreenShell
      open={entry !== null}
      onOpenChange={onOpenChange}
      title={entry?.name ?? t`Contact`}
      action={canEdit && entry ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t`Contact actions`}
              data-testid="contact-actions"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/60"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[70]">
            <DropdownMenuItem onSelect={() => onEdit(entry)}>{t`Edit`}</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onDelete(entry)}
              className="text-destructive focus:text-destructive"
            >
              {t`Delete`}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : undefined}
    >
      {!entry ? null : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {copyRow('name', <User className="h-4 w-4" />, entry.name, t`Copy name`)}
            {entry.email && (
              <>
                <div className="ml-4 h-px bg-border" />
                {copyRow(
                  'email',
                  <Mail className="h-4 w-4" />,
                  entry.email,
                  t`Copy email`,
                  `mailto:${entry.email}`,
                  t`Write an email`,
                )}
              </>
            )}
            {entry.phone && (
              <>
                <div className="ml-4 h-px bg-border" />
                {copyRow(
                  'phone',
                  <Phone className="h-4 w-4" />,
                  entry.phone,
                  t`Copy phone`,
                  `tel:${entry.phone}`,
                  t`Call`,
                )}
              </>
            )}
          </div>

          <MobileListGroup title={t`Details`}>
            <MobileListRow title={t`Role`} value={entry.role || '—'} />
            <MobileListRow title={t`Company`} value={entry.company || '—'} />
            <MobileListRow
              title={t`Tag`}
              right={entry.tag
                ? <Badge variant="outline" className="text-[10px]">{entry.tag}</Badge>
                : <span className="text-sm text-muted-foreground">—</span>}
            />
          </MobileListGroup>

          {projects.length > 0 && (
            <MobileListGroup title={t`Projects`}>
              {projects.map((project) => (
                <MobileListRow
                  key={project.id}
                  title={formatProjectLabel(project.name, project.code)}
                />
              ))}
            </MobileListGroup>
          )}
        </div>
      )}
    </MobileScreenShell>
  );
};
