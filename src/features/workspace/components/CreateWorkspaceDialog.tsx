import React, { useEffect, useState } from 'react';
import { Bookmark, Plus } from 'lucide-react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogScrollContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/shared/ui/accordion';
import { Checkbox } from '@/shared/ui/checkbox';
import { ColorPicker } from '@/shared/ui/color-picker';
import { EmojiPicker } from '@/shared/ui/emoji-picker';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { buildWorkspaceTemplateFromCatalog, type WorkspaceTemplate } from '@/shared/domain/workspaceTemplate';
import { DEFAULT_COLOR_PICKER_VALUE, DEFAULT_STATUS_COLOR } from '@/shared/lib/colors';
import type { WorkspaceStart } from '@/shared/domain/starterTemplate';
import { STARTER_TEMPLATES } from '@/features/workspace/lib/starterTemplates';
import { STARTER_TEMPLATE_ICONS } from '@/features/workspace/components/starterTemplateIcons';
import { StarterTemplateOption } from '@/features/workspace/components/StarterTemplateOption';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Create workspace" — the name and what the workspace starts from: one of the
 * starter templates (statuses, types, tags and a few examples, laid in right
 * after creating) or the person's own saved set, which is edited further down.
 * Lives on its own so both the desktop workspace switcher and the mobile
 * workspaces screen open the same dialog.
 */
export const CreateWorkspaceDialog: React.FC<CreateWorkspaceDialogProps> = ({ open, onOpenChange }) => {
  const { workspaces, createWorkspace } = useAuthStore(useShallow((state) => ({
    workspaces: state.workspaces,
    createWorkspace: state.createWorkspace,
  })));
  const {
    statuses,
    taskTypes,
    tags,
    loadWorkspaceTemplate,
    saveWorkspaceTemplate,
  } = usePlannerStore(useShallow((state) => ({
    statuses: state.statuses,
    taskTypes: state.taskTypes,
    tags: state.tags,
    loadWorkspaceTemplate: state.loadWorkspaceTemplate,
    saveWorkspaceTemplate: state.saveWorkspaceTemplate,
  })));

  const [workspaceName, setWorkspaceName] = useState('');
  const [start, setStart] = useState<WorkspaceStart | null>(null);
  const [ownSetSaved, setOwnSetSaved] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [templateStatuses, setTemplateStatuses] = useState<WorkspaceTemplate['statuses']>([]);
  const [templateTypes, setTemplateTypes] = useState<WorkspaceTemplate['taskTypes']>([]);
  const [templateTags, setTemplateTags] = useState<WorkspaceTemplate['tags']>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [templateSaved, setTemplateSaved] = useState(false);
  const [newTemplateStatusName, setNewTemplateStatusName] = useState('');
  const [newTemplateStatusEmoji, setNewTemplateStatusEmoji] = useState('');
  const [newTemplateTypeName, setNewTemplateTypeName] = useState('');
  const [newTemplateTagName, setNewTemplateTagName] = useState('');
  const [newTemplateTagColor, setNewTemplateTagColor] = useState(DEFAULT_COLOR_PICKER_VALUE);

  const canCreateWorkspace = workspaces.length < 5;

  useEffect(() => {
    if (!open) return;
    let active = true;

    const loadTemplate = async () => {
      setStart(null);
      setTemplateLoading(true);
      setTemplateError('');
      setTemplateSaved(false);
      const result = await loadWorkspaceTemplate();

      if (!active) return;
      if (result.error) {
        setTemplateError(result.error);
        setTemplateStatuses([]);
        setTemplateTypes([]);
        setTemplateTags([]);
        setOwnSetSaved(false);
        setTemplateLoading(false);
        return;
      }

      const saved = result.template;
      const hasSaved = Boolean(saved && (saved.statuses.length + saved.taskTypes.length + saved.tags.length > 0));
      setTemplateStatuses(saved?.statuses ?? []);
      setTemplateTypes(saved?.taskTypes ?? []);
      setTemplateTags(saved?.tags ?? []);
      setOwnSetSaved(hasSaved);
      // Someone who saved their own set most likely wants it again.
      setStart(hasSaved ? 'own' : null);
      setTemplateLoading(false);
    };

    loadTemplate();
    return () => {
      active = false;
    };
  }, [open, loadWorkspaceTemplate]);

  const handleSaveTemplate = async () => {
    setTemplateError('');
    setTemplateSaved(false);
    const result = await saveWorkspaceTemplate({
      statuses: templateStatuses,
      taskTypes: templateTypes,
      tags: templateTags,
    });

    if (result.error) {
      setTemplateError(result.error);
      return;
    }
    setTemplateSaved(true);
    if (templateStatuses.length + templateTypes.length + templateTags.length > 0) {
      setOwnSetSaved(true);
      setStart('own');
    }
  };

  const handleCopyWorkspaceToTemplate = () => {
    const template = buildWorkspaceTemplateFromCatalog({ statuses, taskTypes, tags });
    setTemplateStatuses(template.statuses);
    setTemplateTypes(template.taskTypes);
    setTemplateTags(template.tags);
    setTemplateSaved(false);
  };

  const updateTemplateStatus = (index: number, updates: Partial<WorkspaceTemplate['statuses'][number]>) => {
    setTemplateStatuses((current) => current.map((item, i) => (i === index ? { ...item, ...updates } : item)));
    setTemplateSaved(false);
  };

  const updateTemplateType = (index: number, updates: Partial<WorkspaceTemplate['taskTypes'][number]>) => {
    setTemplateTypes((current) => current.map((item, i) => (i === index ? { ...item, ...updates } : item)));
    setTemplateSaved(false);
  };

  const updateTemplateTag = (index: number, updates: Partial<WorkspaceTemplate['tags'][number]>) => {
    setTemplateTags((current) => current.map((item, i) => (i === index ? { ...item, ...updates } : item)));
    setTemplateSaved(false);
  };

  const handleAddTemplateStatus = () => {
    if (!newTemplateStatusName.trim()) return;
    setTemplateStatuses((current) => [
      ...current,
      {
        name: newTemplateStatusName.trim(),
        emoji: newTemplateStatusEmoji.trim() || null,
        color: DEFAULT_STATUS_COLOR,
        is_final: false,
        is_cancelled: false,
      },
    ]);
    setNewTemplateStatusName('');
    setNewTemplateStatusEmoji('');
    setTemplateSaved(false);
  };

  const handleCreateWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError('');
    if (!canCreateWorkspace) {
      setCreateError(t`Workspace limit reached (5).`);
      return;
    }
    if (!workspaceName.trim() || !start) return;

    setCreating(true);
    const result = await createWorkspace(workspaceName.trim(), start);
    if (result.error) {
      setCreateError(result.error);
    } else {
      setWorkspaceName('');
      onOpenChange(false);
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogScrollContent className="max-w-2xl p-5 sm:p-6">
        <DialogHeader className="mb-4">
          <DialogTitle>{t`Create workspace`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Enter workspace name and optionally configure a template.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">{t`Workspace name`}</Label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder={t`My team workspace`}
              disabled={!canCreateWorkspace}
            />
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label id="workspace-start-label">{t`What does your team do?`}</Label>
            <div role="radiogroup" aria-labelledby="workspace-start-label" className="grid gap-2 sm:grid-cols-2">
              {ownSetSaved && (
                <StarterTemplateOption
                  icon={Bookmark}
                  title={t`My own set`}
                  summary={t`The statuses, types and tags you saved, without examples.`}
                  selected={start === 'own'}
                  onSelect={() => setStart('own')}
                />
              )}
              {STARTER_TEMPLATES.map((template) => (
                <StarterTemplateOption
                  key={template.id}
                  icon={STARTER_TEMPLATE_ICONS[template.id]}
                  title={template.title()}
                  summary={template.summary()}
                  selected={start === template.id}
                  onSelect={() => setStart(template.id)}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t`Industry templates come with a few examples that go away with one button.`}
            </p>
          </div>

          <Accordion type="single" collapsible className="rounded-md border px-3">
            <AccordionItem value="template" className="border-none">
              <AccordionTrigger type="button" className="py-2 text-sm">{t`Your own set of statuses, types and tags`}</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopyWorkspaceToTemplate}
                      disabled={templateLoading}
                    >
                      {t`Use current workspace`}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveTemplate}
                      disabled={templateLoading}
                    >
                      {t`Save template`}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t`Template is used for all new workspaces.`}
                  </p>
                  {templateError && (
                    <div className="text-sm text-destructive">{templateError}</div>
                  )}
                  {templateSaved && (
                    <div className="text-sm text-emerald-600">{t`Template saved.`}</div>
                  )}
                  {templateLoading && (
                    <div className="text-sm text-muted-foreground">{t`Loading template...`}</div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">{t`Statuses`}</h4>
                    <div className="flex gap-2">
                      <EmojiPicker
                        value={newTemplateStatusEmoji}
                        onChange={setNewTemplateStatusEmoji}
                        className="w-16 text-center"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTemplateStatus()}
                      />
                      <Input
                        placeholder={t`New status name...`}
                        value={newTemplateStatusName}
                        onChange={(e) => setNewTemplateStatusName(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="icon"
                        onClick={handleAddTemplateStatus}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {templateStatuses.map((status, index) => (
                        <div key={`${status.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                          <EmojiPicker
                            value={status.emoji ?? ''}
                            onChange={(emoji) => updateTemplateStatus(index, { emoji })}
                            className="w-16 h-8 text-center"
                          />
                          <Input
                            value={status.name}
                            onChange={(e) => updateTemplateStatus(index, { name: e.target.value })}
                            className="flex-1 h-8"
                          />
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Checkbox
                                checked={status.is_final}
                                onCheckedChange={(checked) => {
                                  const nextFinal = checked === true;
                                  updateTemplateStatus(
                                    index,
                                    nextFinal
                                      ? { is_final: true, is_cancelled: false }
                                      : { is_final: false },
                                  );
                                }}
                              />
                              {t`Final`}
                            </label>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Checkbox
                                checked={status.is_cancelled}
                                onCheckedChange={(checked) => {
                                  const nextCancelled = checked === true;
                                  updateTemplateStatus(
                                    index,
                                    nextCancelled
                                      ? { is_cancelled: true, is_final: false }
                                      : { is_cancelled: false },
                                  );
                                }}
                              />
                              {t`Cancelled`}
                            </label>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setTemplateStatuses((current) => current.filter((_, i) => i !== index));
                              setTemplateSaved(false);
                            }}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Plus className="w-4 h-4 rotate-45" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">{t`Types`}</h4>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t`New type name...`}
                        value={newTemplateTypeName}
                        onChange={(e) => setNewTemplateTypeName(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="icon"
                        onClick={() => {
                          if (!newTemplateTypeName.trim()) return;
                          setTemplateTypes((current) => [
                            ...current,
                            { name: newTemplateTypeName.trim(), icon: null },
                          ]);
                          setNewTemplateTypeName('');
                          setTemplateSaved(false);
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {templateTypes.map((type, index) => (
                        <div key={`${type.name}-${index}`} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                          <Input
                            value={type.name}
                            onChange={(e) => updateTemplateType(index, { name: e.target.value })}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setTemplateTypes((current) => current.filter((_, i) => i !== index));
                              setTemplateSaved(false);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Plus className="w-4 h-4 rotate-45" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">{t`Tags`}</h4>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t`New tag name...`}
                        value={newTemplateTagName}
                        onChange={(e) => setNewTemplateTagName(e.target.value)}
                      />
                      <ColorPicker value={newTemplateTagColor} onChange={setNewTemplateTagColor} />
                      <Button
                        type="button"
                        size="icon"
                        onClick={() => {
                          if (!newTemplateTagName.trim()) return;
                          setTemplateTags((current) => [
                            ...current,
                            { name: newTemplateTagName.trim(), color: newTemplateTagColor },
                          ]);
                          setNewTemplateTagName('');
                          setTemplateSaved(false);
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {templateTags.map((tag, index) => (
                        <div key={`${tag.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                          <ColorPicker
                            value={tag.color}
                            onChange={(color) => updateTemplateTag(index, { color })}
                          />
                          <Input
                            value={tag.name}
                            onChange={(e) => updateTemplateTag(index, { name: e.target.value })}
                            className="flex-1 h-8"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setTemplateTags((current) => current.filter((_, i) => i !== index));
                              setTemplateSaved(false);
                            }}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Plus className="w-4 h-4 rotate-45" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t`Cancel`}
            </Button>
            <Button type="submit" disabled={creating || !workspaceName.trim() || !start}>
              {t`Create`}
            </Button>
          </DialogFooter>
        </form>
      </DialogScrollContent>
    </Dialog>
  );
};
