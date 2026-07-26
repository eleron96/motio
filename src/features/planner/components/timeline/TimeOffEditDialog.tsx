import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useShallow } from 'zustand/react/shallow';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { TimeOffFields } from '@/features/planner/components/TimeOffFields';
import { findTimeOffConflict, NO_TIME_OFF } from '@/features/planner/lib/timeOff';
import { clampTaskDates } from '@/features/planner/lib/dateUtils';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Trash2 } from 'lucide-react';

interface TimeOffEditDialogProps {
  /** Record being edited; null closes the dialog. */
  recordId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit or delete a time-off record. Opened by clicking its bar on the timeline,
 * so it works on touch devices too (where the row context menu is disabled).
 */
export const TimeOffEditDialog: React.FC<TimeOffEditDialogProps> = ({
  recordId,
  onOpenChange,
}) => {
  const { timeOff, assignees, updateTimeOff, deleteTimeOff } = usePlannerStore(useShallow((state) => ({
    timeOff: state.timeOff ?? NO_TIME_OFF,
    assignees: state.assignees,
    updateTimeOff: state.updateTimeOff,
    deleteTimeOff: state.deleteTimeOff,
  })));
  const filteredAssignees = useFilteredAssignees(assignees);
  const selectableAssignees = useMemo(
    () => filteredAssignees.filter((assignee) => assignee.isActive),
    [filteredAssignees],
  );

  const record = useMemo(
    () => timeOff.find((item) => item.id === recordId) ?? null,
    [recordId, timeOff],
  );

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed once per record id, NOT on every `record` identity change: the live
  // sync replaces the whole time_off array on any workspace event, and keying
  // this on the object would wipe what the user is typing.
  const seededIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!record) {
      seededIdRef.current = null;
      return;
    }
    if (seededIdRef.current === record.id) return;
    seededIdRef.current = record.id;
    setStartDate(record.startDate);
    setEndDate(record.endDate);
    setNote(record.note ?? '');
    setError('');
    setSaving(false);
  }, [record]);

  const siblings = useMemo(
    () => (record ? timeOff.filter((item) => item.assigneeId === record.assigneeId) : []),
    [record, timeOff],
  );
  const conflict = useMemo(
    () => (record ? findTimeOffConflict({ id: record.id, startDate, endDate }, siblings) : null),
    [endDate, record, siblings, startDate],
  );

  const handleSave = async () => {
    if (!record || saving) return;
    const safeDates = clampTaskDates(startDate, endDate);
    if (findTimeOffConflict({ id: record.id, ...safeDates }, siblings)) {
      setError(t`These days are already marked as time off.`);
      return;
    }

    setSaving(true);
    const result = await updateTimeOff(record.id, {
      startDate: safeDates.startDate,
      endDate: safeDates.endDate,
      note: note.trim() || null,
    });
    setSaving(false);

    if (result.error) {
      if (result.code === 'overlap') setError(t`These days are already marked as time off.`);
      else if (result.code === 'invalidRange') setError(t`The end date cannot be earlier than the start date.`);
      else setError(t`Failed to save the time off.`);
      return;
    }
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!record || saving) return;
    setSaving(true);
    const result = await deleteTimeOff(record.id);
    setSaving(false);
    if (result.error) {
      setError(t`Failed to delete the time off.`);
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        // Radix autofocus would draw an ink ring around the first field on open.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t`Mark time off`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Change the days or remove the time off.`}
          </DialogDescription>
        </DialogHeader>

        {record && (
          <TimeOffFields
            idPrefix="edit-time-off"
            assignees={selectableAssignees}
            assigneeId={record.assigneeId}
            onAssigneeChange={() => {
              // Moving a record to another person is out of scope: delete and
              // create instead. The select stays read-only here.
            }}
            canPickAssignee={false}
            startDate={startDate}
            endDate={endDate}
            note={note}
            onStartDateChange={(value) => {
              setError('');
              setStartDate(value);
              setEndDate((previous) => clampTaskDates(value, previous).endDate);
            }}
            onEndDateChange={(value) => {
              setError('');
              setEndDate(clampTaskDates(startDate, value).endDate);
            }}
            onNoteChange={(value) => {
              setError('');
              setNote(value);
            }}
            conflictMessage={error || (conflict ? t`These days are already marked as time off.` : null)}
          />
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={saving}
            onClick={handleDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t`Delete`}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t`Cancel`}
            </Button>
            <Button type="button" disabled={saving || Boolean(conflict)} onClick={handleSave}>
              {t`Save`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
