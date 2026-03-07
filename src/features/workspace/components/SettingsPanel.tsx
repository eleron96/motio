import React, { useEffect, useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/shared/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Plus, Trash2, Settings2, CheckCircle2, Ban, Check, ChevronsUpDown } from 'lucide-react';
import { ColorPicker } from '@/shared/ui/color-picker';
import { EmojiPicker } from '@/shared/ui/emoji-picker';
import { Textarea } from '@/shared/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/shared/ui/command';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { isAbortError } from '@/shared/lib/latestAsyncRequest';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface HolidayCountryOption {
  countryCode: string;
  name: string;
}

const SectionCard: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
    {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
    {children}
  </div>
);

const autoResize = (element: HTMLTextAreaElement | null) => {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

const DEFAULT_STATUS_COLOR = '#94a3b8';

const StatusNameInput: React.FC<{
  value: string;
  onChange: (next: string) => void;
}> = ({ value, onChange }) => {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    autoResize(ref.current);
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onInput={(e) => autoResize(e.currentTarget)}
      className="flex-1 min-w-0 min-h-8 h-8 resize-none leading-tight py-1 overflow-hidden"
    />
  );
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onOpenChange }) => {
  const {
    statuses, addStatus, updateStatus, deleteStatus,
    taskTypes, addTaskType, updateTaskType, deleteTaskType,
    tags, addTag, updateTag, deleteTag,
    workspaceId,
    applyWorkspaceTemplate,
  } = usePlannerStore();

  const {
    workspaces,
    currentWorkspaceId,
    currentWorkspaceRole,
    updateWorkspaceName,
    updateWorkspaceHolidayCountry,
    deleteWorkspace,
  } = useAuthStore();

  const [newStatusEmoji, setNewStatusEmoji] = useState('');
  const [newStatusName, setNewStatusName] = useState('');

  const [newTypeName, setNewTypeName] = useState('');

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  const isAdmin = currentWorkspaceRole === 'admin';

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceHolidayCountry, setWorkspaceHolidayCountry] = useState('RU');
  const [holidayCountryOptions, setHolidayCountryOptions] = useState<HolidayCountryOption[]>([]);
  const [holidayCountryLoading, setHolidayCountryLoading] = useState(false);
  const [holidayCountryOpen, setHolidayCountryOpen] = useState(false);
  const [holidayCountryQuery, setHolidayCountryQuery] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateApplyError, setTemplateApplyError] = useState('');
  const [templateApplying, setTemplateApplying] = useState(false);
  const [templateApplied, setTemplateApplied] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState('');


  useEffect(() => {
    if (!open) return;
    setWorkspaceName(currentWorkspace?.name ?? '');
    setWorkspaceHolidayCountry((currentWorkspace?.holidayCountry ?? 'RU').toUpperCase());
    setHolidayCountryOpen(false);
    setHolidayCountryQuery('');
    setWorkspaceError('');
    setTemplateApplyError('');
    setTemplateApplied(false);
    setDeleteConfirmValue('');
  }, [open, currentWorkspace?.name, currentWorkspace?.holidayCountry]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();

    const loadHolidayCountries = async () => {
      setHolidayCountryLoading(true);
      try {
        const response = await fetch('https://date.nager.at/api/v3/AvailableCountries', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load countries: ${response.status}`);
        }
        const data = await response.json() as Array<{ countryCode?: string; name?: string }>;
        if (!active) return;
        const normalized = data
          .map((item) => ({
            countryCode: (item.countryCode ?? '').toUpperCase(),
            name: item.name ?? '',
          }))
          .filter((item) => /^[A-Z]{2}$/.test(item.countryCode))
          .sort((left, right) => left.name.localeCompare(right.name));
        setHolidayCountryOptions(normalized);
      } catch (error) {
        if (!isAbortError(error)) {
          console.error(error);
        }
      } finally {
        if (active) {
          setHolidayCountryLoading(false);
        }
      }
    };

    void loadHolidayCountries();

    return () => {
      active = false;
      controller.abort();
    };
  }, [open]);

  const deleteConfirmName = currentWorkspace?.name ?? '';
  const canDeleteWorkspace = Boolean(
    isAdmin
      && currentWorkspaceId
      && deleteConfirmName
      && deleteConfirmValue.trim() === deleteConfirmName,
  );
  const generalDefaultSections = isAdmin ? ['name'] : ['access', 'name'];

  const holidayCountryLabel = useMemo(() => {
    const code = workspaceHolidayCountry.trim().toUpperCase();
    if (!code) return t`Select country`;
    const option = holidayCountryOptions.find((item) => item.countryCode === code);
    return option ? `${code} - ${option.name}` : code;
  }, [workspaceHolidayCountry, holidayCountryOptions]);

  const filteredHolidayCountryOptions = useMemo(() => {
    const query = holidayCountryQuery.trim().toLowerCase();
    if (!query) return holidayCountryOptions.slice(0, 60);

    const scored = holidayCountryOptions
      .map((option) => {
        const nameLower = option.name.toLowerCase();
        const codeLower = option.countryCode.toLowerCase();
        let score = 3;
        if (codeLower === query || nameLower === query) {
          score = 0;
        } else if (codeLower.startsWith(query) || nameLower.startsWith(query)) {
          score = 1;
        } else if (codeLower.includes(query) || nameLower.includes(query)) {
          score = 2;
        }
        return { option, score };
      })
      .filter((item) => item.score < 3)
      .sort((left, right) => {
        if (left.score !== right.score) return left.score - right.score;
        return left.option.name.localeCompare(right.option.name);
      });

    return scored.map((item) => item.option).slice(0, 60);
  }, [holidayCountryOptions, holidayCountryQuery]);

  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;
    addStatus({
      name: newStatusName.trim(),
      emoji: newStatusEmoji.trim() || null,
      color: DEFAULT_STATUS_COLOR,
      isFinal: false,
      isCancelled: false,
    });
    setNewStatusName('');
    setNewStatusEmoji('');
  };

  const handleAddType = () => {
    if (!newTypeName.trim()) return;
    addTaskType({ name: newTypeName.trim(), icon: null });
    setNewTypeName('');
  };

  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    addTag({ name: newTagName.trim(), color: newTagColor });
    setNewTagName('');
  };

  const handleSaveWorkspaceName = async () => {
    if (!currentWorkspaceId) {
      setWorkspaceError(t`Workspace not selected.`);
      return;
    }
    setWorkspaceError('');
    setWorkspaceSaving(true);
    const result = await updateWorkspaceName(currentWorkspaceId, workspaceName);
    if (result.error) {
      setWorkspaceError(result.error);
      setWorkspaceSaving(false);
      return;
    }
    setWorkspaceSaving(false);
  };

  const handleSaveWorkspaceHolidayCountry = async () => {
    if (!currentWorkspaceId) {
      setWorkspaceError(t`Workspace not selected.`);
      return;
    }
    const normalized = workspaceHolidayCountry.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) {
      setWorkspaceError(t`Country code must contain 2 letters.`);
      return;
    }

    setWorkspaceError('');
    setWorkspaceSaving(true);
    const result = await updateWorkspaceHolidayCountry(currentWorkspaceId, normalized);
    if (result.error) {
      setWorkspaceError(result.error);
      setWorkspaceSaving(false);
      return;
    }
    setWorkspaceSaving(false);
  };

  const handleDeleteWorkspace = async () => {
    if (!currentWorkspaceId) {
      setWorkspaceError(t`Workspace not selected.`);
      return;
    }
    setWorkspaceError('');
    const result = await deleteWorkspace(currentWorkspaceId);
    if (result.error) {
      setWorkspaceError(result.error);
      return;
    }
    setDeleteOpen(false);
  };

  const handleApplyTemplate = async () => {
    if (!workspaceId) {
      setTemplateApplyError(t`Workspace not selected.`);
      return;
    }

    setTemplateApplying(true);
    setTemplateApplyError('');
    setTemplateApplied(false);
    const result = await applyWorkspaceTemplate();
    if (result.error) {
      setTemplateApplyError(result.error);
      setTemplateApplying(false);
      return;
    }

    setTemplateApplied(true);
    setTemplateApplying(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[980px] w-[90vw] sm:w-[840px] md:w-[980px] max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              {t`Workspace settings`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t`Manage workspace settings, statuses, task types, and tags.`}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="flex-1 flex flex-col mt-4">
            <TabsList className="flex flex-wrap w-full h-auto items-start justify-start gap-2 mb-4">
              <TabsTrigger value="general" className="whitespace-nowrap">{t`General`}</TabsTrigger>
              <TabsTrigger value="workflow" className="whitespace-nowrap">{t`Workflow`}</TabsTrigger>
            </TabsList>

            <div className="flex-1 space-y-4">
              {/* General */}
              <TabsContent value="general" className="m-0">
                <Accordion type="multiple" defaultValue={generalDefaultSections} className="space-y-3">
                  {!isAdmin && (
                    <AccordionItem value="access" className="border-0">
                      <SectionCard>
                        <AccordionTrigger className="py-0 hover:no-underline">
                          <span className="text-sm font-semibold">{t`Access`}</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-1">
                          <p className="text-sm text-muted-foreground">
                            {t`You have view access and cannot edit this workspace.`}
                          </p>
                        </AccordionContent>
                      </SectionCard>
                    </AccordionItem>
                  )}

                  <AccordionItem value="name" className="border-0">
                    <SectionCard>
                      <AccordionTrigger className="py-0 hover:no-underline">
                        <span className="text-sm font-semibold">{t`Workspace name`}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1">
                        <div className="space-y-2">
                          <Label htmlFor="workspace-name">{t`Workspace name`}</Label>
                          <Input
                            id="workspace-name"
                            value={workspaceName}
                            onChange={(e) => setWorkspaceName(e.target.value)}
                            disabled={!isAdmin || !currentWorkspaceId || workspaceSaving}
                          />
                          {workspaceError && (
                            <div className="text-sm text-destructive">{workspaceError}</div>
                          )}
                          <Button
                            onClick={handleSaveWorkspaceName}
                            disabled={!isAdmin || !currentWorkspaceId || workspaceSaving || !workspaceName.trim()}
                          >
                            {t`Save`}
                          </Button>
                        </div>
                      </AccordionContent>
                    </SectionCard>
                  </AccordionItem>

                  <AccordionItem value="holidays" className="border-0">
                    <SectionCard>
                      <AccordionTrigger className="py-0 hover:no-underline">
                        <span className="text-sm font-semibold">{t`Holiday calendar`}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1">
                        <div className="space-y-2">
                          <Label htmlFor="workspace-holiday-country">{t`Country code`}</Label>
                          <Popover
                            open={holidayCountryOpen}
                            onOpenChange={(nextOpen) => {
                              setHolidayCountryOpen(nextOpen);
                              if (!nextOpen) {
                                setHolidayCountryQuery('');
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                id="workspace-holiday-country"
                                type="button"
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between"
                                disabled={!isAdmin || !currentWorkspaceId || workspaceSaving}
                              >
                                <span className="truncate">{holidayCountryLabel}</span>
                                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" side="bottom">
                              <Command shouldFilter={false}>
                                <CommandInput
                                  placeholder={t`Search countries...`}
                                  value={holidayCountryQuery}
                                  onValueChange={setHolidayCountryQuery}
                                />
                                <CommandList>
                                  <CommandEmpty>
                                    {holidayCountryLoading ? t`Loading available countries...` : t`No countries found.`}
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {filteredHolidayCountryOptions.map((option) => {
                                      const isSelected = option.countryCode === workspaceHolidayCountry;
                                      return (
                                        <CommandItem
                                          key={option.countryCode}
                                          onSelect={() => {
                                            setWorkspaceHolidayCountry(option.countryCode);
                                            setHolidayCountryOpen(false);
                                            setHolidayCountryQuery('');
                                          }}
                                        >
                                          <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                                          <span className="truncate">{option.name}</span>
                                          <span className="ml-auto text-xs text-muted-foreground">{option.countryCode}</span>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <p className="text-xs text-muted-foreground">
                            {holidayCountryLoading
                              ? t`Loading available countries...`
                              : t`Use ISO code (for example RU, US, DE).`}
                          </p>
                          {workspaceError && (
                            <div className="text-sm text-destructive">{workspaceError}</div>
                          )}
                          <Button
                            onClick={handleSaveWorkspaceHolidayCountry}
                            disabled={
                              !isAdmin
                              || !currentWorkspaceId
                              || workspaceSaving
                              || !workspaceHolidayCountry.trim()
                              || (workspaceHolidayCountry.trim().toUpperCase() === (currentWorkspace?.holidayCountry ?? 'RU').toUpperCase())
                            }
                          >
                            {t`Save`}
                          </Button>
                        </div>
                      </AccordionContent>
                    </SectionCard>
                  </AccordionItem>

                  <AccordionItem value="template" className="border-0">
                    <SectionCard>
                      <AccordionTrigger className="py-0 hover:no-underline">
                        <span className="text-sm font-semibold">{t`Template`}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1">
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {t`Apply your saved template to this workspace (adds missing items by name).`}
                          </p>
                          {templateApplyError && (
                            <div className="text-sm text-destructive">{templateApplyError}</div>
                          )}
                          {templateApplied && (
                            <div className="text-sm text-emerald-600">{t`Template applied.`}</div>
                          )}
                          <Button
                            variant="secondary"
                            onClick={handleApplyTemplate}
                            disabled={!currentWorkspaceId || templateApplying}
                          >
                            {t`Apply template`}
                          </Button>
                        </div>
                      </AccordionContent>
                    </SectionCard>
                  </AccordionItem>

                  <AccordionItem value="danger" className="border-0">
                    <SectionCard>
                      <AccordionTrigger className="py-0 text-destructive hover:no-underline">
                        <span className="text-sm font-semibold">{t`Danger zone`}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1">
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            {t`Deleting a workspace is permanent. Type the workspace name to enable deletion.`}
                          </p>
                          <div className="space-y-2">
                            <Label htmlFor="delete-workspace-confirm">{t`Workspace name`}</Label>
                            <Input
                              id="delete-workspace-confirm"
                              placeholder={deleteConfirmName || t`Workspace name`}
                              value={deleteConfirmValue}
                              onChange={(event) => setDeleteConfirmValue(event.target.value)}
                              disabled={!isAdmin || !currentWorkspaceId}
                            />
                          </div>
                          <Button
                            variant="destructive"
                            onClick={() => setDeleteOpen(true)}
                            disabled={!canDeleteWorkspace}
                          >
                            {t`Delete workspace`}
                          </Button>
                        </div>
                      </AccordionContent>
                    </SectionCard>
                  </AccordionItem>
                </Accordion>
              </TabsContent>

              {/* Workflow */}
              <TabsContent value="workflow" className="m-0">
                <Accordion type="multiple" defaultValue={['statuses', 'tags']} className="space-y-3">
                  <AccordionItem value="statuses" className="border-0">
                    <SectionCard>
                      <AccordionTrigger className="py-0 hover:no-underline">
                        <span className="text-sm font-semibold">{t`Statuses`}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <EmojiPicker
                              value={newStatusEmoji}
                              onChange={setNewStatusEmoji}
                              className="w-16 text-center"
                              onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                            />
                            <Input
                              placeholder={t`New status name...`}
                              value={newStatusName}
                              onChange={(e) => setNewStatusName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                            />
                            <Button onClick={handleAddStatus} size="icon">
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                            <span className="w-16">{t`Emoji`}</span>
                            <span className="flex-1">{t`Status`}</span>
                            <div className="flex w-10 justify-end">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
                                    <CheckCircle2 className="h-4 w-4" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t`Final`}</TooltipContent>
                              </Tooltip>
                            </div>
                            <div className="flex w-10 justify-end">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
                                    <Ban className="h-4 w-4" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t`Cancelled`}</TooltipContent>
                              </Tooltip>
                            </div>
                            <span className="w-8" aria-hidden="true" />
                          </div>

                          <div className="space-y-2">
                            {statuses.map((status) => (
                              <div key={status.id} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
                                <EmojiPicker
                                  value={status.emoji ?? ''}
                                  onChange={(emoji) => updateStatus(status.id, { emoji })}
                                  className="w-16 h-8 text-center"
                                />
                                <StatusNameInput
                                  value={status.name}
                                  onChange={(next) => updateStatus(status.id, { name: next })}
                                />
                                <label className="flex w-10 items-center justify-end">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Checkbox
                                        checked={status.isFinal}
                                        onCheckedChange={(checked) => {
                                          const nextFinal = checked === true;
                                          updateStatus(
                                            status.id,
                                            nextFinal
                                              ? { isFinal: true, isCancelled: false }
                                              : { isFinal: false },
                                          );
                                        }}
                                        aria-label={t`Final status`}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>{t`Final`}</TooltipContent>
                                  </Tooltip>
                                </label>
                                <label className="flex w-10 items-center justify-end">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Checkbox
                                        checked={status.isCancelled}
                                        onCheckedChange={(checked) => {
                                          const nextCancelled = checked === true;
                                          updateStatus(
                                            status.id,
                                            nextCancelled
                                              ? { isCancelled: true, isFinal: false }
                                              : { isCancelled: false },
                                          );
                                        }}
                                        aria-label={t`Cancelled status`}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>{t`Cancelled`}</TooltipContent>
                                  </Tooltip>
                                </label>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteStatus(status.id)}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </AccordionContent>
                    </SectionCard>
                  </AccordionItem>

                  <AccordionItem value="types" className="border-0">
                    <SectionCard>
                      <AccordionTrigger className="py-0 hover:no-underline">
                        <span className="text-sm font-semibold">{t`Task types`}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1">
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Input
                              placeholder={t`New type name...`}
                              value={newTypeName}
                              onChange={(e) => setNewTypeName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
                            />
                            <Button onClick={handleAddType} size="icon">
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>

                          <div className="space-y-2">
                            {taskTypes.map((type) => (
                              <div key={type.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                                <Input
                                  value={type.name}
                                  onChange={(e) => updateTaskType(type.id, { name: e.target.value })}
                                  className="flex-1"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteTaskType(type.id)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </AccordionContent>
                    </SectionCard>
                  </AccordionItem>

                  <AccordionItem value="tags" className="border-0">
                    <SectionCard>
                      <AccordionTrigger className="py-0 hover:no-underline">
                        <span className="text-sm font-semibold">{t`Tags`}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1">
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Input
                              placeholder={t`New tag name...`}
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                            />
                            <Button onClick={handleAddTag} size="icon">
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>

                          <div className="space-y-2">
                            {tags.map((tag) => (
                              <div key={tag.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                                <ColorPicker
                                  value={tag.color}
                                  onChange={(color) => updateTag(tag.id, { color })}
                                />
                                <Input
                                  value={tag.name}
                                  onChange={(e) => updateTag(tag.id, { name: e.target.value })}
                                  className="flex-1 h-8"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteTag(tag.id)}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </AccordionContent>
                    </SectionCard>
                  </AccordionItem>
                </Accordion>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete workspace?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This will permanently delete "${currentWorkspace?.name ?? t`this workspace`}" and all its data.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWorkspace}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
