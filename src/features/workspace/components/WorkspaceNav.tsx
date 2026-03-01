import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/shared/lib/classNames';
import { t } from '@lingui/macro';

export const WorkspaceNav: React.FC = () => (
  <nav className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
    <NavLink
      to="/app"
      end
      className={({ isActive }) => cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {t`Timeline`}
    </NavLink>
    <NavLink
      to="/app/dashboard"
      className={({ isActive }) => cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {t`Dashboard`}
    </NavLink>
    <NavLink
      to="/app/projects"
      className={({ isActive }) => cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {t`Projects`}
    </NavLink>
    <NavLink
      to="/app/members"
      className={({ isActive }) => cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {t`Members`}
    </NavLink>
  </nav>
);
