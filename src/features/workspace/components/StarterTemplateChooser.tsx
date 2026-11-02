import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Loader2 } from 'lucide-react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { STARTER_TEMPLATES } from '@/features/workspace/lib/starterTemplates';
import { STARTER_TEMPLATE_ICONS } from '@/features/workspace/components/starterTemplateIcons';
import type { StarterTemplateId } from '@/shared/domain/starterTemplate';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/classNames';

/**
 * The first thing the owner of a new workspace decides: what the team does.
 * The answer picks the statuses, task types, tags and example work the
 * workspace starts with — in the interface language. It used to be the same
 * "website and mobile app" for everyone, with software catalogs that most real
 * teams on production never use.
 *
 * It cannot be dismissed by a stray click or Escape — "Empty workspace" is the
 * way to skip. Who sees it and when is decided by StarterTemplateChooserHost.
 */
type StarterTemplateChooserProps = {
  workspaceId: string;
};

export const StarterTemplateChooser: React.FC<StarterTemplateChooserProps> = ({ workspaceId }) => {
  const applyStarterTemplate = usePlannerStore((state) => state.applyStarterTemplate);
  const [applying, setApplying] = useState<StarterTemplateId | null>(null);
  const [failed, setFailed] = useState(false);

  const choose = async (templateId: StarterTemplateId) => {
    if (applying) return;
    setApplying(templateId);
    setFailed(false);
    const { error } = await applyStarterTemplate(workspaceId, templateId);
    // On success the workspace stops waiting and the dialog goes away by itself.
    if (error) setFailed(true);
    setApplying(null);
  };

  return (
    <Dialog open>
      <DialogScrollContent
        hideCloseButton
        className="max-w-2xl p-5 sm:p-6"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="starter-template-chooser"
      >
        <DialogHeader className="space-y-1.5 pr-0 text-left">
          <DialogTitle className="text-lg">{t`What does your team do?`}</DialogTitle>
          <DialogDescription>
            {t`We'll set up matching statuses, task types and a few examples. The examples go away with one button whenever you're ready.`}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {STARTER_TEMPLATES.map((template) => {
            const Icon = STARTER_TEMPLATE_ICONS[template.id];
            const busy = applying === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => void choose(template.id)}
                disabled={applying !== null}
                aria-busy={busy || undefined}
                className={cn(
                  'press flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors',
                  'hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-default disabled:opacity-60',
                  busy && 'border-primary/60 bg-primary/5 disabled:opacity-100',
                  template.id === 'empty' && 'sm:col-span-2',
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {busy
                    ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    : <Icon className="h-5 w-5" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">{template.title()}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{template.summary()}</span>
                </span>
              </button>
            );
          })}
        </div>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t`Couldn't set up the workspace. Try again.`}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {t`Statuses, task types and tags can be changed later in workspace settings.`}
        </p>
      </DialogScrollContent>
    </Dialog>
  );
};
