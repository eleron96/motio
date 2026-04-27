import React, { useCallback, useMemo, useRef } from 'react';
import { t } from '@lingui/macro';
import { useProjectQueryInput } from '@/features/planner/hooks/useProjectQueryInput';
import { Project } from '@/features/planner/types/planner';
import { filterProjectsByQuery } from '@/features/planner/lib/taskFormRules';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { cn } from '@/shared/lib/classNames';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Input } from '@/shared/ui/input';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface TaskProjectSelectProps {
  value: string;
  projects: Project[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  noProjectDisabled?: boolean;
  triggerClassName?: string;
  showArchivedBadge?: boolean;
}

export const TaskProjectSelect: React.FC<TaskProjectSelectProps> = ({
  value,
  projects,
  onValueChange,
  disabled = false,
  noProjectDisabled = false,
  triggerClassName,
  showArchivedBadge = false,
}) => {
  const {
    projectQuery,
    setProjectQuery,
    clearProjectQuery,
    handleProjectSelectOpenChange,
    handleProjectSelectKeyDown,
  } = useProjectQueryInput();
  const isMobile = useIsMobile();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const filteredProjects = useMemo(
    () => filterProjectsByQuery(projects, projectQuery),
    [projects, projectQuery],
  );

  const handleValueChange = useCallback((nextValue: string) => {
    onValueChange(nextValue);
    clearProjectQuery();
  }, [clearProjectQuery, onValueChange]);

  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      onOpenChange={(nextOpen) => {
        handleProjectSelectOpenChange(nextOpen);
        if (nextOpen) {
          // Focus the visible search input on mobile so the virtual keyboard
          // opens right away. Defer one frame so Radix finishes mounting.
          requestAnimationFrame(() => {
            if (isMobile) searchInputRef.current?.focus();
          });
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger className={cn('min-w-0 overflow-hidden', triggerClassName)}>
        <SelectValue placeholder={t`Select project`} />
      </SelectTrigger>
      <SelectContent onKeyDown={handleProjectSelectKeyDown}>
        <div className="sticky top-0 z-10 -mx-1 mb-1 border-b bg-popover px-2 py-1.5">
          <Input
            ref={searchInputRef}
            value={projectQuery}
            onChange={(event) => setProjectQuery(event.target.value)}
            onKeyDown={(event) => {
              // Let arrows/Enter/Escape bubble so Select still handles navigation,
              // but prevent any other keys from triggering Radix typeahead.
              const isNavKey = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(event.key);
              if (!isNavKey) event.stopPropagation();
            }}
            placeholder={t`Search projects`}
            className="h-8 text-sm"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </div>
        <div
          className="max-h-48 overflow-y-auto overscroll-contain pr-2"
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <SelectItem value="none" disabled={noProjectDisabled}>{t`No project`}</SelectItem>
          {filteredProjects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              <span className="inline-flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="truncate">{formatProjectLabel(project.name, project.code)}</span>
                {showArchivedBadge && project.archived && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    ({t`Archived`})
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
          {filteredProjects.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              {t`No projects found`}
            </div>
          )}
        </div>
      </SelectContent>
    </Select>
  );
};
