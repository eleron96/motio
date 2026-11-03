import React from 'react';
import { t } from '@lingui/macro';
import { MilestoneDialog } from '@/features/planner/components/timeline/MilestoneDialog';
import {
  Assignee,
  Customer,
  MemberGroup,
  Milestone,
  Project,
  Status,
  Tag,
  Task,
  TaskType,
} from '@/features/planner/types/planner';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import { WorkspaceCommonDialogs } from '@/features/workspace/components/WorkspaceCommonDialogs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/ui/alert-dialog';
import { ProjectTaskDetailsDialog } from '@/features/projects/components/ProjectTaskDetailsDialog';
import { CustomerFormDialogs } from '@/features/projects/components/CustomerFormDialogs';
import { ProjectFormDialogs } from '@/features/projects/components/ProjectFormDialogs';

export type ProjectsDialogsProps = {
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
  editingCustomerIndustry: string;
  setEditingCustomerIndustry: (value: string) => void;
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
  newProjectOwnerGroupId: string | null;
  setNewProjectStatus: (value: string) => void;
  newProjectStatus: string;
  setNewProjectOwnerGroupId: (groupId: string | null) => void;
  memberGroups: MemberGroup[];
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
  projectSettingsOwnerGroupId: string | null;
  setProjectSettingsOwnerGroupId: (groupId: string | null) => void;
  projectSettingsStatus: string;
  setProjectSettingsStatus: (value: string) => void;
  handleSaveProjectSettings: () => Promise<void>;
  projectSettingsConfirmOpen: boolean;
  setProjectSettingsConfirmOpen: (open: boolean) => void;
  milestoneDialogOpen: boolean;
  handleMilestoneDialogOpenChange: (open: boolean) => void;
  milestoneDialogDate: string | null;
  milestoneDialogDefaultProjectId: string | null;
  editingMilestone: Milestone | null;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  selectedTask: Task | null;
  selectedTaskProject: Project | null;
  selectedTaskCustomer: Customer | null;
  selectedTaskRepeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
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
  editingCustomerIndustry,
  setEditingCustomerIndustry,
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
  newProjectOwnerGroupId,
  setNewProjectOwnerGroupId,
  newProjectStatus,
  setNewProjectStatus,
  memberGroups,
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
  projectSettingsOwnerGroupId,
  setProjectSettingsOwnerGroupId,
  projectSettingsStatus,
  setProjectSettingsStatus,
  handleSaveProjectSettings,
  projectSettingsConfirmOpen,
  setProjectSettingsConfirmOpen,
  milestoneDialogOpen,
  handleMilestoneDialogOpenChange,
  milestoneDialogDate,
  milestoneDialogDefaultProjectId,
  editingMilestone,
  selectedTaskId,
  setSelectedTaskId,
  selectedTask,
  selectedTaskProject,
  selectedTaskCustomer,
  selectedTaskRepeatMeta,
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
      <WorkspaceCommonDialogs
        showSettings={showSettings}
        onShowSettingsChange={setShowSettings}
        showAccountSettings={showAccountSettings}
        onShowAccountSettingsChange={setShowAccountSettings}
      />

      <CustomerFormDialogs
        canEdit={canEdit}
        createCustomerOpen={createCustomerOpen}
        setCreateCustomerOpen={setCreateCustomerOpen}
        newCustomerName={newCustomerName}
        setNewCustomerName={setNewCustomerName}
        handleAddCustomerFromTab={handleAddCustomerFromTab}
        renameCustomerOpen={renameCustomerOpen}
        setRenameCustomerOpen={setRenameCustomerOpen}
        requestCloseRenameCustomer={requestCloseRenameCustomer}
        editingCustomerName={editingCustomerName}
        setEditingCustomerName={setEditingCustomerName}
        editingCustomerIndustry={editingCustomerIndustry}
        setEditingCustomerIndustry={setEditingCustomerIndustry}
        handleRenameCustomer={handleRenameCustomer}
        renameCustomerConfirmOpen={renameCustomerConfirmOpen}
        setRenameCustomerConfirmOpen={setRenameCustomerConfirmOpen}
        cancelCustomerEdit={cancelCustomerEdit}
      />

      <ProjectFormDialogs
        canEdit={canEdit}
        createProjectOpen={createProjectOpen}
        setCreateProjectOpen={setCreateProjectOpen}
        requestCloseCreateProject={requestCloseCreateProject}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        newProjectCode={newProjectCode}
        setNewProjectCode={setNewProjectCode}
        newProjectColor={newProjectColor}
        setNewProjectColor={setNewProjectColor}
        newProjectCustomerId={newProjectCustomerId}
        setNewProjectCustomerId={setNewProjectCustomerId}
        newProjectOwnerGroupId={newProjectOwnerGroupId}
        setNewProjectStatus={setNewProjectStatus}
        newProjectStatus={newProjectStatus}
        setNewProjectOwnerGroupId={setNewProjectOwnerGroupId}
        memberGroups={memberGroups}
        handleCreateProject={handleCreateProject}
        createProjectConfirmOpen={createProjectConfirmOpen}
        setCreateProjectConfirmOpen={setCreateProjectConfirmOpen}
        customers={customers}
        createCustomerByName={createCustomerByName}
        projectSettingsOpen={projectSettingsOpen}
        setProjectSettingsOpen={setProjectSettingsOpen}
        requestCloseProjectSettings={requestCloseProjectSettings}
        projectSettingsTarget={projectSettingsTarget}
        projectSettingsName={projectSettingsName}
        setProjectSettingsName={setProjectSettingsName}
        projectSettingsCode={projectSettingsCode}
        setProjectSettingsCode={setProjectSettingsCode}
        projectSettingsColor={projectSettingsColor}
        setProjectSettingsColor={setProjectSettingsColor}
        projectSettingsCustomerId={projectSettingsCustomerId}
        setProjectSettingsCustomerId={setProjectSettingsCustomerId}
        projectSettingsOwnerGroupId={projectSettingsOwnerGroupId}
        setProjectSettingsOwnerGroupId={setProjectSettingsOwnerGroupId}
        projectSettingsStatus={projectSettingsStatus}
        setProjectSettingsStatus={setProjectSettingsStatus}
        handleSaveProjectSettings={handleSaveProjectSettings}
        projectSettingsConfirmOpen={projectSettingsConfirmOpen}
        setProjectSettingsConfirmOpen={setProjectSettingsConfirmOpen}
      />

      <MilestoneDialog
        open={milestoneDialogOpen}
        onOpenChange={handleMilestoneDialogOpenChange}
        date={milestoneDialogDate}
        milestone={editingMilestone}
        canEdit={canEdit}
        defaultProjectId={milestoneDialogDefaultProjectId}
      />

      <ProjectTaskDetailsDialog
        open={Boolean(selectedTaskId)}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        selectedTask={selectedTask}
        selectedTaskProject={selectedTaskProject}
        selectedTaskCustomer={selectedTaskCustomer}
        selectedTaskRepeatMeta={selectedTaskRepeatMeta}
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
