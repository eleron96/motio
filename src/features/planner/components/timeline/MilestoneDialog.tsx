import React, { useEffect, useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useShallow } from 'zustand/react/shallow';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
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
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { useAuthStore } from '@/features/auth/store/authStore';
import { isWorkloadHeatmapEnabled } from '@/shared/lib/featureFlags';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { MoreVertical, Trash2 } from 'lucide-react';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { TaskProjectSelect } from '@/features/planner/components/TaskProjectSelect';
import { Milestone } from '@/features/planner/types/planner';
import { format } from 'date-fns';
import { t } from '@lingui/macro';

interface MilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  milestone: Milestone | null;
  canEdit: boolean;
  /**
   * Phase 7: pre-selects the project on create (e.g. when adding a milestone
   * straight from a project's card). Ignored when editing an existing one.
   */
  defaultProjectId?: string | null;
}

export const MilestoneDialog: React.FC<MilestoneDialogProps> = ({
  open,
  onOpenChange,
  date,
  milestone,
  canEdit,
  defaultProjectId = null,
}) => {
  const { projects, trackedProjectIds, addMilestone, updateMilestone, deleteMilestone } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    trackedProjectIds: state.trackedProjectIds,
    addMilestone: state.addMilestone,
    updateMilestone: state.updateMilestone,
    deleteMilestone: state.deleteMilestone,
  })));
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const [note, setNote] = useState('');
  const [includeInWorkload, setIncludeInWorkload] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // The "counts toward workload" checkbox only makes sense where the workload
  // heatmap is actually in use — hide it everywhere else (the value still saves
  // its default of true regardless).
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const workspaces = useAuthStore((state) => state.workspaces);
  const heatmapAvailable = useMemo(
    () => isWorkloadHeatmapEnabled()
      && Boolean(workspaces.find((workspace) => workspace.id === currentWorkspaceId)?.heatmapEnabled),
    [workspaces, currentWorkspaceId],
  );

  const mode = milestone ? 'edit' : 'create';
  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => !project.archived),
      trackedProjectIds,
    ),
    [projects, trackedProjectIds],
  );
  const currentProject = useMemo(
    () => projects.find((project) => project.id === milestone?.projectId),
    [projects, milestone?.projectId],
  );
  const archivedProject = currentProject?.archived ? currentProject : null;
  const projectOptions = useMemo(() => {
    if (!archivedProject) return activeProjects;
    return [archivedProject, ...activeProjects.filter((project) => project.id !== archivedProject.id)];
  }, [activeProjects, archivedProject]);
  const hasProjects = activeProjects.length > 0 || Boolean(archivedProject);

  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    if (milestone) {
      setTitle(milestone.title);
      setProjectId(milestone.projectId);
      setMilestoneDate(milestone.date);
      setNote(milestone.note ?? '');
      setIncludeInWorkload(milestone.includeInWorkload);
      setHasChanges(false);
      return;
    }
    setTitle('');
    setProjectId(defaultProjectId ?? activeProjects[0]?.id ?? '');
    setMilestoneDate(date ?? format(new Date(), 'yyyy-MM-dd'));
    setNote('');
    setIncludeInWorkload(true);
    setHasChanges(false);
  }, [milestone, open, activeProjects, date, defaultProjectId]);

  const requestClose = () => {
    if (!hasChanges) {
      onOpenChange(false);
      return;
    }
    setConfirmCloseOpen(true);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      requestClose();
      return;
    }
    onOpenChange(true);
  };

  const handleSave = async () => {
    if (!canEdit || !milestoneDate || !projectId || !title.trim()) return;
    setSubmitError('');
    const payload = {
      title: title.trim(),
      projectId,
      date: milestoneDate,
      note: note.trim() ? note.trim() : null,
      // Milestone status is always derived from the date — no manual override.
      statusOverride: null,
      includeInWorkload,
    };
    if (milestone) {
      const result = await updateMilestone(milestone.id, payload);
      if (result?.error) {
        setSubmitError(result.error);
        return;
      }
    } else {
      const result = await addMilestone(payload);
      if (result?.error) {
        setSubmitError(result.error);
        return;
      }
    }
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!canEdit || !milestone) return;
    setSubmitError('');
    const result = await deleteMilestone(milestone.id);
    if (result?.error) {
      setSubmitError(result.error);
      return;
    }
    setHasChanges(false);
    onOpenChange(false);
  };

  const titleInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        // grid-cols-[minmax(0,1fr)]: the dialog is a CSS grid, whose implicit
        // column is min-content by default — a long project name in the select
        // would widen that column past the fixed dialog width and clip the footer.
        // Clamping the column to min 0 keeps children (and the layout) inside.
        className="grid-cols-[minmax(0,1fr)] gap-3 sm:max-w-[420px]"
        onOpenAutoFocus={(event) => {
          // On create, focus the Name field so the user can type immediately.
          // Edit keeps the no-autofocus behaviour (no loud ring on open).
          event.preventDefault();
          if (mode === 'create') titleInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? t`Edit milestone` : t`Create milestone`}</DialogTitle>
          <DialogDescription className="sr-only">
            {mode === 'edit'
              ? t`Update milestone details.`
              : t`Create a new milestone for the selected date.`}
          </DialogDescription>
        </DialogHeader>

        {mode === 'edit' && canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-10 top-2.5 h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label={t`More actions`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t`Delete milestone`}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="mt-1 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="milestone-date">{t`Date`}</Label>
            <Input
              id="milestone-date"
              type="date"
              value={milestoneDate}
              onChange={(event) => {
                setMilestoneDate(event.target.value);
                setHasChanges(true);
              }}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="milestone-title">{t`Name`}</Label>
            <Input
              id="milestone-title"
              ref={titleInputRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setHasChanges(true);
              }}
              placeholder={t`Milestone name...`}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t`Project`}</Label>
            <TaskProjectSelect
              value={projectId}
              projects={projectOptions}
              noProjectDisabled
              showArchivedBadge
              disabled={!canEdit || !hasProjects}
              onValueChange={(value) => {
                setProjectId(value);
                setHasChanges(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="milestone-note">{t`Note`}</Label>
            <Textarea
              id="milestone-note"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setHasChanges(true);
              }}
              placeholder={t`E.g. Передано заказчику`}
              rows={2}
              disabled={!canEdit}
            />
          </div>
          {heatmapAvailable && (
            <div className="flex items-start gap-2.5 pt-0.5">
              <Checkbox
                id="milestone-include-in-workload"
                checked={includeInWorkload}
                onCheckedChange={(checked) => {
                  setIncludeInWorkload(checked === true);
                  setHasChanges(true);
                }}
                disabled={!canEdit}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="milestone-include-in-workload" className="leading-snug">
                  {t`Counts toward department workload`}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t`Adds this delivery to the workload heatmap. Untick for milestones that don't occupy the team.`}
                </p>
              </div>
            </div>
          )}
        </div>

        {submitError && (
          <div className="text-sm text-destructive">{submitError}</div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={requestClose}>
            {t`Cancel`}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canEdit || !title.trim() || !projectId || !milestoneDate}
          >
            {mode === 'edit' ? t`Save` : t`Create`}
          </Button>
        </DialogFooter>
        <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t`Unsaved changes`}</AlertDialogTitle>
              <AlertDialogDescription>
                {t`You have unsaved milestone changes. Close without saving?`}
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
