import React from 'react';
import { Settings } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { t } from '@lingui/macro';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { Button } from '@/shared/ui/button';
import { Separator } from '@/shared/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';

interface WorkspaceMobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onOpenAccountSettings: () => void;
  settingsDisabled?: boolean;
  showSettingsButton?: boolean;
}

export const WorkspaceMobileDrawer: React.FC<WorkspaceMobileDrawerProps> = ({
  open,
  onOpenChange,
  onOpenSettings,
  onOpenAccountSettings,
  settingsDisabled = false,
  showSettingsButton = true,
}) => {
  const location = useLocation();
  const lastPathnameRef = React.useRef(location.pathname);

  React.useEffect(() => {
    if (lastPathnameRef.current === location.pathname) return;
    lastPathnameRef.current = location.pathname;
    onOpenChange(false);
  }, [location.pathname, onOpenChange]);

  const handleOpenSettings = () => {
    onOpenChange(false);
    onOpenSettings();
  };

  const handleOpenAccountSettings = () => {
    onOpenChange(false);
    onOpenAccountSettings();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        aria-describedby={undefined}
        className="w-[15rem] overflow-y-auto px-4 py-5 sm:max-w-[15rem]"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle>{t`Menu`}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-5">
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {t`Workspace`}
              </p>
            </div>
            <WorkspaceSwitcher />
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {t`Tools`}
              </p>
            </div>

            {showSettingsButton && (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal py-2 text-left"
                onClick={handleOpenSettings}
                disabled={settingsDisabled}
              >
                <Settings className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 leading-5">
                  {t`Workspace settings`}
                </span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 w-full justify-start whitespace-normal py-2 text-left"
              onClick={handleOpenAccountSettings}
            >
              <span className="min-w-0 leading-5">
                {t`Account settings`}
              </span>
            </Button>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {t`Notifications`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t`Open invites and task updates.`}
                </p>
              </div>
              <InviteNotifications />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
