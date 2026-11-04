import { t } from '@lingui/macro';
import { MOTIO_SOURCE_URL, opensAppAtRoot } from '@/shared/lib/startPage';

/**
 * The AGPL source link normally sits in the landing page footer. When an
 * install switches the landing page off (VITE_START_PAGE=app), the link moves
 * here, next to the version, so the source stays one click away.
 */
export const SourceCodeLink = ({ className }: { className?: string }) => {
  if (!opensAppAtRoot()) return null;
  return (
    <div>
      <a
        href={MOTIO_SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        className={className ?? 'underline-offset-4 hover:text-foreground hover:underline'}
      >
        {t`Source code`}
      </a>
    </div>
  );
};
