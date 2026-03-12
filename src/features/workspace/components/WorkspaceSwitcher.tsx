import React, { useEffect, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { ColorPicker } from '@/shared/ui/color-picker';
import { EmojiPicker } from '@/shared/ui/emoji-picker';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/shared/ui/accordion';
import { Checkbox } from '@/shared/ui/checkbox';
import { buildWorkspaceTemplateFromCatalog, type WorkspaceTemplate } from '@/shared/domain/workspaceTemplate';
import { splitStatusLabel } from '@/shared/lib/statusLabels';
import { t } from '@lingui/macro';
import { DEFAULT_COLOR_PICKER_VALUE, DEFAULT_STATUS_COLOR } from '@/shared/lib/colors';

export const WorkspaceSwitcher: React.FC = () => {
  const {
    workspaces,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    createWorkspace,
  } = useAuthStore();
  const {
    statuses,
    taskTypes,
    tags,
    loadWorkspaceTemplate,
    saveWorkspaceTemplate,
  } = usePlannerStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
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

  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  const canCreateWorkspace = workspaces.length < 5;

  useEffect(() => {
    if (!createOpen) return;
    let active = true;

    const loadTemplate = async () => {
      setTemplateLoading(true);
      setTemplateError('');
      setTemplateSaved(false);
      const result = await loadWorkspaceTemplate();

      if (!active) return;
      if (result.error) {
        if (result.error !== t`No template saved yet.`) {
          setTemplateError(result.error);
        }
        setTemplateStatuses([]);
        setTemplateTypes([]);
        setTemplateTags([]);
        setTemplateLoading(false);
        return;
      }

      setTemplateStatuses(result.template?.statuses ?? []);
      setTemplateTypes(result.template?.taskTypes ?? []);
      setTemplateTags(result.template?.tags ?? []);
      setTemplateLoading(false);
    };

    loadTemplate();
    return () => {
      active = false;
    };
  }, [createOpen, loadWorkspaceTemplate]);

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
    if (!workspaceName.trim()) return;

    setCreating(true);
    const result = await createWorkspace(workspaceName.trim());
    if (result.error) {
      setCreateError(result.error);
    } else {
      setWorkspaceName('');
      setCreateOpen(false);
    }
    setCreating(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <span className="max-w-[180px] truncate">{currentWorkspace?.name ?? t`Select workspace`}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t`Workspaces`}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={currentWorkspaceId ?? ''}
            onValueChange={(value) => setCurrentWorkspaceId(value)}
          >
            {workspaces.map((workspace) => (
              <DropdownMenuRadioItem
                key={workspace.id}
                value={workspace.id}
                className="data-[state=checked]:bg-zinc-800 data-[state=checked]:text-white"
              >
                <span className="truncate">{workspace.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => { event.preventDefault(); setCreateOpen(true); }}
            disabled={!canCreateWorkspace}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t`Create workspace`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
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
                autoFocus
                disabled={!canCreateWorkspace}
              />
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
            </div>

            <Accordion type="single" collapsible className="rounded-md border px-3">
              <AccordionItem value="template" className="border-none">
                <AccordionTrigger type="button" className="py-2 text-sm">{t`Workspace template`}</AccordionTrigger>
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
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                {t`Cancel`}
              </Button>
              <Button type="submit" disabled={creating || !workspaceName.trim()}>
                {t`Create`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
