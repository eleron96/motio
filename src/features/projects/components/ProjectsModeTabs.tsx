import React from 'react';
import { t } from '@lingui/macro';
import type { ProjectsMode } from '@/features/projects/hooks/useProjectsViewPreferences';

interface ProjectsModeTabsProps {
  mode: ProjectsMode;
  onModeChange: (mode: ProjectsMode) => void;
}

/**
 * Projects | Milestones | Customers | Contacts — one rounded pill strip, the
 * active option tinted. Sits above the project card sidebar and above the
 * legacy sidebar, so there is only one mode switcher on the page.
 */
export const ProjectsModeTabs: React.FC<ProjectsModeTabsProps> = ({ mode, onModeChange }) => {
  const tabs: Array<{ id: ProjectsMode; label: string }> = [
    { id: 'projects', label: t`Projects` },
    { id: 'milestones', label: t`Milestones` },
    { id: 'customers', label: t`Customers` },
    { id: 'contacts', label: t`Contacts` },
  ];
  return (
    <div className="border-b border-border bg-card px-3 py-2">
      <div className="inline-flex w-full items-center rounded-full border border-border bg-muted/50 p-0.5">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => onModeChange(tabItem.id)}
            aria-pressed={mode === tabItem.id}
            className={`flex-1 truncate whitespace-nowrap rounded-full px-2 py-1.5 text-[12px] font-medium transition-colors ${
              mode === tabItem.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>
    </div>
  );
};
