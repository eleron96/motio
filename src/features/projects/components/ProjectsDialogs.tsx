import React from 'react';
import { t } from '@lingui/macro';
import { AccountSettingsDialog } from '@/features/auth/components/AccountSettingsDialog';
import { MilestoneDialog } from '@/features/planner/components/timeline/MilestoneDialog';
import {
  Assignee,
  Customer,
  Milestone,
  Project,
  Status,
  Tag,
  Task,
  TaskType,
} from '@/features/planner/types/planner';
import { SettingsPanel } from '@/features/workspace/components/SettingsPanel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { ColorPicker } from '@/shared/ui/color-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { CustomerCombobox } from '@/features/projects/components/CustomerCombobox';
import { ProjectTaskDetailsDialog } from '@/features/projects/components/ProjectTaskDetailsDialog';

type ProjectsDialogsProps = {
  canEdit: boolean;
  showSettings: boolean;
  setShowSettings: (open: boolean) => void;
  showAccountSettings: boolean;
  setShowAccountSettings: (open: boolean) => void;
  createCustomerOpen: boolean;
  setCreateCustomerOpen: (open: boolean) => void;
  newCustomerName: string;
  setNewCustomerName: (value: string) => void;
  handleAddCustomerFromTab: () => Promise<void>;
  renameCustomerOpen: boolean;
  setRenameCustomerOpen: (open: boolean) => void;
  requestCloseRenameCustomer: () => void;
  editingCustomerName: string;
  setEditingCustomerName: (value: string) => void;
  handleRenameCustomer: () => Promise<void>;
  renameCustomerConfirmOpen: boolean;
  setRenameCustomerConfirmOpen: (open: boolean) => void;
  cancelCustomerEdit: () => void;
  createProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;
  requestCloseCreateProject: () => void;
  newProjectName: string;
  setNewProjectName: (value: string) => void;
  newProjectCode: string;
  setNewProjectCode: (value: string) => void;
  newProjectColor: string;
  setNewProjectColor: (value: string) => void;
  newProjectCustomerId: string | null;
  setNewProjectCustomerId: (customerId: string | null) => void;
  handleCreateProject: () => Promise<void>;
  createProjectConfirmOpen: boolean;
  setCreateProjectConfirmOpen: (open: boolean) => void;
  customers: Customer[];
  createCustomerByName: (name: string) => Promise<Customer | null>;
  projectSettingsOpen: boolean;
  setProjectSettingsOpen: (open: boolean) => void;
  requestCloseProjectSettings: () => void;
  projectSettingsTarget: Project | null;
  projectSettingsName: string;
  setProjectSettingsName: (value: string) => void;
  projectSettingsCode: string;
  setProjectSettingsCode: (value: string) => void;
  projectSettingsColor: string;
  setProjectSettingsColor: (value: string) => void;
  projectSettingsCustomerId: string | null;
  setProjectSettingsCustomerId: (customerId: string | null) => void;
  handleSaveProjectSettings: () => Promise<void>;
  projectSettingsConfirmOpen: boolean;
  setProjectSettingsConfirmOpen: (open: boolean) => void;
  milestoneDialogOpen: boolean;
  handleMilestoneDialogOpenChange: (open: boolean) => void;
  milestoneDialogDate: string | null;
  editingMilestone: Milestone | null;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  selectedTask: Task | null;
  selectedTaskProject: Project | null;
  selectedTaskCustomer: Customer | null;
  statusById: Map<string, Status>;
  assigneeById: Map<string, Assignee>;
  taskTypeById: Map<string, TaskType>;
  selectedTaskTags: Tag[];
  selectedTaskDescription: string;
  handleOpenTaskInTimeline: () => void;
  deleteProjectOpen: boolean;
  setDeleteProjectOpen: (open: boolean) => void;
  deleteProjectLabel: string;
  setDeleteProjectTarget: (project: Project | null) => void;
  handleConfirmDeleteProject: () => Promise<void>;
  deleteMilestoneOpen: boolean;
  setDeleteMilestoneOpen: (open: boolean) => void;
  deleteMilestoneLabel: string;
  setDeleteMilestoneTarget: (milestone: Milestone | null) => void;
  handleConfirmDeleteMilestone: () => Promise<void>;
  deleteCustomerOpen: boolean;
  setDeleteCustomerOpen: (open: boolean) => void;
  deleteCustomerLabel: string;
  setDeleteCustomerTarget: (customer: Customer | null) => void;
  handleConfirmDeleteCustomer: () => Promise<void>;
};

export const ProjectsDialogs = ({
  canEdit,
  showSettings,
  setShowSettings,
  showAccountSettings,
  setShowAccountSettings,
  createCustomerOpen,
  setCreateCustomerOpen,
  newCustomerName,
  setNewCustomerName,
  handleAddCustomerFromTab,
  renameCustomerOpen,
  setRenameCustomerOpen,
  requestCloseRenameCustomer,
  editingCustomerName,
  setEditingCustomerName,
  handleRenameCustomer,
  renameCustomerConfirmOpen,
  setRenameCustomerConfirmOpen,
  cancelCustomerEdit,
  createProjectOpen,
  setCreateProjectOpen,
  requestCloseCreateProject,
  newProjectName,
  setNewProjectName,
  newProjectCode,
  setNewProjectCode,
  newProjectColor,
  setNewProjectColor,
  newProjectCustomerId,
  setNewProjectCustomerId,
  handleCreateProject,
  createProjectConfirmOpen,
  setCreateProjectConfirmOpen,
  customers,
  createCustomerByName,
  projectSettingsOpen,
  setProjectSettingsOpen,
  requestCloseProjectSettings,
  projectSettingsTarget,
  projectSettingsName,
  setProjectSettingsName,
  projectSettingsCode,
  setProjectSettingsCode,
  projectSettingsColor,
  setProjectSettingsColor,
  projectSettingsCustomerId,
  setProjectSettingsCustomerId,
  handleSaveProjectSettings,
  projectSettingsConfirmOpen,
  setProjectSettingsConfirmOpen,
  milestoneDialogOpen,
  handleMilestoneDialogOpenChange,
  milestoneDialogDate,
  editingMilestone,
  selectedTaskId,
  setSelectedTaskId,
  selectedTask,
  selectedTaskProject,
  selectedTaskCustomer,
  statusById,
  assigneeById,
  taskTypeById,
  selectedTaskTags,
  selectedTaskDescription,
  handleOpenTaskInTimeline,
  deleteProjectOpen,
  setDeleteProjectOpen,
  deleteProjectLabel,
  setDeleteProjectTarget,
  handleConfirmDeleteProject,
  deleteMilestoneOpen,
  setDeleteMilestoneOpen,
  deleteMilestoneLabel,
  setDeleteMilestoneTarget,
  handleConfirmDeleteMilestone,
  deleteCustomerOpen,
  setDeleteCustomerOpen,
  deleteCustomerLabel,
  setDeleteCustomerTarget,
  handleConfirmDeleteCustomer,
}: ProjectsDialogsProps) => {
  return (
    <>
      <SettingsPanel open={showSettings} onOpenChange={setShowSettings} />
      <AccountSettingsDialog open={showAccountSettings} onOpenChange={setShowAccountSettings} />

      <Dialog
        open={createCustomerOpen}
        onOpenChange={(open) => {
          setCreateCustomerOpen(open);
          if (!open) {
            setNewCustomerName('');
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t`New customer`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Create a new customer for grouping projects.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddCustomerFromTab();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>{t`Customer name`}</Label>
              <Input
                placeholder={t`Enter customer name...`}
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
                disabled={!canEdit}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateCustomerOpen(false)}
              >
                {t`Cancel`}
              </Button>
              <Button type="submit" disabled={!canEdit || !newCustomerName.trim()}>
                {t`Create`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameCustomerOpen}
        onOpenChange={(open) => {
          if (open) {
            setRenameCustomerOpen(true);
            return;
          }
          requestCloseRenameCustomer();
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t`Rename customer`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Update customer name.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameCustomer();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>{t`Customer name`}</Label>
              <Input
                placeholder={t`Enter customer name...`}
                value={editingCustomerName}
                onChange={(event) => setEditingCustomerName(event.target.value)}
                disabled={!canEdit}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={requestCloseRenameCustomer}
              >
                {t`Cancel`}
              </Button>
              <Button type="submit" disabled={!canEdit || !editingCustomerName.trim()}>
                {t`Save`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={renameCustomerConfirmOpen} onOpenChange={setRenameCustomerConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Unsaved changes`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`You have unsaved changes. Close without saving?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep editing`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setRenameCustomerConfirmOpen(false);
                setRenameCustomerOpen(false);
                cancelCustomerEdit();
              }}
            >
              {t`Discard`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={createProjectOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateProjectOpen(true);
            return;
          }
          requestCloseCreateProject();
        }}
      >
        <DialogContent className="w-[95vw] max-w-xl">
          <DialogHeader>
            <DialogTitle>{t`New project`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Create a new project and assign customer, code, and color.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
              <div className="space-y-1">
                <Label>{t`Project name`}</Label>
                <Input
                  placeholder={t`Enter project name...`}
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void handleCreateProject()}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1">
                <Label>{t`Code`}</Label>
                <Input
                  placeholder={t`Code`}
                  value={newProjectCode}
                  onChange={(event) => setNewProjectCode(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void handleCreateProject()}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1">
                <Label>{t`Color`}</Label>
                <div className="flex items-center">
                  <ColorPicker value={newProjectColor} onChange={setNewProjectColor} disabled={!canEdit} />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t`Customer`}</Label>
              <CustomerCombobox
                value={newProjectCustomerId}
                customers={customers}
                onChange={setNewProjectCustomerId}
                onCreateCustomer={createCustomerByName}
                disabled={!canEdit}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={requestCloseCreateProject}>
                {t`Cancel`}
              </Button>
              <Button onClick={() => void handleCreateProject()} disabled={!canEdit || !newProjectName.trim()}>
                {t`Create project`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={createProjectConfirmOpen} onOpenChange={setCreateProjectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Unsaved changes`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`You have unsaved changes. Close without saving?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep editing`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCreateProjectConfirmOpen(false);
                setCreateProjectOpen(false);
              }}
            >
              {t`Discard`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={projectSettingsOpen}
        onOpenChange={(open) => {
          if (open) {
            setProjectSettingsOpen(true);
            return;
          }
          requestCloseProjectSettings();
        }}
      >
        <DialogContent className="w-[95vw] max-w-xl">
          <DialogHeader>
            <DialogTitle>{t`Edit project`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Edit project details such as name, code, customer, and color.`}
            </DialogDescription>
          </DialogHeader>
          {!projectSettingsTarget && (
            <div className="text-sm text-muted-foreground">{t`Project not found.`}</div>
          )}
          {projectSettingsTarget && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                <div className="space-y-1">
                  <Label>{t`Project name`}</Label>
                  <Input
                    placeholder={t`Enter project name...`}
                    value={projectSettingsName}
                    onChange={(event) => setProjectSettingsName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSaveProjectSettings();
                      }
                    }}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t`Code`}</Label>
                  <Input
                    placeholder={t`Code`}
                    value={projectSettingsCode}
                    onChange={(event) => setProjectSettingsCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSaveProjectSettings();
                      }
                    }}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t`Color`}</Label>
                  <div className="flex items-center">
                    <ColorPicker value={projectSettingsColor} onChange={setProjectSettingsColor} disabled={!canEdit} />
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t`Customer`}</Label>
                <CustomerCombobox
                  value={projectSettingsCustomerId}
                  customers={customers}
                  onChange={setProjectSettingsCustomerId}
                  onCreateCustomer={createCustomerByName}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={requestCloseProjectSettings}>
                  {t`Cancel`}
                </Button>
                <Button
                  onClick={() => void handleSaveProjectSettings()}
                  disabled={!canEdit || !projectSettingsName.trim()}
                >
                  {t`Save`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={projectSettingsConfirmOpen} onOpenChange={setProjectSettingsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Unsaved changes`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`You have unsaved changes. Close without saving?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep editing`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setProjectSettingsConfirmOpen(false);
                setProjectSettingsOpen(false);
              }}
            >
              {t`Discard`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MilestoneDialog
        open={milestoneDialogOpen}
        onOpenChange={handleMilestoneDialogOpenChange}
        date={milestoneDialogDate}
        milestone={editingMilestone}
        canEdit={canEdit}
        allowDateEdit
      />

      <ProjectTaskDetailsDialog
        open={Boolean(selectedTaskId)}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        selectedTask={selectedTask}
        selectedTaskProject={selectedTaskProject}
        selectedTaskCustomer={selectedTaskCustomer}
        statusById={statusById}
        assigneeById={assigneeById}
        taskTypeById={taskTypeById}
        selectedTaskTags={selectedTaskTags}
        selectedTaskDescription={selectedTaskDescription}
        onGoToTask={handleOpenTaskInTimeline}
        onClose={() => setSelectedTaskId(null)}
      />

      <AlertDialog
        open={deleteProjectOpen}
        onOpenChange={(open) => {
          setDeleteProjectOpen(open);
          if (!open) {
            setDeleteProjectTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete project?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This will remove "${deleteProjectLabel}". Tasks will remain, but the project will be cleared from them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteProjectTarget(null)}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDeleteProject()}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteMilestoneOpen}
        onOpenChange={(open) => {
          setDeleteMilestoneOpen(open);
          if (!open) {
            setDeleteMilestoneTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete milestone?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This will remove "${deleteMilestoneLabel}" from the project timeline.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteMilestoneTarget(null)}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDeleteMilestone()}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteCustomerOpen}
        onOpenChange={(open) => {
          setDeleteCustomerOpen(open);
          if (!open) {
            setDeleteCustomerTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete customer?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This will remove "${deleteCustomerLabel}". Projects will remain, but the customer will be cleared from them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteCustomerTarget(null)}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDeleteCustomer()}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
