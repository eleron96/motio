import React from 'react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { DashboardManageDialogs as DashboardManageDialogsState } from '@/features/dashboard/hooks/useDashboardManageDialogs';

interface DashboardManageDialogsProps {
  dialogs: DashboardManageDialogsState;
  canEdit: boolean;
  canCreateDashboard: boolean;
  canDeleteDashboard: boolean;
  currentDashboardName: string | undefined;
}

/** The new / rename / delete dashboard dialogs. */
export const DashboardManageDialogs: React.FC<DashboardManageDialogsProps> = ({
  dialogs,
  canEdit,
  canCreateDashboard,
  canDeleteDashboard,
  currentDashboardName,
}) => {
  const {
    createDashboardOpen,
    setCreateDashboardOpen,
    newDashboardName,
    setNewDashboardName,
    createDashboardError,
    renameDashboardOpen,
    setRenameDashboardOpen,
    renameDashboardName,
    setRenameDashboardName,
    renameDashboardError,
    renameDashboardSaving,
    deleteDashboardOpen,
    setDeleteDashboardOpen,
    dashboardDeleting,
    setDashboardDeleting,
    handleCreateDashboard,
    handleDeleteDashboard,
    handleRenameDashboard,
  } = dialogs;

  return (
    <>
      <Dialog open={createDashboardOpen} onOpenChange={setCreateDashboardOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t`New dashboard`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Create a new dashboard.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateDashboard} className="space-y-4">
            <div className="space-y-1">
              <Label>{t`Dashboard name`}</Label>
              <Input
                placeholder={t`Enter dashboard name...`}
                value={newDashboardName}
                onChange={(event) => setNewDashboardName(event.target.value)}
              />
            </div>
            {createDashboardError && (
              <div className="text-sm text-destructive">{createDashboardError}</div>
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setCreateDashboardOpen(false)}>
                {t`Cancel`}
              </Button>
              <Button type="submit" disabled={!canEdit || !newDashboardName.trim() || !canCreateDashboard}>
                {t`Create`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={renameDashboardOpen} onOpenChange={setRenameDashboardOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t`Rename dashboard`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Update the current dashboard name.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameDashboard} className="space-y-4">
            <div className="space-y-1">
              <Label>{t`Dashboard name`}</Label>
              <Input
                placeholder={t`Enter dashboard name...`}
                value={renameDashboardName}
                onChange={(event) => setRenameDashboardName(event.target.value)}
              />
            </div>
            {renameDashboardError && (
              <div className="text-sm text-destructive">{renameDashboardError}</div>
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setRenameDashboardOpen(false)}>
                {t`Cancel`}
              </Button>
              <Button
                type="submit"
                disabled={
                  !canEdit
                  || !renameDashboardName.trim()
                  || renameDashboardSaving
                  || renameDashboardName.trim() === (currentDashboardName ?? '').trim()
                }
              >
                {t`Save`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleteDashboardOpen}
        onOpenChange={(open) => {
          setDeleteDashboardOpen(open);
          if (!open) {
            setDashboardDeleting(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete dashboard?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This will remove "${currentDashboardName ?? t`this dashboard`}". Widgets and layouts will be lost.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dashboardDeleting}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDashboard} disabled={dashboardDeleting || !canDeleteDashboard}>
              {t`Delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
