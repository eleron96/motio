import { Trans, t } from '@lingui/macro';
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
            {/* A real page load, straight to the registration form: a client-side
                route change would carry the demo user and the sandbox state into
                the real app (the sign-in page saw a "user" and sent it to /app). */}
            <a href="/auth?intent=register&from=demo">
              <Trans>Create account</Trans>
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
