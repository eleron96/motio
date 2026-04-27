import React from 'react';
import { NavLink, useMatch, useResolvedPath } from 'react-router-dom';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { getAppNavigationItems } from '@/features/workspace/lib/appNavigation';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';

interface WorkspaceNavProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  onNavigate?: () => void;
}

type WorkspaceNavItemProps = {
  label: React.ReactNode;
  onNavigate?: () => void;
  orientation: 'horizontal' | 'vertical';
  to: string;
  end?: boolean;
  dataTour?: string;
};

const WorkspaceNavItem = ({ end, label, onNavigate, orientation, to, dataTour }: WorkspaceNavItemProps) => {
  const resolvedPath = useResolvedPath(to);
  const isActive = Boolean(useMatch({ end, path: resolvedPath.pathname }));

  return (
    <SegmentedControlItem
      asChild
      active={isActive}
      inactiveClassName="text-muted-foreground hover:text-foreground"
      size="sm"
    >
      <NavLink to={to} end={end} onClick={onNavigate} data-tour={dataTour}>
        {label}
      </NavLink>
    </SegmentedControlItem>
  );
};

export const WorkspaceNav: React.FC<WorkspaceNavProps> = ({
  orientation = 'horizontal',
  className,
  onNavigate,
}) => (
  <nav
    data-tour="nav-bar"
    aria-label={t`Workspace sections`}
    className={className}
  >
    <SegmentedControl
      orientation={orientation === 'horizontal' ? 'horizontal' : 'vertical'}
      surface={orientation === 'horizontal' ? 'subtle' : 'none'}
      className={cn(orientation === 'vertical' && '!items-start gap-1')}
    >
      {getAppNavigationItems().map((item) => (
        <WorkspaceNavItem
          key={item.to}
          label={item.label}
          orientation={orientation}
          onNavigate={onNavigate}
          to={item.to}
          end={item.end}
          dataTour={
            item.to === '/app/dashboard' ? 'nav-dashboard'
              : item.to === '/app/projects' ? 'nav-projects'
              : item.to === '/app/members' ? 'nav-team'
                : undefined
          }
        />
      ))}
    </SegmentedControl>
  </nav>
);
