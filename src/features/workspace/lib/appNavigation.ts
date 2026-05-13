import { t } from '@lingui/macro';

export type SectionIconKey = 'timeline' | 'dashboard' | 'projects' | 'team';

export type AppBasePath = '/app' | '/demo';

export type AppNavigationItem = {
  to: string;
  label: string;
  end?: boolean;
  iconKey: SectionIconKey;
};

export const getAppNavigationItems = (basePath: AppBasePath = '/app'): AppNavigationItem[] => [
  {
    to: basePath,
    label: t`Timeline`,
    end: true,
    iconKey: 'timeline',
  },
  {
    to: `${basePath}/dashboard`,
    label: t`Dashboard`,
    iconKey: 'dashboard',
  },
  {
    to: `${basePath}/projects`,
    label: t`Projects`,
    iconKey: 'projects',
  },
  {
    to: `${basePath}/members`,
    label: t`Team`,
    iconKey: 'team',
  },
];

export const getAppNavigationLabel = (pathname: string, basePath: AppBasePath = '/app') => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const matchedItem = getAppNavigationItems(basePath).find((item) => {
    if (item.end) {
      return normalizedPath === item.to;
    }

    return normalizedPath === item.to || normalizedPath.startsWith(`${item.to}/`);
  });

  return matchedItem?.label ?? t`Workspace`;
};
