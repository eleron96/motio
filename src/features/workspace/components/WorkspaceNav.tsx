import React from 'react';
import { NavLink } from 'react-router-dom';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { getAppNavigationItems } from '@/features/workspace/lib/appNavigation';

interface WorkspaceNavProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  onNavigate?: () => void;
}

export const WorkspaceNav: React.FC<WorkspaceNavProps> = ({
  orientation = 'horizontal',
  className,
  onNavigate,
}) => (
  <nav
    aria-label={t`Workspace sections`}
    className={cn(
      orientation === 'horizontal'
        ? 'flex items-center gap-1 rounded-lg bg-muted/40 p-1'
        : 'flex flex-col gap-1',
      className,
    )}
  >
    {getAppNavigationItems().map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) => cn(
          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          orientation === 'vertical' && 'w-full',
          isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {item.label}
      </NavLink>
    ))}
  </nav>
);
