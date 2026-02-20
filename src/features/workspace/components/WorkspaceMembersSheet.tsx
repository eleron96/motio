import React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { WorkspaceMembersPanel } from '@/features/workspace/components/WorkspaceMembersPanel';
import { t } from '@lingui/macro';

interface WorkspaceMembersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WorkspaceMembersSheet: React.FC<WorkspaceMembersSheetProps> = ({ open, onOpenChange }) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t`Workspace members`}</SheetTitle>
          <SheetDescription className="sr-only">
            {t`Manage workspace members, roles, and invitations.`}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <WorkspaceMembersPanel active={open} showTitle={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
};
