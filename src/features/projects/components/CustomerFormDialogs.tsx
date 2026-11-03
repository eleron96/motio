import React from 'react';
import { t } from '@lingui/macro';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { ProjectsDialogsProps } from '@/features/projects/components/ProjectsDialogs';

// Creating and renaming a customer, with the confirmation a rename needs.
export const CustomerFormDialogs = ({
  canEdit,
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
}: Pick<
  ProjectsDialogsProps,
  | 'canEdit'
  | 'createCustomerOpen'
  | 'setCreateCustomerOpen'
  | 'newCustomerName'
  | 'setNewCustomerName'
  | 'handleAddCustomerFromTab'
  | 'renameCustomerOpen'
  | 'setRenameCustomerOpen'
  | 'requestCloseRenameCustomer'
  | 'editingCustomerName'
  | 'setEditingCustomerName'
  | 'editingCustomerIndustry'
  | 'setEditingCustomerIndustry'
  | 'handleRenameCustomer'
  | 'renameCustomerConfirmOpen'
  | 'setRenameCustomerConfirmOpen'
  | 'cancelCustomerEdit'
>) => {
  const customerNameInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <Dialog
        open={createCustomerOpen}
        onOpenChange={(open) => {
          setCreateCustomerOpen(open);
          if (!open) {
            setNewCustomerName('');
          }
        }}
      >
        <DialogContent
          className="w-[95vw] max-w-md"
          onOpenAutoFocus={(event) => {
            // Focus the name field on open so the user can type immediately.
            event.preventDefault();
            customerNameInputRef.current?.focus();
          }}
        >
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
                ref={customerNameInputRef}
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
            <DialogTitle>{t`Edit customer`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Update customer name and industry.`}
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
            <div className="space-y-1">
              <Label>{t`Industry / segment`}</Label>
              <Input
                placeholder={t`E.g. Real estate · Residential`}
                value={editingCustomerIndustry}
                onChange={(event) => setEditingCustomerIndustry(event.target.value)}
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
    </>
  );
};
