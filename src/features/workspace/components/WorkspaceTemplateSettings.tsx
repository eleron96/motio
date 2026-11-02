import React, { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { Bookmark } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/shared/ui/button';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { STARTER_TEMPLATES } from '@/features/workspace/lib/starterTemplates';
import { STARTER_TEMPLATE_ICONS } from '@/features/workspace/components/starterTemplateIcons';
import { StarterTemplateOption } from '@/features/workspace/components/StarterTemplateOption';
import { Block } from '@/features/workspace/components/settingsBlocks';
import { buildWorkspaceTemplateFromCatalog } from '@/shared/domain/workspaceTemplate';
import type { WorkspaceStart } from '@/shared/domain/starterTemplate';

type AddOutcome =
  | { kind: 'added'; statuses: number; taskTypes: number; tags: number }
  | { kind: 'nothing' }
  | { kind: 'error'; message: string };

const describeAdded = ({ statuses, taskTypes, tags }: { statuses: number; taskTypes: number; tags: number }) => (
  t`Added — statuses: ${statuses}, task types: ${taskTypes}, tags: ${tags}.`
);

/**
 * The "Template" section of workspace settings, in both directions:
 * - add what this workspace lacks from a template — the own saved set or an
 *   industry template's catalogs; nothing is removed and no examples come in,
 *   tasks and people of a workspace in use stay as they are;
 * - save this workspace's catalogs as the own set, offered when creating the
 *   next workspace.
 *
 * It used to offer only "apply your saved template", which nobody had saved,
 * so the button answered with an untranslated "No template saved yet.", and
 * saving a set from a workspace was tucked away in "Create workspace".
 */
export const WorkspaceTemplateSettings: React.FC = () => {
  const {
    workspaceId,
    statuses,
    taskTypes,
    tags,
    loadWorkspaceTemplate,
    saveWorkspaceTemplate,
    applyWorkspaceTemplate,
  } = usePlannerStore(useShallow((state) => ({
    workspaceId: state.workspaceId,
    statuses: state.statuses,
    taskTypes: state.taskTypes,
    tags: state.tags,
    loadWorkspaceTemplate: state.loadWorkspaceTemplate,
    saveWorkspaceTemplate: state.saveWorkspaceTemplate,
    applyWorkspaceTemplate: state.applyWorkspaceTemplate,
  })));

  const [ownSetSaved, setOwnSetSaved] = useState(false);
  const [source, setSource] = useState<WorkspaceStart | null>(null);
  const [adding, setAdding] = useState(false);
  const [addOutcome, setAddOutcome] = useState<AddOutcome | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveOutcome, setSaveOutcome] = useState<{ kind: 'saved' } | { kind: 'error'; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    void loadWorkspaceTemplate().then((result) => {
      if (!active) return;
      const saved = result.template;
      setOwnSetSaved(Boolean(saved && saved.statuses.length + saved.taskTypes.length + saved.tags.length > 0));
    });
    return () => {
      active = false;
    };
  }, [loadWorkspaceTemplate]);

  const handleAdd = async () => {
    if (!source || adding) return;
    setAdding(true);
    setAddOutcome(null);
    const result = await applyWorkspaceTemplate(source);
    setAdding(false);
    if (result.error) {
      setAddOutcome({ kind: 'error', message: result.error });
      return;
    }
    const added = result.added ?? { statuses: 0, taskTypes: 0, tags: 0 };
    setAddOutcome(added.statuses + added.taskTypes + added.tags === 0 ? { kind: 'nothing' } : { kind: 'added', ...added });
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveOutcome(null);
    const result = await saveWorkspaceTemplate(buildWorkspaceTemplateFromCatalog({ statuses, taskTypes, tags }));
    setSaving(false);
    if (result.error) {
      setSaveOutcome({ kind: 'error', message: result.error });
      return;
    }
    setOwnSetSaved(true);
    setSaveOutcome({ kind: 'saved' });
  };

  const industryTemplates = STARTER_TEMPLATES.filter((template) => template.id !== 'empty');

  return (
    <div className="space-y-5">
      <Block
        title={t`Add from a template`}
        description={t`Adds the statuses, task types and tags this workspace lacks. Nothing is removed and no examples are added.`}
      >
        <div className="space-y-3">
          <div role="radiogroup" aria-label={t`Add from a template`} className="grid gap-2 sm:grid-cols-2">
            {ownSetSaved && (
              <StarterTemplateOption
                icon={Bookmark}
                title={t`My own set`}
                summary={t`The statuses, types and tags you saved, without examples.`}
                selected={source === 'own'}
                onSelect={() => setSource('own')}
              />
            )}
            {industryTemplates.map((template) => (
              <StarterTemplateOption
                key={template.id}
                icon={STARTER_TEMPLATE_ICONS[template.id]}
                title={template.title()}
                summary={template.summary()}
                selected={source === template.id}
                onSelect={() => setSource(template.id)}
              />
            ))}
          </div>
          {addOutcome?.kind === 'added' && (
            <p role="status" className="text-sm text-emerald-600">
              {describeAdded(addOutcome)}
            </p>
          )}
          {addOutcome?.kind === 'nothing' && (
            <p role="status" className="text-sm text-muted-foreground">
              {t`This workspace already has all of them.`}
            </p>
          )}
          {addOutcome?.kind === 'error' && (
            <p role="alert" className="text-sm text-destructive">{addOutcome.message}</p>
          )}
          <Button variant="secondary" onClick={() => void handleAdd()} disabled={!workspaceId || !source || adding}>
            {t`Add`}
          </Button>
        </div>
      </Block>

      <Block
        title={t`My own set`}
        description={t`Save this workspace's statuses, task types and tags as your own set. It is offered when you create a new workspace.`}
      >
        <div className="space-y-2">
          {ownSetSaved && saveOutcome === null && (
            <p className="text-xs text-muted-foreground">{t`This replaces the set you saved before.`}</p>
          )}
          {saveOutcome?.kind === 'saved' && (
            <p role="status" className="text-sm text-emerald-600">{t`Saved as your own set.`}</p>
          )}
          {saveOutcome?.kind === 'error' && (
            <p role="alert" className="text-sm text-destructive">{saveOutcome.message}</p>
          )}
          <Button variant="secondary" onClick={() => void handleSave()} disabled={!workspaceId || saving}>
            {t`Save as my own set`}
          </Button>
        </div>
      </Block>
    </div>
  );
};
