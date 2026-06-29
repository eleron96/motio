import React, { useEffect, useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Checkbox } from '@/shared/ui/checkbox';
import { Switch } from '@/shared/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
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
import {
  Plus,
  Trash2,
  Settings2,
  CheckCircle2,
  Ban,
  Check,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  Eye,
  Workflow,
  LayoutTemplate,
  AlertTriangle,
} from 'lucide-react';
import { ColorPicker } from '@/shared/ui/color-picker';
import { EmojiPicker } from '@/shared/ui/emoji-picker';
import { Textarea } from '@/shared/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/shared/ui/command';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { isAbortError } from '@/shared/lib/latestAsyncRequest';
import { DEFAULT_COLOR_PICKER_VALUE, DEFAULT_STATUS_COLOR } from '@/shared/lib/colors';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

import { fetchHolidayCountries, type HolidayCountryOption } from '@/infrastructure/holidays/holidayApi';

type SectionId = 'general' | 'display' | 'workflow' | 'template' | 'danger';

// A settings sub-block: a heading (and optional description) above its controls.
const Block: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    {children}
  </section>
);

// Reference-style row: label + description on the left, control on the right.
const SettingRow: React.FC<{ title: string; description?: string; htmlFor?: string; children: React.ReactNode }> = ({
  title,
  description,
  htmlFor,
  children,
}) => (
  <div className="flex items-center justify-between gap-4">
    <div className="min-w-0 space-y-0.5">
      <Label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {title}
      </Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const autoResize = (element: HTMLTextAreaElement | null) => {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

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
    filters,
    setFilters,
  } = usePlannerStore();

  const {
    user,
    workspaces,
    members,
    fetchMembers,
    currentWorkspaceId,
    currentWorkspaceRole,
    updateWorkspaceName,
    updateWorkspaceHolidayCountry,
    deleteWorkspace,
    transferWorkspaceOwnership,
  } = useAuthStore();

  const isMobile = useIsMobile();

  const [newStatusEmoji, setNewStatusEmoji] = useState('');
  const [newStatusName, setNewStatusName] = useState('');

  const [newTypeName, setNewTypeName] = useState('');

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLOR_PICKER_VALUE);

  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  const isAdmin = currentWorkspaceRole === 'admin';
  const isWorkspaceOwner = Boolean(user?.id && currentWorkspace?.ownerId === user.id);
  const transferCandidates = (members ?? []).filter(
    (member) => member.userId !== user?.id && member.status === 'ACTIVE',
  );

  const [activeSection, setActiveSection] = useState<SectionId>('general');
  // Mobile drill-in: the section list and the section content are separate
  // screens (like the reference). On desktop both columns are always visible.
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceHolidayCountry, setWorkspaceHolidayCountry] = useState('RU');
  const [holidayCountryOptions, setHolidayCountryOptions] = useState<HolidayCountryOption[]>([]);
  const [holidayCountryLoading, setHolidayCountryLoading] = useState(false);
  const [holidayCountryOpen, setHolidayCountryOpen] = useState(false);
  const [holidayCountryQuery, setHolidayCountryQuery] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [templateApplyError, setTemplateApplyError] = useState('');
  const [templateApplying, setTemplateApplying] = useState(false);
  const [templateApplied, setTemplateApplied] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState('');


  useEffect(() => {
    if (!open) return;
    setActiveSection('general');
    setMobileSectionOpen(false);
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
        const data = await fetchHolidayCountries(controller.signal);
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

  const showUnassigned = !filters.hideUnassigned;

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

  // "Show unassigned" stays a personal timeline filter — it just lives here now
  // instead of on the timeline toolbar. Persist immediately so the change sticks
  // even when settings are opened off the timeline page (where PlannerPage's
  // own filter-persist effect doesn't run).
  const handleToggleShowUnassigned = (checked: boolean) => {
    const hideUnassigned = !checked;
    setFilters({ hideUnassigned });
    if (user?.id && typeof window !== 'undefined') {
      const next = { ...usePlannerStore.getState().filters, hideUnassigned };
      window.localStorage.setItem(`planner-filters-${user.id}`, JSON.stringify(next));
    }
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

  const sections: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'general', label: t`General`, icon: Building2 },
    { id: 'display', label: t`Display`, icon: Eye },
    { id: 'workflow', label: t`Workflow`, icon: Workflow },
    { id: 'template', label: t`Template`, icon: LayoutTemplate },
    { id: 'danger', label: t`Danger zone`, icon: AlertTriangle },
  ];

  const generalContent = (
    <div className="space-y-5">
      {!isAdmin && (
        <Block title={t`Access`}>
          <p className="text-sm text-muted-foreground">
            {t`You have view access and cannot edit this workspace.`}
          </p>
        </Block>
      )}

      <Block title={t`Workspace name`}>
        <div className="space-y-2">
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
      </Block>

      <Block title={t`Holiday calendar`}>
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
      </Block>
    </div>
  );

  const displayContent = (
    <div className="space-y-5">
      <Block title={t`Tasks`}>
        <SettingRow
          title={t`Unassigned`}
          description={t`Show tasks without an assignee`}
          htmlFor="settings-show-unassigned"
        >
          <Switch
            id="settings-show-unassigned"
            checked={showUnassigned}
            onCheckedChange={handleToggleShowUnassigned}
            aria-label={t`Show unassigned`}
          />
        </SettingRow>
      </Block>
    </div>
  );

  const workflowContent = (
    <div className="space-y-5">
      <Block title={t`Statuses`}>
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
      </Block>

      <Block title={t`Task types`}>
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
      </Block>

      <Block title={t`Tags`}>
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
      </Block>
    </div>
  );

  const templateContent = (
    <div className="space-y-5">
      <Block
        title={t`Template`}
        description={t`Apply your saved template to this workspace (adds missing items by name).`}
      >
        <div className="space-y-2">
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
      </Block>
    </div>
  );

  const openTransferDialog = () => {
    setTransferError('');
    setTransferTargetId('');
    if (currentWorkspaceId) void fetchMembers(currentWorkspaceId);
    setTransferOpen(true);
  };

  const handleTransferOwnership = async () => {
    if (!currentWorkspaceId || !transferTargetId) return;
    setTransferring(true);
    setTransferError('');
    const result = await transferWorkspaceOwnership(currentWorkspaceId, transferTargetId);
    setTransferring(false);
    if (result.error) {
      setTransferError(result.error);
      return;
    }
    setTransferOpen(false);
  };

  const dangerContent = (
    <div className="space-y-5">
      {isWorkspaceOwner && (
        <Block
          title={t`Ownership`}
          description={t`Transfer ownership of this workspace to another member. You keep your access but stop being the owner.`}
        >
          <Button variant="outline" onClick={openTransferDialog} disabled={!currentWorkspaceId}>
            {t`Transfer ownership`}
          </Button>
        </Block>
      )}
      <Block
        title={t`Danger zone`}
        description={t`Deleting a workspace is permanent. Type the workspace name to enable deletion.`}
      >
        <div className="space-y-3">
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
      </Block>
    </div>
  );

  const sectionContent: Record<SectionId, React.ReactNode> = {
    general: generalContent,
    display: displayContent,
    workflow: workflowContent,
    template: templateContent,
    danger: dangerContent,
  };

  const activeLabel = sections.find((section) => section.id === activeSection)?.label ?? '';

  const renderNav = (onPick?: () => void) => (
    <nav className="flex flex-col gap-1">
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeSection;
        const danger = section.id === 'danger';
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => {
              setActiveSection(section.id);
              onPick?.();
            }}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
              active
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              danger && (active ? 'text-destructive' : 'hover:text-destructive'),
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{section.label}</span>
            {isMobile && <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[980px] w-[90vw] sm:w-[840px] md:w-[980px] h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              {t`Workspace settings`}
            </DialogTitle>
            <DialogDescription>
              {t`Choose how your workspace looks and behaves`}
            </DialogDescription>
          </DialogHeader>

          {isMobile ? (
            <div className="mt-2 flex-1 min-h-0 overflow-y-auto">
              {mobileSectionOpen ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setMobileSectionOpen(false)}
                    className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t`All settings`}
                  </button>
                  <h2 className={cn('text-base font-semibold', activeSection === 'danger' && 'text-destructive')}>
                    {activeLabel}
                  </h2>
                  {sectionContent[activeSection]}
                </div>
              ) : (
                renderNav(() => setMobileSectionOpen(true))
              )}
            </div>
          ) : (
            <div className="mt-2 grid flex-1 min-h-0 grid-cols-[200px_1fr] gap-6">
              <div className="border-r border-border pr-3">
                {renderNav()}
              </div>
              <div className="min-w-0 overflow-y-auto pr-1">
                <h2 className={cn('mb-4 text-base font-semibold', activeSection === 'danger' && 'text-destructive')}>
                  {activeLabel}
                </h2>
                {sectionContent[activeSection]}
              </div>
            </div>
          )}
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

      <Dialog
        open={transferOpen}
        onOpenChange={(next) => {
          if (transferring) return;
          setTransferOpen(next);
          if (!next) setTransferError('');
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t`Transfer ownership`}</DialogTitle>
            <DialogDescription>
              {t`The selected member becomes the workspace owner. You will no longer be the owner, but you stay as an admin.`}
            </DialogDescription>
          </DialogHeader>
          {transferCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t`There are no other active members to transfer ownership to.`}
            </p>
          ) : (
            <div className="space-y-2">
              <Label>{t`New owner`}</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder={t`Select a member`} />
                </SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((candidate) => (
                    <SelectItem key={candidate.userId} value={candidate.userId}>
                      {candidate.displayName || candidate.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {transferError && <p className="text-sm text-destructive">{transferError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferring}>
              {t`Cancel`}
            </Button>
            <Button
              onClick={() => void handleTransferOwnership()}
              disabled={transferring || !transferTargetId || transferCandidates.length === 0}
            >
              {t`Transfer ownership`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
