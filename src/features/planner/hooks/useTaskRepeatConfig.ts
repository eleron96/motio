import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseISO } from 'date-fns';
import { RepeatTaskUpdateScope, Task } from '@/features/planner/types/planner';
import {
  buildCreateRepeatsOptions,
  getAutoRepeatUntilOnEndsChange,
  getAutoRepeatUntilOnFrequencyChange,
  getDefaultRepeatUntil,
  parseRepeatCountInput,
  RepeatEnds,
  RepeatFrequency,
  shouldAutoSyncRepeatUntil,
} from '@/features/planner/lib/taskFormRules';

export type PendingRepeatUpdate = {
  closeAfterApply?: boolean;
  kind: 'task-update' | 'repeat-config';
  nextSignature?: string;
  options?: ReturnType<typeof buildCreateRepeatsOptions>;
  scopes?: RepeatTaskUpdateScope[];
  taskId: string;
  updates?: Partial<Task>;
  resetDraftOnCancel?: boolean;
};

const buildRepeatConfigSignature = (params: {
  frequency: RepeatFrequency;
  ends: RepeatEnds;
  until: string;
  count: number;
}) => (
  `${params.frequency}|${params.ends}|${params.ends === 'on' ? params.until : ''}|${params.ends === 'after' ? params.count : ''}`
);

const inferRepeatFrequency = (series: Task[]): RepeatFrequency => {
  if (series.length < 2) return 'none';
  const sorted = [...series].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const firstDate = parseISO(sorted[0].startDate);
  const secondDate = parseISO(sorted[1].startDate);
  const dayDiff = Math.abs(Math.round((secondDate.getTime() - firstDate.getTime()) / 86400000));
  if (dayDiff === 1) return 'daily';
  if (dayDiff === 7) return 'weekly';
  if (dayDiff === 14) return 'biweekly';
  if (dayDiff >= 28 && dayDiff <= 31) return 'monthly';
  if (dayDiff >= 364 && dayDiff <= 366) return 'yearly';
  return 'none';
};

interface UseTaskRepeatConfigParams {
  task: Task | null;
  tasks: Task[];
  selectedTaskId: string | null;
}

export interface UseTaskRepeatConfigResult {
  repeatFrequency: RepeatFrequency;
  setRepeatFrequency: Dispatch<SetStateAction<RepeatFrequency>>;
  repeatEnds: RepeatEnds;
  setRepeatEnds: Dispatch<SetStateAction<RepeatEnds>>;
  repeatUntil: string;
  setRepeatUntil: Dispatch<SetStateAction<string>>;
  repeatCount: number;
  setRepeatCount: Dispatch<SetStateAction<number>>;
  repeatError: string;
  setRepeatError: Dispatch<SetStateAction<string>>;
  repeatNotice: string;
  setRepeatNotice: Dispatch<SetStateAction<string>>;
  repeatCreating: boolean;
  setRepeatCreating: Dispatch<SetStateAction<boolean>>;
  repeatScopeOpen: boolean;
  setRepeatScopeOpen: Dispatch<SetStateAction<boolean>>;
  pendingRepeatUpdate: PendingRepeatUpdate | null;
  setPendingRepeatUpdate: Dispatch<SetStateAction<PendingRepeatUpdate | null>>;
  repeatInFlightRef: MutableRefObject<boolean>;
  repeatUntilAutoRef: MutableRefObject<boolean>;
  repeatConfigDirty: boolean;
  handleRepeatFrequencyChange: (value: RepeatFrequency) => void;
  handleRepeatEndsChange: (value: RepeatEnds) => void;
  handleRepeatUntilChange: (value: string) => void;
  handleRepeatCountInputChange: (rawValue: string) => void;
}

export const useTaskRepeatConfig = ({
  task,
  tasks,
  selectedTaskId,
}: UseTaskRepeatConfigParams): UseTaskRepeatConfigResult => {
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('none');
  const [repeatEnds, setRepeatEnds] = useState<RepeatEnds>('never');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatError, setRepeatError] = useState('');
  const [repeatNotice, setRepeatNotice] = useState('');
  const [repeatCreating, setRepeatCreating] = useState(false);
  const [repeatScopeOpen, setRepeatScopeOpen] = useState(false);
  const [pendingRepeatUpdate, setPendingRepeatUpdate] = useState<PendingRepeatUpdate | null>(null);

  const repeatInFlightRef = useRef(false);
  const repeatUntilAutoRef = useRef(true);
  const repeatConfigSnapshotRef = useRef('');

  useEffect(() => {
    if (!task) return;
    const defaultRepeatUntil = getDefaultRepeatUntil(task.startDate);
    const series = task.repeatId
      ? tasks.filter((item) => item.repeatId === task.repeatId)
      : [];
    const inferredFrequency = task.repeatId ? inferRepeatFrequency(series) : 'none';
    const lastSeriesDate = series.length > 0
      ? [...series].sort((left, right) => left.startDate.localeCompare(right.startDate))[series.length - 1].startDate
      : null;

    let nextFrequency: RepeatFrequency = 'none';
    let nextEnds: RepeatEnds = 'never';
    let nextCount = 4;
    let nextUntil = defaultRepeatUntil;

    if (task.repeatId && inferredFrequency !== 'none') {
      nextFrequency = inferredFrequency;
      if (series.length > 1) {
        nextEnds = 'after';
        nextCount = series.length;
      } else {
        nextEnds = 'never';
        nextCount = 4;
      }
      nextUntil = lastSeriesDate ?? defaultRepeatUntil;
    }

    setRepeatFrequency(nextFrequency);
    setRepeatEnds(nextEnds);
    setRepeatCount(nextCount);
    setRepeatUntil(nextUntil);
    repeatConfigSnapshotRef.current = buildRepeatConfigSignature({
      frequency: nextFrequency,
      ends: nextEnds,
      until: nextUntil,
      count: nextCount,
    });

    repeatUntilAutoRef.current = true;
    setRepeatError('');
    setRepeatNotice('');
    setRepeatCreating(false);
  }, [task, tasks]);

  useEffect(() => {
    if (selectedTaskId) return;
    setRepeatScopeOpen(false);
    setPendingRepeatUpdate(null);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!task) return;
    if (!shouldAutoSyncRepeatUntil({
      frequency: repeatFrequency,
      ends: repeatEnds,
      auto: repeatUntilAutoRef.current,
    })) return;
    setRepeatUntil(getDefaultRepeatUntil(task.startDate));
  }, [repeatEnds, repeatFrequency, task]);

  const repeatConfigDirty = useMemo(() => (
    buildRepeatConfigSignature({
      frequency: repeatFrequency,
      ends: repeatEnds,
      until: repeatUntil,
      count: repeatCount,
    }) !== repeatConfigSnapshotRef.current
  ), [repeatCount, repeatEnds, repeatFrequency, repeatUntil]);

  const handleRepeatFrequencyChange = useCallback((value: RepeatFrequency) => {
    setRepeatFrequency(value);
    if (!task) return;
    const nextUntil = getAutoRepeatUntilOnFrequencyChange({
      nextFrequency: value,
      currentEnds: repeatEnds,
      baseDate: task.startDate,
    });
    if (!nextUntil) return;
    repeatUntilAutoRef.current = true;
    setRepeatUntil(nextUntil);
  }, [repeatEnds, task]);

  const handleRepeatEndsChange = useCallback((value: RepeatEnds) => {
    setRepeatEnds(value);
    if (!task) return;
    const nextUntil = getAutoRepeatUntilOnEndsChange({
      nextEnds: value,
      baseDate: task.startDate,
    });
    if (!nextUntil) return;
    repeatUntilAutoRef.current = true;
    setRepeatUntil(nextUntil);
  }, [task]);

  const handleRepeatUntilChange = useCallback((value: string) => {
    repeatUntilAutoRef.current = false;
    setRepeatUntil(value);
  }, []);

  const handleRepeatCountInputChange = useCallback((rawValue: string) => {
    const nextRepeatCount = parseRepeatCountInput(rawValue);
    if (nextRepeatCount === null) return;
    setRepeatCount(nextRepeatCount);
  }, []);

  return {
    repeatFrequency,
    setRepeatFrequency,
    repeatEnds,
    setRepeatEnds,
    repeatUntil,
    setRepeatUntil,
    repeatCount,
    setRepeatCount,
    repeatError,
    setRepeatError,
    repeatNotice,
    setRepeatNotice,
    repeatCreating,
    setRepeatCreating,
    repeatScopeOpen,
    setRepeatScopeOpen,
    pendingRepeatUpdate,
    setPendingRepeatUpdate,
    repeatInFlightRef,
    repeatUntilAutoRef,
    repeatConfigDirty,
    handleRepeatFrequencyChange,
    handleRepeatEndsChange,
    handleRepeatUntilChange,
    handleRepeatCountInputChange,
  };
};
