import { t } from '@lingui/macro';

export type SectionIconKey = 'timeline' | 'dashboard' | 'projects' | 'team';

export type AppNavigationItem = {
  to: string;
  label: string;
  end?: boolean;
  iconKey: SectionIconKey;
};

export const getAppNavigationItems = (): AppNavigationItem[] => [
  {
    to: '/app',
    label: t`Timeline`,
    end: true,
    iconKey: 'timeline',
  },
  {
    to: '/app/dashboard',
    label: t`Dashboard`,
    iconKey: 'dashboard',
  },
  {
    to: '/app/projects',
    label: t`Projects`,
    iconKey: 'projects',
  },
  {
    to: '/app/members',
    label: t`Team`,
    iconKey: 'team',
  },
];

export const getAppNavigationLabel = (pathname: string) => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const matchedItem = getAppNavigationItems().find((item) => {
    if (item.end) {
      return normalizedPath === item.to;
    }

    return normalizedPath === item.to || normalizedPath.startsWith(`${item.to}/`);
  });

  return matchedItem?.label ?? t`Workspace`;
};
