import { Trans } from '@lingui/macro';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';

const DemoPage = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
    <h1 className="text-2xl font-semibold">
      <Trans>Demo workspace</Trans>
    </h1>
    <p className="max-w-md text-sm text-muted-foreground">
      <Trans>
        This sandbox lets you try Motio without signing up. It is wired up in stages — full
        timeline, dashboards, projects and members will land here next.
      </Trans>
    </p>
    <Button asChild>
      <Link to="/">
        <Trans>Back to landing</Trans>
      </Link>
    </Button>
  </div>
);

export default DemoPage;
