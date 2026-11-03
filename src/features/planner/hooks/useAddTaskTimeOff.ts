import React, { useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { clampTaskDates } from '@/features/planner/lib/dateUtils';
import { findTimeOffConflict, NO_TIME_OFF } from '@/features/planner/lib/timeOff';
import { resolveCurrentUserAssigneeId } from '@/features/planner/lib/timelineSelectors';

interface UseAddTaskTimeOffOptions {
  open: boolean;
  /** The dialog offers the time-off mode at all (the planner does). */
  timeOffEnabled: boolean;
  /** The time off was written: the dialog closes. */
  onSaved: () => void;
}

/**
 * The add-task dialog's second mode, "Mark time off": who, which days, a note,
 * and the check that the days are not marked already. Admins record days off
 * for anyone; everyone else only for themselves.
 */
export const useAddTaskTimeOff = ({ open, timeOffEnabled, onSaved }: UseAddTaskTimeOffOptions) => {
  const { assignees, timeOff, addTimeOff } = usePlannerStore(useShallow((state) => ({
    assignees: state.assignees,
    timeOff: state.timeOff ?? NO_TIME_OFF,
    addTimeOff: state.addTimeOff,
  })));
  const currentUser = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const [timeOffAssigneeId, setTimeOffAssigneeId] = useState('');
  // Own dates: sharing the task form's state let a time-off edit silently
  // rewrite the dates of the task draft the user had started.
  const [timeOffStart, setTimeOffStart] = useState('');
  const [timeOffEnd, setTimeOffEnd] = useState('');
  const [timeOffNote, setTimeOffNote] = useState('');
  const [timeOffError, setTimeOffError] = useState('');
  const [timeOffSaving, setTimeOffSaving] = useState(false);

  const myAssigneeId = useMemo(
    () => resolveCurrentUserAssigneeId(assignees, currentUser?.id),
    [assignees, currentUser?.id],
  );
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

    onSaved();
  };

  return {
    timeOffAssigneeId,
    setTimeOffAssigneeId,
    timeOffStart,
    setTimeOffStart,
    timeOffEnd,
    setTimeOffEnd,
    timeOffNote,
    setTimeOffNote,
    timeOffError,
    setTimeOffError,
    timeOffSaving,
    setTimeOffSaving,
    myAssigneeId,
    canPickTimeOffAssignee,
    timeOffAvailable,
    timeOffDatesFilled,
    timeOffConflict,
    handleSubmitTimeOff,
  };
};
