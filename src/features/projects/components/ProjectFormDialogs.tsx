import React from 'react';
import { t } from '@lingui/macro';
import { formatProjectStatusInput } from '@/shared/domain/projectStatus';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { ColorPicker } from '@/shared/ui/color-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { CustomerCombobox } from '@/features/projects/components/CustomerCombobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import type { ProjectsDialogsProps } from '@/features/projects/components/ProjectsDialogs';

// Creating a project and editing its settings, each with its confirmation step.
export const ProjectFormDialogs = ({
  canEdit,
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
  setNewProjectStatus,
  newProjectStatus,
  setNewProjectOwnerGroupId,
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
}: Pick<
  ProjectsDialogsProps,
  | 'canEdit'
  | 'createProjectOpen'
  | 'setCreateProjectOpen'
  | 'requestCloseCreateProject'
  | 'newProjectName'
  | 'setNewProjectName'
  | 'newProjectCode'
  | 'setNewProjectCode'
  | 'newProjectColor'
  | 'setNewProjectColor'
  | 'newProjectCustomerId'
  | 'setNewProjectCustomerId'
  | 'newProjectOwnerGroupId'
  | 'setNewProjectStatus'
  | 'newProjectStatus'
  | 'setNewProjectOwnerGroupId'
  | 'memberGroups'
  | 'handleCreateProject'
  | 'createProjectConfirmOpen'
  | 'setCreateProjectConfirmOpen'
  | 'customers'
  | 'createCustomerByName'
  | 'projectSettingsOpen'
  | 'setProjectSettingsOpen'
  | 'requestCloseProjectSettings'
  | 'projectSettingsTarget'
  | 'projectSettingsName'
  | 'setProjectSettingsName'
  | 'projectSettingsCode'
  | 'setProjectSettingsCode'
  | 'projectSettingsColor'
  | 'setProjectSettingsColor'
  | 'projectSettingsCustomerId'
  | 'setProjectSettingsCustomerId'
  | 'projectSettingsOwnerGroupId'
  | 'setProjectSettingsOwnerGroupId'
  | 'projectSettingsStatus'
  | 'setProjectSettingsStatus'
  | 'handleSaveProjectSettings'
  | 'projectSettingsConfirmOpen'
  | 'setProjectSettingsConfirmOpen'
>) => {
  const projectNameInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
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
        <DialogContent
          className="w-[95vw] max-w-xl"
          onOpenAutoFocus={(event) => {
            // Focus the name field on open so the user can type immediately.
            event.preventDefault();
            projectNameInputRef.current?.focus();
          }}
        >
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
                  ref={projectNameInputRef}
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
            <div className="space-y-1">
              <Label>{t`Owner team`}</Label>
              <Select
                value={newProjectOwnerGroupId ?? '__none__'}
                onValueChange={(value) => setNewProjectOwnerGroupId(value === '__none__' ? null : value)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t`No team`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t`No team`}</SelectItem>
                  {memberGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t`Project status`}</Label>
              <Input
                placeholder={t`E.g. В работе, Заморожен, Завершен`}
                value={newProjectStatus}
                onChange={(event) => setNewProjectStatus(formatProjectStatusInput(event.target.value))}
                disabled={!canEdit}
                className="uppercase"
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
              <div className="space-y-1">
                <Label>{t`Owner team`}</Label>
                <Select
                  value={projectSettingsOwnerGroupId ?? '__none__'}
                  onValueChange={(value) => setProjectSettingsOwnerGroupId(value === '__none__' ? null : value)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t`No team`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t`No team`}</SelectItem>
                    {memberGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t`Project status`}</Label>
                <Input
                  placeholder={t`E.g. В работе, Заморожен, Завершен`}
                  value={projectSettingsStatus}
                  onChange={(event) => setProjectSettingsStatus(formatProjectStatusInput(event.target.value))}
                  disabled={!canEdit}
                  className="uppercase"
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
    </>
  );
};
