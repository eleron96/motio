import React, { useEffect, useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
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
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Milestone } from '@/features/planner/types/planner';
import { format, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';

interface MilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  milestone: Milestone | null;
  canEdit: boolean;
  allowDateEdit?: boolean;
}

export const MilestoneDialog: React.FC<MilestoneDialogProps> = ({
  open,
  onOpenChange,
  date,
  milestone,
  canEdit,
  allowDateEdit = false,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const { projects, trackedProjectIds, addMilestone, updateMilestone, deleteMilestone } = usePlannerStore();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');

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
  const formattedDate = useMemo(() => {
    if (!milestoneDate) return '';
    return format(parseISO(milestoneDate), 'd MMM yyyy', { locale: dateLocale });
  }, [milestoneDate, dateLocale]);

  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    if (milestone) {
      setTitle(milestone.title);
      setProjectId(milestone.projectId);
      setMilestoneDate(milestone.date);
      setHasChanges(false);
      return;
    }
    setTitle('');
    setProjectId(activeProjects[0]?.id ?? '');
    setMilestoneDate(date ?? format(new Date(), 'yyyy-MM-dd'));
    setHasChanges(false);
  }, [milestone, open, activeProjects, date]);

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

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? t`Edit milestone` : t`Create milestone`}</DialogTitle>
          <DialogDescription className="sr-only">
            {mode === 'edit'
              ? t`Update milestone details.`
              : t`Create a new milestone for the selected date.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {allowDateEdit ? (
            <div className="space-y-2">
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
          ) : (
            milestoneDate ? (
            <div className="text-sm text-muted-foreground">
              {t`Date`}: <span className="text-foreground font-medium">{formattedDate}</span>
            </div>
            ) : null
          )}
          <div className="space-y-2">
            <Label htmlFor="milestone-title">{t`Name`}</Label>
            <Input
              id="milestone-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setHasChanges(true);
              }}
              placeholder={t`Milestone name...`}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>{t`Project`}</Label>
            <Select
              value={projectId}
              onValueChange={(value) => {
                setProjectId(value);
                setHasChanges(true);
              }}
              disabled={!canEdit || !hasProjects}
            >
              <SelectTrigger>
                <SelectValue placeholder={hasProjects ? t`Select project` : t`No project`} />
              </SelectTrigger>
              <SelectContent>
                {projectOptions.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      {formatProjectLabel(project.name, project.code)}
                      {project.archived && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({t`Archived`})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {submitError && (
          <div className="text-sm text-destructive">{submitError}</div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={requestClose}>
            {t`Cancel`}
          </Button>
          {mode === 'edit' && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={!canEdit}
            >
              {t`Delete`}
            </Button>
          )}
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
