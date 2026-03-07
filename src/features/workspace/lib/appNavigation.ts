import { t } from '@lingui/macro';

export type AppNavigationItem = {
  to: string;
  label: string;
  end?: boolean;
};

export const getAppNavigationItems = (): AppNavigationItem[] => [
  {
    to: '/app',
    label: t`Timeline`,
    end: true,
  },
  {
    to: '/app/dashboard',
    label: t`Dashboard`,
  },
  {
    to: '/app/projects',
    label: t`Projects`,
  },
  {
    to: '/app/members',
    label: t`Members`,
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
