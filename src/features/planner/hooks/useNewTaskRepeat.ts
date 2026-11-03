import { useCallback, useRef, useState } from 'react';
import {
  getAutoRepeatUntilOnEndsChange,
  getAutoRepeatUntilOnFrequencyChange,
  getDefaultRepeatUntil,
  parseRepeatCountInput,
  RepeatEnds,
  RepeatFrequency,
  shouldAutoSyncRepeatUntil,
} from '@/features/planner/lib/taskFormRules';

interface UseNewTaskRepeatOptions {
  /** The start date the dialog opened with: the first end date follows it. */
  initialStart: string;
  startDate: string;
  markChanged: () => void;
}

/**
 * The repeat of a task being created. Until the person picks an end date
 * themselves, it follows the start date.
 */
export const useNewTaskRepeat = ({ initialStart, startDate, markChanged }: UseNewTaskRepeatOptions) => {
  const repeatUntilAutoRef = useRef(true);
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('none');
  const [repeatEnds, setRepeatEnds] = useState<RepeatEnds>('never');
  const [repeatUntil, setRepeatUntil] = useState(getDefaultRepeatUntil(initialStart));
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatError, setRepeatError] = useState('');

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

  /** The start date moved: an end date the person never set follows it. */
  const followStartDate = (value: string) => {
    if (!shouldAutoSyncRepeatUntil({
      frequency: repeatFrequency,
      ends: repeatEnds,
      auto: repeatUntilAutoRef.current,
    })) return;
    setRepeatUntil(getDefaultRepeatUntil(value));
  };

  /** Back to "does not repeat", the end date following `baseDate` again. */
  const resetRepeat = useCallback((baseDate: string) => {
    setRepeatFrequency('none');
    setRepeatEnds('never');
    repeatUntilAutoRef.current = true;
    setRepeatUntil(getDefaultRepeatUntil(baseDate));
    setRepeatCount(4);
    setRepeatError('');
  }, []);

  return {
    repeatFrequency,
    repeatEnds,
    repeatUntil,
    repeatCount,
    repeatError,
    setRepeatError,
    handleRepeatFrequencyChange,
    handleRepeatEndsChange,
    handleRepeatUntilChange,
    handleRepeatCountInputChange,
    followStartDate,
    resetRepeat,
  };
};
