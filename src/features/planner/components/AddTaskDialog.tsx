import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { TaskProjectSelect } from '@/features/planner/components/TaskProjectSelect';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { formatStatusLabel, stripStatusEmoji } from '@/shared/lib/statusLabels';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';
import { Switch } from '@/shared/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ChevronDown, Plus, X } from 'lucide-react';
import { format } from '@/features/planner/lib/dateUtils';
import { cn } from '@/shared/lib/classNames';
import { TaskPriority } from '@/features/planner/types/planner';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { orderAssigneesForPopover } from '@/features/planner/lib/assigneePopoverOrder';
import { t } from '@lingui/macro';
import { Status } from '@/features/planner/types/planner';
import { toast } from 'sonner';
import {
  buildCreateRepeatsOptions,
  formatRepeatCountInputValue,
  getAutoRepeatUntilOnEndsChange,
  getAutoRepeatUntilOnFrequencyChange,
  getDefaultRepeatUntil,
  parseRepeatCountInput,
  RepeatEnds,
  RepeatFrequency,
  resolveAddTaskProjectValue,
  resolveRepeatValidationMessage,
  shouldAutoSyncRepeatUntil,
} from '@/features/planner/lib/taskFormRules';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStartDate?: string;
  initialEndDate?: string;
  initialProjectId?: string | null;
  initialAssigneeIds?: string[];
}

const resolveDefaultStatusId = (statuses: Status[]) => {
  if (statuses.length === 0) return '';
  const aliases = new Set([
    'todo',
    'todonew',
    'to do',
    'to-do',
    'to_do',
    'квыполнению',
    'сделать',
    'новая',
  ]);

  const normalize = (value: string) => stripStatusEmoji(value).trim().toLowerCase();
  const compact = (value: string) => normalize(value).replace(/[\s\-_]+/g, '');

  const preferred = statuses.find((status) => {
    const normalized = normalize(status.name);
    const packed = compact(status.name);
    return aliases.has(normalized) || aliases.has(packed);
  });
  if (preferred) return preferred.id;

  const firstOpen = statuses.find((status) => !status.isFinal && !status.isCancelled);
  return firstOpen?.id ?? statuses[0]?.id ?? '';
};

const LazyRichTextEditor = lazy(async () => {
  const module = await import('@/features/planner/components/RichTextEditor');
  return { default: module.RichTextEditor };
});

type DraftSubtask = {
  id: string;
  title: string;
};

const createDraftSubtaskId = () => (
  `draft-subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const AddTaskDialog: React.FC<AddTaskDialogProps> = ({
  open,
  onOpenChange,
  initialStartDate,
  initialEndDate,
  initialProjectId,
  initialAssigneeIds,
}) => {
  const {
    projects,
    trackedProjectIds,
    assignees,
    statuses,
    taskTypes,
    tags,
    groupMode,
    addTask,
    createRepeats,
    createTaskSubtasks,
  } = usePlannerStore();
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const filteredAssignees = useFilteredAssignees(assignees);
  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => !project.archived),
      trackedProjectIds,
    ),
    [projects, trackedProjectIds],
  );
  const selectableAssignees = useMemo(
    () => filteredAssignees.filter((assignee) => assignee.isActive),
    [filteredAssignees],
  );
  const defaultStatusId = useMemo(() => {
    return resolveDefaultStatusId(statuses);
  }, [statuses]);
  const noProjectDisabled = groupMode === 'project';
  const fallbackProjectId = activeProjects[0]?.id;
  
  const today = new Date();
  const defaultStart = format(today, 'yyyy-MM-dd');
  const initialStart = initialStartDate ?? defaultStart;
  const initialEnd = initialEndDate ?? initialStart;
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [projectInitialized, setProjectInitialized] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [statusId, setStatusId] = useState(defaultStatusId);
  const [typeId, setTypeId] = useState(taskTypes[0]?.id || '');
  const [priority, setPriority] = useState<TaskPriority | 'none'>('none');
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const repeatUntilAutoRef = useRef(true);
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('none');
  const [repeatEnds, setRepeatEnds] = useState<RepeatEnds>('never');
  const [repeatUntil, setRepeatUntil] = useState(getDefaultRepeatUntil(initialStart));
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatError, setRepeatError] = useState('');
  const [repeatCreating, setRepeatCreating] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [subtasks, setSubtasks] = useState<DraftSubtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [assigneePopoverFrozenOrderIds, setAssigneePopoverFrozenOrderIds] = useState<string[] | null>(null);
  const subtaskInputRef = useRef<HTMLInputElement | null>(null);

  const sortAssigneeIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return [];
    const order = new Map(assignees.map((assignee, index) => [assignee.id, index]));
    return Array.from(new Set(ids)).sort((left, right) => (
      (order.get(left) ?? 0) - (order.get(right) ?? 0)
    ));
  }, [assignees]);

  const normalizeAssigneeSelection = useCallback((ids: string[] | undefined) => {
    if (!ids || ids.length === 0) return [];
    return sortAssigneeIds(ids);
  }, [sortAssigneeIds]);

  const markChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  const handleTagToggle = (tagId: string) => {
    markChanged();
    setTagIds((prev) => (
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    ));
  };

  const setAssigneeChecked = useCallback((assigneeId: string, checked: boolean) => {
    markChanged();
    setAssigneeIds((prev) => {
      const next = checked
        ? [...prev, assigneeId]
        : prev.filter((id) => id !== assigneeId);
      return sortAssigneeIds(next);
    });
  }, [markChanged, sortAssigneeIds]);

  const handleRepeatFrequencyChange = (value: typeof repeatFrequency) => {
    markChanged();
    setRepeatFrequency(value);
    const nextUntil = getAutoRepeatUntilOnFrequencyChange({
      nextFrequency: value,
      currentEnds: repeatEnds,
      baseDate: startDate,
    });
    if (!nextUntil) return;
    repeatUntilAutoRef.current = true;
    setRepeatUntil(nextUntil);
  };

  const handleRepeatEndsChange = (value: typeof repeatEnds) => {
    markChanged();
    setRepeatEnds(value);
    const nextUntil = getAutoRepeatUntilOnEndsChange({
      nextEnds: value,
      baseDate: startDate,
    });
    if (!nextUntil) return;
    repeatUntilAutoRef.current = true;
    setRepeatUntil(nextUntil);
  };

  const handleRepeatToggle = (enabled: boolean) => {
    markChanged();
    setRepeatOpen(enabled);
    if (enabled) return;
    setRepeatFrequency('none');
    setRepeatEnds('never');
    repeatUntilAutoRef.current = true;
    setRepeatUntil(getDefaultRepeatUntil(startDate));
    setRepeatCount(4);
    setRepeatError('');
  };

  const requestClose = () => {
    if (hasChanges) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      requestClose();
      return;
    }
    onOpenChange(true);
  };

  const handleStartDateChange = (value: string) => {
    markChanged();
    setStartDate(value);
    if (!shouldAutoSyncRepeatUntil({
      frequency: repeatFrequency,
      ends: repeatEnds,
      auto: repeatUntilAutoRef.current,
    })) return;
    setRepeatUntil(getDefaultRepeatUntil(value));
  };

  const handleOpenSubtasks = () => {
    setSubtasksOpen(true);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        subtaskInputRef.current?.focus();
      });
    }
  };

  const handleAddSubtask = () => {
    const title = newSubtaskTitle.trim();
    if (!title) return;
    markChanged();
    setSubtasks((current) => [...current, { id: createDraftSubtaskId(), title }]);
    setNewSubtaskTitle('');
    subtaskInputRef.current?.focus();
  };

  const handleRemoveSubtask = (subtaskId: string) => {
    markChanged();
    setSubtasks((current) => current.filter((item) => item.id !== subtaskId));
  };

  const handleAssigneePopoverOpenChange = useCallback((nextOpen: boolean) => {
    setAssigneePopoverOpen(nextOpen);
    if (nextOpen) {
      setAssigneePopoverFrozenOrderIds(selectableAssignees.map((assignee) => assignee.id));
      return;
    }
    setAssigneePopoverFrozenOrderIds(null);
  }, [selectableAssignees]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !statusId || !typeId) return;

    setRepeatError('');
    const repeatValidationMessage = resolveRepeatValidationMessage({
      frequency: repeatFrequency,
      ends: repeatEnds,
      until: repeatUntil,
      count: repeatCount,
    }, {
      missingCount: t`Enter how many repeats to create.`,
      missingUntil: t`Select an end date.`,
    });
    if (repeatValidationMessage) {
      setRepeatError(repeatValidationMessage);
      return;
    }

    setRepeatCreating(true);
    const createdTask = await addTask({
      title: title.trim(),
      projectId: projectId === 'none' ? null : projectId,
      assigneeIds,
      statusId,
      typeId,
      priority: priority === 'none' ? null : priority,
      startDate,
      endDate,
      tagIds,
      description: description.trim() || null,
      repeatId: null,
    });

    if (!createdTask) {
      setRepeatError(t`Failed to create task.`);
      setRepeatCreating(false);
      return;
    }

    if (subtasks.length > 0 && currentWorkspaceId) {
      const subtaskResult = await createTaskSubtasks(
        currentWorkspaceId,
        createdTask.id,
        subtasks.map((subtask) => subtask.title),
      );
      if (subtaskResult.error) {
        console.error(subtaskResult.error);
        toast(t`Task was created, but subtasks were not saved.`);
      }
    }

    if (repeatFrequency !== 'none') {
      const result = await createRepeats(
        createdTask.id,
        buildCreateRepeatsOptions({
          frequency: repeatFrequency,
          ends: repeatEnds,
          until: repeatUntil,
          count: repeatCount,
        }),
      );
      if (result.error) {
        setRepeatError(result.error);
        setRepeatCreating(false);
        return;
      }
    }
    
    // Reset form
    setTitle('');
    setProjectId(resolveAddTaskProjectValue({
      fallbackProjectId,
      noProjectDisabled,
    }));
    setProjectInitialized(false);
    setAssigneeIds([]);
    setStatusId(defaultStatusId);
    setTypeId(taskTypes[0]?.id || '');
    setPriority('none');
    setStartDate(defaultStart);
    setEndDate(defaultStart);
    setTagIds([]);
    setDescription('');
    setRepeatFrequency('none');
    setRepeatEnds('never');
    repeatUntilAutoRef.current = true;
    setRepeatUntil(getDefaultRepeatUntil(defaultStart));
    setRepeatCount(4);
    setRepeatError('');
    setRepeatCreating(false);
    setRepeatOpen(false);
    setHasChanges(false);
    setAssigneePopoverOpen(false);
    setAssigneePopoverFrozenOrderIds(null);
    setSubtasksOpen(false);
    setSubtasks([]);
    setNewSubtaskTitle('');
    
    onOpenChange(false);
  };

  useEffect(() => {
    if (!statusId && defaultStatusId) {
      setStatusId(defaultStatusId);
    }
  }, [defaultStatusId, statusId]);

  useEffect(() => {
    if (!open) {
      setProjectInitialized(false);
      setHasChanges(false);
      setRepeatOpen(false);
      setConfirmCloseOpen(false);
      setAssigneePopoverOpen(false);
      setAssigneePopoverFrozenOrderIds(null);
      setSubtasksOpen(false);
      setSubtasks([]);
      setNewSubtaskTitle('');
      return;
    }
    if (projectInitialized) return;
    const nextStart = initialStartDate ?? defaultStart;
    const nextEnd = initialEndDate ?? nextStart;
    const nextProjectId = resolveAddTaskProjectValue({
      initialProjectId,
      fallbackProjectId,
      noProjectDisabled,
    });
    const nextAssignees = normalizeAssigneeSelection(initialAssigneeIds)
      .filter((id) => selectableAssignees.some((assignee) => assignee.id === id));

    setStartDate(nextStart);
    setEndDate(nextEnd);
    setProjectId(nextProjectId);
    setAssigneeIds(nextAssignees);
    setStatusId(defaultStatusId);
    setRepeatFrequency('none');
    setRepeatEnds('never');
    repeatUntilAutoRef.current = true;
    setRepeatUntil(getDefaultRepeatUntil(nextStart));
    setRepeatCount(4);
    setRepeatError('');
    setRepeatOpen(false);
    setHasChanges(false);
    setAssigneePopoverOpen(false);
    setAssigneePopoverFrozenOrderIds(null);
    setSubtasksOpen(false);
    setSubtasks([]);
    setNewSubtaskTitle('');
    setProjectInitialized(true);
  }, [
    defaultStart,
    fallbackProjectId,
    initialAssigneeIds,
    initialEndDate,
    initialProjectId,
    initialStartDate,
    normalizeAssigneeSelection,
    defaultStatusId,
    noProjectDisabled,
    open,
    projectInitialized,
    selectableAssignees,
  ]);

  useEffect(() => {
    if (!typeId && taskTypes[0]?.id) {
      setTypeId(taskTypes[0].id);
    }
  }, [taskTypes, typeId]);

  const assigneeLabel = useMemo(() => {
    if (assigneeIds.length === 0) return t`Unassigned`;
    const selected = selectableAssignees
      .filter((assignee) => assigneeIds.includes(assignee.id))
      .map((assignee) => assignee.name);
    if (selected.length === 1 && assigneeIds.length === 1) return selected[0];
    return t`${assigneeIds.length} assignees`;
  }, [assigneeIds, selectableAssignees]);

  const orderedSelectableAssignees = useMemo(() => {
    return orderAssigneesForPopover({
      assignees: selectableAssignees,
      selectedAssigneeIds: assigneeIds,
      frozenOrderIds: assigneePopoverOpen ? assigneePopoverFrozenOrderIds : null,
    });
  }, [assigneeIds, assigneePopoverFrozenOrderIds, assigneePopoverOpen, selectableAssignees]);
  
  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t`Create new task`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Fill out task fields and create a new task.`}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-3 mt-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-title">{t`Title`} *</Label>
            <Input
              id="new-title"
              value={title}
              onChange={(e) => {
                markChanged();
                setTitle(e.target.value);
              }}
              placeholder={t`Enter task title...`}
              autoFocus
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t`Project`}</Label>
              <TaskProjectSelect
                value={projectId}
                projects={activeProjects}
                noProjectDisabled={noProjectDisabled}
                onValueChange={(value) => {
                  markChanged();
                  setProjectId(value);
                }}
              />
            </div>
            
            <div className="space-y-1.5">
              <Label>{t`Assignees`}</Label>
              <Popover open={assigneePopoverOpen} onOpenChange={handleAssigneePopoverOpenChange}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="truncate">{assigneeLabel}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  {selectableAssignees.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t`No assignees yet.`}</div>
                  ) : (
                    <div
                      className="max-h-48 overflow-y-auto overscroll-contain pr-2"
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-1">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-sm py-1 text-left hover:bg-accent/50"
                          onClick={() => {
                            markChanged();
                            setAssigneeIds([]);
                          }}
                        >
                          <Checkbox
                            checked={assigneeIds.length === 0}
                            onClick={(event) => event.stopPropagation()}
                            onCheckedChange={(checked) => {
                              if (checked !== true) return;
                              markChanged();
                              setAssigneeIds([]);
                            }}
                          />
                          <span className="text-sm truncate">{t`Unassigned`}</span>
                        </button>
                        {orderedSelectableAssignees.map((assignee) => (
                          <button
                            key={assignee.id}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm py-1 text-left hover:bg-accent/50"
                            onClick={() => setAssigneeChecked(assignee.id, !assigneeIds.includes(assignee.id))}
                          >
                            <Checkbox
                              checked={assigneeIds.includes(assignee.id)}
                              onClick={(event) => event.stopPropagation()}
                              onCheckedChange={(checked) => setAssigneeChecked(assignee.id, checked === true)}
                            />
                            <span className="text-sm truncate">{assignee.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t`Status`}</Label>
              <Select
                value={statusId}
                onValueChange={(value) => {
                  markChanged();
                  setStatusId(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t`Select status`} />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(s => (
                    <SelectItem key={s.id} value={s.id}>{formatStatusLabel(s.name, s.emoji)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label>{t`Type`}</Label>
              <Select
                value={typeId}
                onValueChange={(value) => {
                  markChanged();
                  setTypeId(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t`Select type`} />
                </SelectTrigger>
                <SelectContent>
                  {taskTypes.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t`Priority`}</Label>
            <Select
              value={priority}
              onValueChange={(value) => {
                markChanged();
                setPriority(value as TaskPriority | 'none');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t`Select priority`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t`No priority`}</SelectItem>
                <SelectItem value="low">{t`Low`}</SelectItem>
                <SelectItem value="medium">{t`Medium`}</SelectItem>
                <SelectItem value="high">{t`High`}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-start">{t`Start date`}</Label>
              <Input
                id="new-start"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-end">{t`End date`}</Label>
              <Input
                id="new-end"
                type="date"
                value={endDate}
                onChange={(e) => {
                  markChanged();
                  setEndDate(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t`Repeat`}</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {repeatOpen ? t`On` : t`Off`}
                </span>
                <Switch checked={repeatOpen} onCheckedChange={handleRepeatToggle} />
              </div>
            </div>
            {repeatOpen && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Select
                      value={repeatFrequency}
                      onValueChange={(value) => handleRepeatFrequencyChange(value as typeof repeatFrequency)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t`Repeat`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t`Does not repeat`}</SelectItem>
                        <SelectItem value="daily">{t`Daily`}</SelectItem>
                        <SelectItem value="weekly">{t`Weekly`}</SelectItem>
                        <SelectItem value="biweekly">{t`Biweekly (every 2 weeks)`}</SelectItem>
                        <SelectItem value="monthly">{t`Monthly`}</SelectItem>
                        <SelectItem value="yearly">{t`Yearly`}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{t`Repeat type`}</p>
                  </div>
                  <div className="space-y-1">
                    <Select
                      value={repeatEnds}
                      onValueChange={(value) => handleRepeatEndsChange(value as typeof repeatEnds)}
                      disabled={repeatFrequency === 'none'}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t`Ends`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">{t`Never`}</SelectItem>
                        <SelectItem value="on">{t`Until date`}</SelectItem>
                        <SelectItem value="after">{t`Count`}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{t`Repeat limit`}</p>
                  </div>
                </div>
                {repeatFrequency !== 'none' && repeatEnds === 'on' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="new-repeat-until" className="text-xs text-muted-foreground">{t`End date`}</Label>
                    <Input
                      id="new-repeat-until"
                      type="date"
                      value={repeatUntil}
                      onChange={(e) => {
                        markChanged();
                        repeatUntilAutoRef.current = false;
                        setRepeatUntil(e.target.value);
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">{t`Repeats until the selected date.`}</p>
                  </div>
                )}
                {repeatFrequency !== 'none' && repeatEnds === 'after' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="new-repeat-count" className="text-xs text-muted-foreground">{t`Occurrences`}</Label>
                    <Input
                      id="new-repeat-count"
                      type="number"
                      min={1}
                      step={1}
                      value={formatRepeatCountInputValue(repeatCount)}
                      onChange={(e) => {
                        markChanged();
                        const nextRepeatCount = parseRepeatCountInput(e.target.value);
                        if (nextRepeatCount === null) return;
                        setRepeatCount(nextRepeatCount);
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">{t`Creates the specified number of repeats.`}</p>
                  </div>
                )}
                {repeatError && (
                  <div className="text-xs text-destructive">{repeatError}</div>
                )}
              </>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="new-description">{t`Description`}</Label>
            {open && (
              <Suspense
                fallback={(
                  <div className="min-h-[140px] rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    {t`Loading editor...`}
                  </div>
                )}
              >
                <LazyRichTextEditor
                  id="new-description"
                  value={description}
                  workspaceId={currentWorkspaceId}
                  onChange={(value) => {
                    markChanged();
                    setDescription(value);
                  }}
                  placeholder={t`Add a description...`}
                />
              </Suspense>
            )}
          </div>

          {!subtasksOpen ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 w-fit gap-1.5 text-xs"
              onClick={handleOpenSubtasks}
            >
              <Plus className="h-3.5 w-3.5" />
              {t`Add subtask`}
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input
                  ref={subtaskInputRef}
                  value={newSubtaskTitle}
                  onChange={(event) => {
                    markChanged();
                    setNewSubtaskTitle(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    handleAddSubtask();
                  }}
                  placeholder={t`Subtask title`}
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  className="h-8 px-3 text-xs"
                  onClick={handleAddSubtask}
                  disabled={!newSubtaskTitle.trim()}
                >
                  {t`Add`}
                </Button>
              </div>

              {subtasks.length === 0 ? (
                <div className="text-xs text-muted-foreground">{t`No subtasks yet.`}</div>
              ) : (
                <div className="space-y-1.5">
                  {subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2"
                    >
                      <span className="truncate text-sm text-foreground">{subtask.title}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleRemoveSubtask(subtask.id)}
                        aria-label={t`Remove subtask`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{t`Tags`}</Label>
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t`No tags available yet.`}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => {
                  const isSelected = tagIds.includes(tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isSelected ? 'default' : 'outline'}
                      className={cn('transition-all cursor-pointer')}
                      style={isSelected ? { 
                        backgroundColor: tag.color,
                        borderColor: tag.color,
                      } : {
                        borderColor: tag.color,
                        color: tag.color,
                      }}
                      onClick={() => handleTagToggle(tag.id)}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </span>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              {t`Cancel`}
            </Button>
            <Button type="submit" disabled={!title.trim() || !statusId || !typeId || repeatCreating}>
              <Plus className="w-4 h-4 mr-2" />
              {t`Create task`}
            </Button>
          </DialogFooter>
        </form>
        <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t`Discard task?`}</AlertDialogTitle>
              <AlertDialogDescription>
                {t`You have unsaved changes. Close without creating the task?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t`Keep editing`}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setConfirmCloseOpen(false);
                  setHasChanges(false);
                  onOpenChange(false);
                }}
              >
                {t`Discard`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};
