import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Database, Egg, Gauge, History, LayoutGrid, MailPlus, Send, SlidersHorizontal, UsersRound, Users } from 'lucide-react';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { MobilePillSubnav } from '@/shared/ui/mobile-pill-subnav';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { cn } from '@/shared/lib/classNames';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { APP_VERSION } from '@/shared/lib/appVersion';
import { summarizeUpdate } from '@/features/admin/lib/updateInfo';
import { useUpdateInfoStore } from '@/features/admin/store/updateInfoStore';

interface AdminNavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  /** A newer release is out: the System section says which and how to update. */
  updateAvailable?: boolean;
}

// The console is reachable by direct URL only (no in-app links, by design).
// Section list lives here: adding a page = one file + one entry below.
// "Group access" only where workspaces from groups is on (Settings, or the
// older KEYCLOAK_WORKSPACES_FROM_GROUPS); reached by URL, the page says how.
const useNavItems = (groupWorkspacesEnabled: boolean, updateAvailable: boolean): AdminNavItem[] => [
  { path: '/app/admin', label: t`Overview`, icon: <Gauge className="h-4 w-4" />, end: true },
  { path: '/app/admin/system', label: t`System`, icon: <Activity className="h-4 w-4" />, updateAvailable },
  { path: '/app/admin/settings', label: t`Settings`, icon: <SlidersHorizontal className="h-4 w-4" /> },
  { path: '/app/admin/users', label: t`Users`, icon: <Users className="h-4 w-4" /> },
  { path: '/app/admin/workspaces', label: t`Workspaces`, icon: <LayoutGrid className="h-4 w-4" /> },
  { path: '/app/admin/invitations', label: t`Invitations`, icon: <MailPlus className="h-4 w-4" /> },
  ...(groupWorkspacesEnabled
    ? [{ path: '/app/admin/group-access', label: t`Group access`, icon: <UsersRound className="h-4 w-4" /> }]
    : []),
  { path: '/app/admin/easter-eggs', label: t`Easter eggs`, icon: <Egg className="h-4 w-4" /> },
  { path: '/app/admin/broadcast', label: t`Broadcast`, icon: <Send className="h-4 w-4" /> },
  { path: '/app/admin/backups', label: t`Backups`, icon: <Database className="h-4 w-4" /> },
  { path: '/app/admin/activity', label: t`Activity log`, icon: <History className="h-4 w-4" /> },
];

const AdminLayout: React.FC = () => {
  usePageSeo({
    title: 'Motio — Admin',
    description: 'Private admin panel in Motio.',
    canonicalPath: '/app/admin',
    robots: 'noindex, nofollow',
  });

  const {
    user,
    isSuperAdmin,
    superAdminLoading,
    superAdminCheckFailed,
    superAdminSessionExpired,
    resolveSuperAdmin,
    groupWorkspacesEnabled,
    signOut,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    isSuperAdmin: state.isSuperAdmin,
    superAdminLoading: state.superAdminLoading,
    superAdminCheckFailed: state.superAdminCheckFailed,
    superAdminSessionExpired: state.superAdminSessionExpired,
    resolveSuperAdmin: state.resolveSuperAdmin,
    groupWorkspacesEnabled: state.groupWorkspacesEnabled,
    signOut: state.signOut,
  })));
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const updateInfo = useUpdateInfoStore((state) => state.info);
  const loadUpdateInfo = useUpdateInfoStore((state) => state.load);
  const updateAvailable = summarizeUpdate(APP_VERSION, updateInfo) !== null;
  const navItems = useNavItems(groupWorkspacesEnabled, updateAvailable);

  // Only a super admin gets an answer, so nobody else asks.
  useEffect(() => {
    if (isSuperAdmin) void loadUpdateInfo();
  }, [isSuperAdmin, loadUpdateInfo]);

  if (!user) {
    return null;
  }

  if (!isSuperAdmin && superAdminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t`Checking access…`}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!isSuperAdmin && superAdminSessionExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t`Your session has ended`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{t`Sign in again to open the admin console.`}</p>
            <Button type="button" onClick={() => void signOut()}>
              {t`Sign in again`}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // A failed check is not a refusal: a deploy restarting the functions
  // container while the console is open used to read as "Access denied".
  if (!isSuperAdmin && superAdminCheckFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t`Could not check access`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{t`The server did not answer. This usually passes on its own — try again in a moment.`}</p>
            <Button type="button" onClick={() => void resolveSuperAdmin(user)}>
              {t`Try again`}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t`Access denied`}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t`Only super admins can access this page.`}
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeItem = navItems.find((item) => (
    item.end ? location.pathname === item.path : location.pathname.startsWith(item.path)
  )) ?? navItems[0]!;

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t`Admin console`}</h1>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
          <Button type="button" variant="outline" onClick={() => signOut()}>
            {t`Sign out`}
          </Button>
        </div>

        {isMobile ? (
          <MobilePillSubnav
            items={navItems.map((item) => ({
              id: item.path,
              label: item.label,
              dot: item.updateAvailable,
              dotLabel: t`Update available`,
            }))}
            activeId={activeItem.path}
            onChange={(id) => navigate(id)}
            ariaLabel={t`Admin sections`}
          />
        ) : null}

        <div className={cn('flex gap-6', isMobile && 'flex-col')}>
          {!isMobile && (
            <nav aria-label={t`Admin sections`} className="w-48 shrink-0 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) => cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {item.icon}
                  {item.label}
                  {item.updateAvailable ? (
                    <span className="ml-auto inline-flex items-center">
                      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
                      <span className="sr-only">{t`Update available`}</span>
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
