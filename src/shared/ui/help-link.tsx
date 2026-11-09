import { t } from '@lingui/macro';
import { BookOpen } from 'lucide-react';
import { userGuideUrl } from '@/shared/lib/docsLinks';
import { useLocaleStore } from '@/shared/store/localeStore';

/** "Help": opens the user guide, in the interface language where one exists. */
export const HelpLink = () => {
  const locale = useLocaleStore((state) => state.locale);
  return (
    <a
      href={userGuideUrl(locale)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground underline-offset-4 hover:underline"
    >
      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
      {t`Help`}
    </a>
  );
};
