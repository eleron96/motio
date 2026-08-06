import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyNamed } from '@/shared/lib/lazyComponent';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useShallow } from 'zustand/react/shallow';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { RepeatPopoverField } from '@/features/planner/components/RepeatPopoverField';
import { TaskProjectSelect } from '@/features/planner/components/TaskProjectSelect';
import { TagMultiSelect } from '@/features/planner/components/TagMultiSelect';
import { ComposerEyebrow } from '@/features/planner/components/ComposerEyebrow';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';
import { Input } from '@/shared/ui/input';
import { AutoGrowTextarea } from '@/shared/ui/auto-grow-textarea';
import { Label } from '@/shared/ui/label';
import { formatStatusLabel, stripStatusEmoji } from '@/shared/lib/statusLabels';
import { Dialog, DialogDescription, DialogHeader, DialogScrollContent, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
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
import { Checkbox } from '@/shared/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { getPersonMonogram } from '@/shared/domain/personName';
import { ChevronDown, Plus, X } from 'lucide-react';
import { clampTaskDates, format, getMinEndDate } from '@/features/planner/lib/dateUtils';
import { TaskPriority } from '@/features/planner/types/planner';
import { TimeOffFields } from '@/features/planner/components/TimeOffFields';
import { findTimeOffConflict, NO_TIME_OFF } from '@/features/planner/lib/timeOff';
import { resolveCurrentUserAssigneeId } from '@/features/planner/lib/timelineSelectors';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobileFormScreen } from '@/shared/ui/mobile-form-screen';
import { MobileAssigneeField } from '@/features/planner/components/MobileAssigneeField';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { orderAssigneesForPopover } from '@/features/planner/lib/assigneePopoverOrder';
import { t } from '@lingui/macro';
import { Status } from '@/features/planner/types/planner';
import { toast } from 'sonner';
import {
  buildCreateRepeatsOptions,
  getAutoRepeatUntilOnEndsChange,
  getAutoRepeatUntilOnFrequencyChange,
  getDefaultRepeatUntil,
  getRepeatOccurrenceDate,
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
  /** Lock the project field to the initial value (used on the Projects tab). */
  lockProject?: boolean;
  /** Planner only: offer the second mode, "Отметить выходной". */
  timeOffEnabled?: boolean;
  /** Open straight in time-off mode and hide the task tab (viewers cannot create tasks). */
  timeOffOnly?: boolean;
  /** Called after a task is successfully created (e.g. to refetch a list). */
  onCreated?: () => void;
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

const LazyRichTextEditor = lazyNamed(
  () => import('@/features/planner/components/RichTextEditor'),
  'RichTextEditor'
);

/** The mobile footer sits outside the <form>, so its submit button targets it by id. */
const MOBILE_FORM_ID = 'add-task-mobile-form';

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
  lockProject = false,
  timeOffEnabled = false,
  timeOffOnly = false,
  onCreated,
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
    timeOff,
    addTimeOff,
  } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    trackedProjectIds: state.trackedProjectIds,
    assignees: state.assignees,
    statuses: state.statuses,
    taskTypes: state.taskTypes,
    tags: state.tags,
    groupMode: state.groupMode,
    addTask: state.addTask,
    createRepeats: state.createRepeats,
    createTaskSubtasks: state.createTaskSubtasks,
    timeOff: state.timeOff ?? NO_TIME_OFF,
    addTimeOff: state.addTimeOff,
  })));
  const isMobile = useIsMobile();
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const currentUser = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
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
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  // Second mode of this dialog: "Отметить выходной". Task fields stay mounted
  // but hidden, so switching back and forth keeps what was already typed.
  const [mode, setMode] = useState<'task' | 'time_off'>(timeOffOnly ? 'time_off' : 'task');
  const [timeOffAssigneeId, setTimeOffAssigneeId] = useState('');
  // Own dates: sharing the task form's state let a time-off edit silently
  // rewrite the dates of the task draft the user had started.
  const [timeOffStart, setTimeOffStart] = useState('');
  const [timeOffEnd, setTimeOffEnd] = useState('');
  const [timeOffNote, setTimeOffNote] = useState('');
  const [timeOffError, setTimeOffError] = useState('');
  const [timeOffSaving, setTimeOffSaving] = useState(false);
  const [subtasks, setSubtasks] = useState<DraftSubtask[]>([]);
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [assigneePopoverFrozenOrderIds, setAssigneePopoverFrozenOrderIds] = useState<string[] | null>(null);
  const focusSubtaskIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

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

  const myAssigneeId = useMemo(
    () => resolveCurrentUserAssigneeId(assignees, currentUser?.id),
    [assignees, currentUser?.id],
  );
  // Admins record days off for anyone; everyone else only for themselves.
  const canPickTimeOffAssignee = currentWorkspaceRole === 'admin';
  const timeOffAvailable = timeOffEnabled && (canPickTimeOffAssignee || Boolean(myAssigneeId));
  const timeOffSiblings = useMemo(
    () => timeOff.filter((record) => record.assigneeId === timeOffAssigneeId),
    [timeOff, timeOffAssigneeId],
  );
  const timeOffDatesFilled = Boolean(timeOffStart && timeOffEnd);
  const timeOffConflict = useMemo(
    () => (timeOffAssigneeId && timeOffDatesFilled
      ? findTimeOffConflict({ startDate: timeOffStart, endDate: timeOffEnd }, timeOffSiblings)
      : null),
    [timeOffAssigneeId, timeOffDatesFilled, timeOffEnd, timeOffStart, timeOffSiblings],
  );

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

  const handleRepeatUntilChange = (value: string) => {
    markChanged();
    repeatUntilAutoRef.current = false;
    setRepeatUntil(value);
  };

  const handleRepeatCountInputChange = (rawValue: string) => {
    markChanged();
    const nextRepeatCount = parseRepeatCountInput(rawValue);
    if (nextRepeatCount === null) return;
    setRepeatCount(nextRepeatCount);
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
    // Keep the end on/after the start: bump it forward when the start passes it.
    setEndDate((prev) => clampTaskDates(value, prev).endDate);
    if (!shouldAutoSyncRepeatUntil({
      frequency: repeatFrequency,
      ends: repeatEnds,
      auto: repeatUntilAutoRef.current,
    })) return;
    setRepeatUntil(getDefaultRepeatUntil(value));
  };

  const handleAddDraftSubtask = () => {
    markChanged();
    const id = createDraftSubtaskId();
    focusSubtaskIdRef.current = id;
    setSubtasks((current) => [...current, { id, title: '' }]);
  };

  const handleDraftSubtaskTitleChange = (subtaskId: string, value: string) => {
    markChanged();
    setSubtasks((current) => (
      current.map((item) => (item.id === subtaskId ? { ...item, title: value } : item))
    ));
  };

  const handleRemoveSubtask = (subtaskId: string) => {
    markChanged();
    setSubtasks((current) => current.filter((item) => item.id !== subtaskId));
  };

  const handleAssigneePopoverOpenChange = useCallback((nextOpen: boolean) => {
    setAssigneePopoverOpen(nextOpen);
    if (nextOpen) {
      // Freeze a "selected first" order on open: already-chosen people sit at the
      // top (easier to see), and the list stays stable while open instead of
      // jumping as more are checked. Newly checked ones rise to the top next open.
      const ordered = orderAssigneesForPopover({
        assignees: selectableAssignees,
        selectedAssigneeIds: assigneeIds,
        frozenOrderIds: null,
      });
      setAssigneePopoverFrozenOrderIds(ordered.map((assignee) => assignee.id));
      return;
    }
    setAssigneePopoverFrozenOrderIds(null);
  }, [selectableAssignees, assigneeIds]);

  // Assignees can arrive after the dialog opened (first load, workspace switch),
  // so keep resolving until someone is picked instead of stranding the user.
  useEffect(() => {
    if (!open || timeOffAssigneeId || canPickTimeOffAssignee || !myAssigneeId) return;
    setTimeOffAssigneeId(myAssigneeId);
  }, [canPickTimeOffAssignee, myAssigneeId, open, timeOffAssigneeId]);

  const handleSubmitTimeOff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (timeOffSaving) return;
    setTimeOffError('');

    if (!timeOffAssigneeId) {
      setTimeOffError(t`Select a person.`);
      return;
    }
    if (!timeOffStart || !timeOffEnd) {
      setTimeOffError(t`Pick both dates.`);
      return;
    }
    const safeDates = clampTaskDates(timeOffStart, timeOffEnd);
    if (findTimeOffConflict({ startDate: safeDates.startDate, endDate: safeDates.endDate }, timeOffSiblings)) {
      setTimeOffError(t`These days are already marked as time off.`);
      return;
    }

    setTimeOffSaving(true);
    const result = await addTimeOff({
      assigneeId: timeOffAssigneeId,
      startDate: safeDates.startDate,
      endDate: safeDates.endDate,
      note: timeOffNote.trim() || null,
    });
    setTimeOffSaving(false);

    if (result.error) {
      // The database keeps the same invariant (0131): show the specific reason
      // when it names one, otherwise the raw message.
      if (result.code === 'overlap') setTimeOffError(t`These days are already marked as time off.`);
      else if (result.code === 'invalidRange') setTimeOffError(t`The end date cannot be earlier than the start date.`);
      else setTimeOffError(t`Failed to save the time off.`);
      return;
    }

    setHasChanges(false);
    onOpenChange(false);
    onCreated?.();
  };

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
    const safeDates = clampTaskDates(startDate, endDate);
    const createdTask = await addTask({
      title: title.trim(),
      projectId: projectId === 'none' ? null : projectId,
      assigneeIds,
      statusId,
      typeId,
      priority: priority === 'none' ? null : priority,
      startDate: safeDates.startDate,
      endDate: safeDates.endDate,
      tagIds,
      description: description.trim() || null,
      repeatId: null,
    });

    if (!createdTask) {
      setRepeatError(t`Failed to create task.`);
      setRepeatCreating(false);
      return;
    }

    const subtaskTitles = subtasks
      .map((subtask) => subtask.title.trim())
      .filter(Boolean);
    if (subtaskTitles.length > 0 && currentWorkspaceId) {
      const subtaskResult = await createTaskSubtasks(
        currentWorkspaceId,
        createdTask.id,
        subtaskTitles,
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
    setHasChanges(false);
    setAssigneePopoverOpen(false);
    setAssigneePopoverFrozenOrderIds(null);
    setSubtasks([]);

    onCreated?.();
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
      setConfirmCloseOpen(false);
      setAssigneePopoverOpen(false);
      setAssigneePopoverFrozenOrderIds(null);
      setSubtasks([]);
      setTimeOffError('');
      setTimeOffSaving(false);
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
    setHasChanges(false);
    setAssigneePopoverOpen(false);
    setAssigneePopoverFrozenOrderIds(null);
    setSubtasks([]);
    setMode(timeOffOnly ? 'time_off' : 'task');
    // Prefill the person: an admin who double-clicked someone's row marks that
    // person, everyone else marks themselves.
    setTimeOffAssigneeId(
      (canPickTimeOffAssignee ? nextAssignees[0] : null) ?? myAssigneeId ?? '',
    );
    setTimeOffStart(nextStart);
    setTimeOffEnd(nextEnd);
    setTimeOffNote('');
    setTimeOffError('');
    setTimeOffSaving(false);
    setProjectInitialized(true);
  }, [
    canPickTimeOffAssignee,
    myAssigneeId,
    timeOffOnly,
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

  const formBody = (
    <>
      {mode === 'time_off' && (
        <div className="px-6 pb-6 pt-1">
          <TimeOffFields
            assignees={selectableAssignees}
            assigneeId={timeOffAssigneeId}
            onAssigneeChange={(id) => {
              markChanged();
              setTimeOffError('');
              setTimeOffAssigneeId(id);
            }}
            canPickAssignee={canPickTimeOffAssignee}
            startDate={timeOffStart}
            endDate={timeOffEnd}
            note={timeOffNote}
            onStartDateChange={(value) => {
              markChanged();
              setTimeOffError('');
              setTimeOffStart(value);
              setTimeOffEnd((previous) => (
                value && previous ? clampTaskDates(value, previous).endDate : previous
              ));
            }}
            onEndDateChange={(value) => {
              markChanged();
              setTimeOffError('');
              setTimeOffEnd(
                value && timeOffStart ? clampTaskDates(timeOffStart, value).endDate : value,
              );
            }}
            onNoteChange={(value) => {
              markChanged();
              setTimeOffNote(value);
            }}
            conflictMessage={timeOffError || (timeOffConflict ? t`These days are already marked as time off.` : null)}
          />
        </div>
      )}
      <div className={cn(
        // grid-cols-1 is not cosmetic: without a template the implicit track sizes
            // to min-content, so one unbreakable word in the description would widen
            // the whole column and push every field off the right edge.
            'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px]',
        mode === 'time_off' && 'hidden',
      )}>
        {/* ── Left column: content */}
        <div className="min-w-0 space-y-4 px-6 pb-6">
          <ComposerEyebrow>{t`Information`}</ComposerEyebrow>

          <div className="space-y-1.5">
            <Label htmlFor="new-title">{t`Title`} *</Label>
            <Input
              id="new-title"
              ref={titleInputRef}
              value={title}
              onChange={(e) => {
                markChanged();
                setTitle(e.target.value);
              }}
              placeholder={t`Enter task title...`}
            />
          </div>

          <div className="space-y-1.5">
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
                  framed
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
            <p className="text-xs text-muted-foreground">
              {t`Drag and drop image files into the description area.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="block">{t`Subtasks`}</Label>
            {subtasks.length > 0 && (
              <div className="space-y-1">
                {subtasks.map((subtask) => (
                  <div
                    key={subtask.id}
                    className="group flex items-start gap-2.5"
                  >
                    <span
                      className="mt-2.5 h-4 w-4 shrink-0 rounded-[5px] border-[1.5px] border-input"
                      aria-hidden="true"
                    />
                    <AutoGrowTextarea
                      ref={(element) => {
                        if (element && focusSubtaskIdRef.current === subtask.id) {
                          element.focus();
                          focusSubtaskIdRef.current = null;
                        }
                      }}
                      value={subtask.title}
                      onChange={(event) => handleDraftSubtaskTitleChange(subtask.id, event.target.value)}
                      onKeyDown={(event) => {
                        // Enter breaks the line; a new subtask comes from the button below.
                        if (event.key === 'Backspace' && subtask.title === '') {
                          event.preventDefault();
                          handleRemoveSubtask(subtask.id);
                        }
                      }}
                      onBlur={() => {
                        // Trailing blank lines are dropped on save anyway; shed
                        // them here so the field stops showing phantom height.
                        const trimmed = subtask.title.trim();
                        if (trimmed !== subtask.title) {
                          handleDraftSubtaskTitleChange(subtask.id, trimmed);
                        }
                      }}
                      rows={1}
                      placeholder={t`Subtask title`}
                      className="min-h-[36px] min-w-0 flex-1 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1.5 h-6 w-6 shrink-0 opacity-100 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                      onClick={() => handleRemoveSubtask(subtask.id)}
                      aria-label={t`Remove subtask`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-fit gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleAddDraftSubtask}
            >
              <Plus className="h-3.5 w-3.5" />
              {t`Add subtask`}
            </Button>
          </div>
        </div>

        {/* ── Right column: parameters panel */}
        <div className="min-w-0 space-y-3.5 border-t border-border bg-secondary/70 px-5 pb-6 pt-4 md:border-0 md:bg-transparent md:pt-0">
          <ComposerEyebrow>{t`Parameters`}</ComposerEyebrow>

          <div className="space-y-1.5">
            <Label>{t`Project`}</Label>
            <TaskProjectSelect
              value={projectId}
              projects={activeProjects}
              noProjectDisabled={noProjectDisabled}
              disabled={lockProject}
              triggerClassName="h-auto min-h-10 bg-background [&>span]:line-clamp-2"
              onValueChange={(value) => {
                markChanged();
                setProjectId(value);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t`Assignees`}</Label>
            {isMobile ? (
              <MobileAssigneeField
                label={assigneeLabel}
                assignees={orderedSelectableAssignees}
                selectedIds={assigneeIds}
                onChange={(ids) => {
                  markChanged();
                  setAssigneeIds(ids);
                }}
              />
            ) : (
            <Popover open={assigneePopoverOpen} onOpenChange={handleAssigneePopoverOpenChange}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between bg-background font-normal">
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
                          <PersonAvatar
                            assigneeId={assignee.id}
                            userId={assignee.userId}
                            avatarUrl={assignee.avatar}
                            initials={getPersonMonogram(assignee.name, 'U')}
                            colorSeed={assignee.userId ?? assignee.id}
                            size="xs"
                          />
                          <span className="text-sm truncate">{assignee.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 min-w-0">
              <Label>{t`Status`}</Label>
              <Select
                value={statusId}
                onValueChange={(value) => {
                  markChanged();
                  setStatusId(value);
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={t`Select status`} />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(s => (
                    <SelectItem key={s.id} value={s.id}>{formatStatusLabel(s.name, s.emoji)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label>{t`Priority`}</Label>
              <Select
                value={priority}
                onValueChange={(value) => {
                  markChanged();
                  setPriority(value as TaskPriority | 'none');
                }}
              >
                <SelectTrigger className="bg-background">
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
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={t`Select type`} />
              </SelectTrigger>
              <SelectContent>
                {taskTypes.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="new-start">{t`Start date`}</Label>
              <Input
                id="new-start"
                type="date"
                className="bg-background px-2 text-sm tabular-nums"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="new-end">{t`End date`}</Label>
              <Input
                id="new-end"
                type="date"
                className="bg-background px-2 text-sm tabular-nums"
                value={endDate}
                min={getMinEndDate(startDate)}
                onChange={(e) => {
                  markChanged();
                  setEndDate(clampTaskDates(startDate, e.target.value).endDate);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t`Repeat`}</Label>
            <RepeatPopoverField
              count={repeatCount}
              ends={repeatEnds}
              error={repeatError}
              frequency={repeatFrequency}
              idPrefix="new"
              onCountInputChange={handleRepeatCountInputChange}
              onEndsChange={handleRepeatEndsChange}
              onFrequencyChange={handleRepeatFrequencyChange}
              onUntilChange={handleRepeatUntilChange}
              projectedEnd={getRepeatOccurrenceDate(startDate, repeatFrequency, repeatCount)}
              until={repeatUntil}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t`Tags`}</Label>
            <TagMultiSelect
              tags={tags}
              selectedTagIds={tagIds}
              onToggleTag={handleTagToggle}
            />
          </div>
        </div>
      </div>

    </>
  );

  const screenTitle = mode === 'time_off' ? t`Mark time off` : t`Create new task`;
  const screenDescription = mode === 'time_off'
    ? t`Pick the days you will be away.`
    : t`Fill out task fields and create a new task.`;

  const modeSwitch = timeOffAvailable && !timeOffOnly ? (
    <SegmentedControl surface="compact" className="w-fit">
      <SegmentedControlItem
        type="button"
        size={isMobile ? 'touch' : 'sm'}
        active={mode === 'task'}
        onClick={() => setMode('task')}
      >
        {t`Task`}
      </SegmentedControlItem>
      <SegmentedControlItem
        type="button"
        size={isMobile ? 'touch' : 'sm'}
        active={mode === 'time_off'}
        onClick={() => setMode('time_off')}
      >
        {t`Mark time off`}
      </SegmentedControlItem>
    </SegmentedControl>
  ) : null;

  const cancelButton = (
    <Button type="button" variant="outline" onClick={requestClose} className={isMobile ? 'h-11 flex-1' : undefined}>
      {t`Cancel`}
    </Button>
  );

  const submitButton = mode === 'time_off' ? (
    <Button
      type="submit"
      form={isMobile ? MOBILE_FORM_ID : undefined}
      className={isMobile ? 'h-11 flex-1' : undefined}
      disabled={!timeOffAssigneeId || !timeOffDatesFilled || Boolean(timeOffConflict) || timeOffSaving}
    >
      <Plus className="w-4 h-4 mr-2" />
      {t`Mark time off`}
    </Button>
  ) : (
    <Button
      type="submit"
      form={isMobile ? MOBILE_FORM_ID : undefined}
      className={isMobile ? 'h-11 flex-1' : undefined}
      disabled={!title.trim() || !statusId || !typeId || repeatCreating}
    >
      <Plus className="w-4 h-4 mr-2" />
      {t`Create task`}
    </Button>
  );

  const confirmCloseDialog = (
    <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
      <AlertDialogContent className={isMobile ? 'w-[calc(100%-3rem)] max-w-[340px] rounded-2xl p-5' : undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === 'time_off' ? t`Discard time off?` : t`Discard task?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mode === 'time_off'
              ? t`You have unsaved changes. Close without marking the time off?`
              : t`You have unsaved changes. Close without creating the task?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={isMobile ? 'h-11 rounded-xl' : undefined}>
            {t`Keep editing`}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              isMobile && 'h-11 rounded-xl',
            )}
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
  );

  if (isMobile) {
    // A centred card drifts out of reach the moment iOS opens the keyboard —
    // the title (and the way out) scroll off the top. A full-screen screen
    // sized to the visual viewport keeps the header and the actions put.
    return (
      <>
        <MobileFormScreen
          open={open}
          onOpenChange={handleDialogOpenChange}
          title={screenTitle}
          description={screenDescription}
          toolbar={modeSwitch}
          footer={<div className="flex items-center gap-2">{cancelButton}{submitButton}</div>}
        >
          <form
            id={MOBILE_FORM_ID}
            onSubmit={mode === 'time_off' ? handleSubmitTimeOff : handleSubmit}
            className="relative flex flex-col"
          >
            {formBody}
          </form>
        </MobileFormScreen>
        {confirmCloseDialog}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogScrollContent
        className={cn(
          'flex w-full flex-col gap-0 p-0',
          mode === 'time_off' ? 'max-w-[460px]' : 'max-w-[880px]',
        )}
        onOpenAutoFocus={(event) => {
          // Focus the title field on open so the user can type without an extra click.
          // In time-off mode there is no title field — leave focus on the dialog
          // itself rather than on a hidden input.
          event.preventDefault();
          if (mode === 'task') titleInputRef.current?.focus();
        }}
      >
        {/* Full-height tint behind the parameters column, header and footer
            included. Task layout only — the time-off form is a single column, so
            the tint would just cut the dialog in half. */}
        {mode === 'task' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[340px] border-l border-border bg-secondary/70 md:block"
          />
        )}
        <DialogHeader className="relative px-6 pb-4 pr-12 pt-5">
          {modeSwitch && <div className="mb-3">{modeSwitch}</div>}
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {screenTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {screenDescription}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={mode === 'time_off' ? handleSubmitTimeOff : handleSubmit} className="relative flex flex-col">
          {formBody}

          <DialogFooter className="gap-2 px-6 py-3.5">
            {cancelButton}
            {submitButton}
          </DialogFooter>
        </form>
        {confirmCloseDialog}
      </DialogScrollContent>
    </Dialog>
  );
};
