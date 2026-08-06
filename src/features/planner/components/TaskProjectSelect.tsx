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
import { ChevronDown } from 'lucide-react';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';

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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === value) ?? null,
    [projects, value],
  );

  const handleValueChange = useCallback((nextValue: string) => {
    onValueChange(nextValue);
    clearProjectQuery();
  }, [clearProjectQuery, onValueChange]);

  const [pickerOpen, setPickerOpen] = React.useState(false);

  if (isMobile) {
    // A Radix Select popup can't be scrolled with a finger here (its viewport
    // scrolls itself via arrow buttons, and the nested scroller never receives
    // the touch), so on a phone the list becomes a screen of its own.
    const options: MobilePickerOption[] = [
      {
        value: 'none',
        label: t`No project`,
        disabled: noProjectDisabled,
        searchText: '',
      },
      ...projects.map((project) => ({
        value: project.id,
        label: formatProjectLabel(project.name, project.code),
        // Name and code stay separate fields so the shared filter below matches
        // exactly what the desktop list matches — one rule, both platforms.
        searchText: project.name,
        subtitle: undefined,
        leading: (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
        ),
        note: showArchivedBadge && project.archived ? `(${t`Archived`})` : undefined,
      })),
    ];

    return (
      <>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            triggerClassName,
          )}
        >
          {selectedProject ? (
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: selectedProject.color }}
              />
              <span className="truncate">
                {formatProjectLabel(selectedProject.name, selectedProject.code)}
              </span>
              {showArchivedBadge && selectedProject.archived && (
                <span className="shrink-0 text-[10px] text-muted-foreground">({t`Archived`})</span>
              )}
            </span>
          ) : (
            // Same two states the desktop trigger distinguishes: an explicit
            // "no project" choice versus nothing chosen yet (a new milestone).
            <span className="truncate text-muted-foreground">
              {value === 'none' ? t`No project` : t`Select project`}
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>

        <MobilePickerScreen
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={t`Project`}
          options={options}
          value={value}
          onValueChange={handleValueChange}
          searchable={projects.length > 6}
          searchPlaceholder={t`Search projects`}
          emptyLabel={t`No projects found`}
          filter={(option, query) => {
            if (option.value === 'none') return false;
            const project = projects.find((candidate) => candidate.id === option.value);
            return project ? filterProjectsByQuery([project], query).length > 0 : false;
          }}
        />
      </>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      // Desktop-only path — the phone gets MobilePickerScreen above.
      onOpenChange={handleProjectSelectOpenChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn('min-w-0 overflow-hidden', triggerClassName)}>
        {selectedProject ? (
          // Render the trigger value as a single truncated line so a long project
          // name shrinks with an ellipsis and can never widen the field (or the
          // dialog around it). The dropdown items still wrap to two lines below.
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: selectedProject.color }}
            />
            <span className="truncate">{formatProjectLabel(selectedProject.name, selectedProject.code)}</span>
            {showArchivedBadge && selectedProject.archived && (
              <span className="shrink-0 text-[10px] text-muted-foreground">({t`Archived`})</span>
            )}
          </span>
        ) : (
          <SelectValue placeholder={t`Select project`} />
        )}
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
                {/* Long names wrap to a second line (clamped) instead of truncating. */}
                <span className="line-clamp-2 break-words">{formatProjectLabel(project.name, project.code)}</span>
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
