import React from 'react';
import { t } from '@lingui/macro';
import { AccountSettingsDialog } from '@/features/auth/components/AccountSettingsDialog';
import { TaskDetailsDialog } from '@/features/members/components/TaskDetailsDialog';
import { SettingsPanel } from '@/features/workspace/components/SettingsPanel';
import { Assignee, Project, Status, Tag, Task, TaskType } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

type MembersDialogsProps = {
  creatingGroup: boolean;
  setCreatingGroup: (open: boolean) => void;
  newGroupName: string;
  setNewGroupName: (value: string) => void;
  isAdmin: boolean;
  groupActionLoading: boolean;
  groupsError: string;
  handleCreateGroup: () => Promise<void>;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  selectedTask: Task | null;
  selectedTaskProject: Project | null;
  statusById: Map<string, Status>;
  assigneeById: Map<string, Assignee>;
  taskTypeById: Map<string, TaskType>;
  selectedTaskTags: Tag[];
  selectedTaskDescription: string;
  handleOpenTaskInTimeline: () => void;
  showSettings: boolean;
  setShowSettings: (open: boolean) => void;
  showAccountSettings: boolean;
  setShowAccountSettings: (open: boolean) => void;
};

export const MembersDialogs = ({
  creatingGroup,
  setCreatingGroup,
  newGroupName,
  setNewGroupName,
  isAdmin,
  groupActionLoading,
  groupsError,
  handleCreateGroup,
  selectedTaskId,
  setSelectedTaskId,
  selectedTask,
  selectedTaskProject,
  statusById,
  assigneeById,
  taskTypeById,
  selectedTaskTags,
  selectedTaskDescription,
  handleOpenTaskInTimeline,
  showSettings,
  setShowSettings,
  showAccountSettings,
  setShowAccountSettings,
}: MembersDialogsProps) => {
  return (
    <>
      <Dialog
        open={creatingGroup}
        onOpenChange={(open) => {
          setCreatingGroup(open);
          if (!open) {
            setNewGroupName('');
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t`New group`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Create a new group for workspace members.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateGroup();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>{t`Group name`}</Label>
              <Input
                placeholder={t`Group name`}
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                disabled={!isAdmin || groupActionLoading}
              />
            </div>
            {groupsError && (
              <div className="text-sm text-destructive">{groupsError}</div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreatingGroup(false)}
                disabled={groupActionLoading}
              >
                {t`Cancel`}
              </Button>
              <Button
                type="submit"
                disabled={!isAdmin || groupActionLoading || !newGroupName.trim()}
              >
                {t`Create`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TaskDetailsDialog
        open={Boolean(selectedTaskId)}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        selectedTask={selectedTask}
        selectedTaskProject={selectedTaskProject}
        statusById={statusById}
        assigneeById={assigneeById}
        taskTypeById={taskTypeById}
        selectedTaskTags={selectedTaskTags}
        selectedTaskDescription={selectedTaskDescription}
        onOpenTaskInTimeline={handleOpenTaskInTimeline}
        onClose={() => setSelectedTaskId(null)}
      />

      <SettingsPanel open={showSettings} onOpenChange={setShowSettings} />
      <AccountSettingsDialog open={showAccountSettings} onOpenChange={setShowAccountSettings} />
    </>
  );
};
