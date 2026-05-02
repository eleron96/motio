import { Trans, t } from '@lingui/macro';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { useDemoConversion, type DemoConversionTrigger } from '../providers/DemoConversionProvider';

const headlineFor = (trigger: DemoConversionTrigger | null): string => {
  switch (trigger) {
    case 'invite':
      return t`Invite teammates after you sign up`;
    case 'share':
      return t`Share your timeline after you sign up`;
    case 'export':
      return t`Export your work after you sign up`;
    case 'timer':
      return t`Like what you see? Save your work.`;
    case 'banner':
    case 'manual':
    default:
      return t`Save your work — create an account`;
  }
};

const bodyFor = (trigger: DemoConversionTrigger | null): string => {
  switch (trigger) {
    case 'invite':
      return t`Sending invites needs a real account. Sign up in 30 seconds and we'll bring you back here.`;
    case 'share':
      return t`Sharing a live timeline needs a real account. Sign up in 30 seconds.`;
    case 'export':
      return t`Exports run on your real workspace. Sign up in 30 seconds to enable them.`;
    default:
      return t`This sandbox resets soon. Create a free account to keep this timeline and start your own.`;
  }
};

export const DemoConversionModal = () => {
  const { isOpen, trigger, close } = useDemoConversion();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{headlineFor(trigger)}</DialogTitle>
          <DialogDescription>{bodyFor(trigger)}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={close}>
            <Trans>Keep exploring</Trans>
          </Button>
          <Button asChild>
            <Link to="/auth?from=demo">
              <Trans>Create account</Trans>
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
