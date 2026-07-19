import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Database, Egg, Gauge, LayoutGrid, Users } from 'lucide-react';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { MobilePillSubnav } from '@/shared/ui/mobile-pill-subnav';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { cn } from '@/shared/lib/classNames';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';

interface AdminNavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

// The console is reachable by direct URL only (no in-app links, by design).
// Section list lives here: adding a page = one file + one entry below.
const useNavItems = (): AdminNavItem[] => [
  { path: '/app/admin', label: t`Overview`, icon: <Gauge className="h-4 w-4" />, end: true },
  { path: '/app/admin/users', label: t`Users`, icon: <Users className="h-4 w-4" /> },
  { path: '/app/admin/workspaces', label: t`Workspaces`, icon: <LayoutGrid className="h-4 w-4" /> },
  { path: '/app/admin/easter-eggs', label: t`Easter eggs`, icon: <Egg className="h-4 w-4" /> },
  { path: '/app/admin/backups', label: t`Backups`, icon: <Database className="h-4 w-4" /> },
];

const AdminLayout: React.FC = () => {
  usePageSeo({
    title: 'Motio — Admin',
    description: 'Private admin panel in Motio.',
    canonicalPath: '/app/admin',
    robots: 'noindex, nofollow',
  });

  const { user, isSuperAdmin, signOut } = useAuthStore(useShallow((state) => ({
    user: state.user,
    isSuperAdmin: state.isSuperAdmin,
    signOut: state.signOut,
  })));
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = useNavItems();

  if (!user) {
    return null;
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
            <h1 className="text-xl font-semibold tracking-tight">Admin console</h1>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
          <Button type="button" variant="outline" onClick={() => signOut()}>
            {t`Sign out`}
          </Button>
        </div>

        {isMobile ? (
          <MobilePillSubnav
            items={navItems.map((item) => ({ id: item.path, label: item.label }))}
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
