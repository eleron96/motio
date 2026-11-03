import React, { Suspense } from 'react';
import { lazyNamed } from '@/shared/lib/lazyComponent';
import { ComposerEyebrow } from '@/features/planner/components/ComposerEyebrow';
import { AddTaskParameters } from '@/features/planner/components/AddTaskParameters';
import { AddTaskSubtasksField } from '@/features/planner/components/AddTaskSubtasksField';
import { TimeOffFields } from '@/features/planner/components/TimeOffFields';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
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
import { Plus } from 'lucide-react';
import { clampTaskDates } from '@/features/planner/lib/dateUtils';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobileFormScreen } from '@/shared/ui/mobile-form-screen';
import { useAddTaskForm } from '@/features/planner/hooks/useAddTaskForm';
import { t } from '@lingui/macro';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStartDate?: string;
  initialEndDate?: string;
  initialProjectId?: string | null;
  initialAssigneeIds?: string[];
  /** Status to start with (the board's "Add task" of a column); falls back to the default. */
  initialStatusId?: string;
  /** Lock the project field to the initial value (used on the Projects tab). */
  lockProject?: boolean;
  /** Planner only: offer the second mode, "Отметить выходной". */
  timeOffEnabled?: boolean;
  /** Open straight in time-off mode and hide the task tab (viewers cannot create tasks). */
  timeOffOnly?: boolean;
  /** Called after a task is successfully created (e.g. to refetch a list). */
  onCreated?: () => void;
}

const LazyRichTextEditor = lazyNamed(
  () => import('@/features/planner/components/RichTextEditor'),
  'RichTextEditor'
);

/** The mobile footer sits outside the <form>, so its submit button targets it by id. */
const MOBILE_FORM_ID = 'add-task-mobile-form';

export const AddTaskDialog: React.FC<AddTaskDialogProps> = ({
  open,
  onOpenChange,
  initialStartDate,
  initialEndDate,
  initialProjectId,
  initialAssigneeIds,
  initialStatusId,
  lockProject = false,
  timeOffEnabled = false,
  timeOffOnly = false,
  onCreated,
}) => {
  const isMobile = useIsMobile();
  const form = useAddTaskForm({
    open,
    onOpenChange,
    initialStartDate,
    initialEndDate,
    initialProjectId,
    initialAssigneeIds,
    initialStatusId,
    timeOffEnabled,
    timeOffOnly,
    onCreated,
  });
  const {
    currentWorkspaceId,
    selectableAssignees,
    title,
    setTitle,
    statusId,
    typeId,
    description,
    setDescription,
    repeatCreating,
    confirmCloseOpen,
    setConfirmCloseOpen,
    mode,
    setMode,
    waitingForImages,
    titleInputRef,
    markChanged,
    draftSubtasks,
    timeOffMode,
    requestClose,
    handleDialogOpenChange,
    discardAndClose,
    handleSubmit,
  } = form;
  const {
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
    canPickTimeOffAssignee,
    timeOffAvailable,
    timeOffDatesFilled,
    timeOffConflict,
    handleSubmitTimeOff,
  } = timeOffMode;

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

          <AddTaskSubtasksField draftSubtasks={draftSubtasks} markChanged={markChanged} />
        </div>

        {/* ── Right column: parameters panel */}
        <AddTaskParameters form={form} isMobile={isMobile} lockProject={lockProject} />
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
      {waitingForImages ? t`Uploading images…` : t`Create task`}
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
            onClick={discardAndClose}
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
