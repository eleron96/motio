import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Search, User, Users, X } from 'lucide-react';
import { t } from '@lingui/macro';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useBoardPeopleCounts } from '@/features/planner/hooks/useBoardColumns';
import { buildAssigneeGroupMap, resolveCurrentUserAssigneeId } from '@/features/planner/lib/timelineSelectors';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { cn } from '@/shared/lib/classNames';
import type { Assignee } from '@/features/planner/types/planner';

/** People shown as avatars before the rest folds into "+N". */
const VISIBLE_PEOPLE = 8;

const chipClass = (active: boolean) => cn(
  'inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  active
    ? 'border-primary/40 bg-primary/15 text-primary'
    : 'border-border text-foreground hover:bg-accent',
);

const toggleId = (ids: string[], id: string) => (
  ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
);

interface BoardQuickFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  overdueOnly: boolean;
  onOverdueOnlyChange: (value: boolean) => void;
}

/**
 * One row of one-click filters above the board. People, groups and projects write into
 * the planner's shared filters (the same ones the filter panel and the timeline
 * use, persisted per user); search and "overdue" are board-only and transient.
 */
export const BoardQuickFilters: React.FC<BoardQuickFiltersProps> = ({
  search,
  onSearchChange,
  overdueOnly,
  onOverdueOnlyChange,
}) => {
  const assignees = usePlannerStore((state) => state.assignees);
  const projects = usePlannerStore((state) => state.projects);
  const trackedProjectIds = usePlannerStore((state) => state.trackedProjectIds);
  const memberGroups = usePlannerStore((state) => state.memberGroups);
  const memberGroupAssignments = usePlannerStore((state) => state.memberGroupAssignments);
  const filters = usePlannerStore((state) => state.filters);
  const setFilters = usePlannerStore((state) => state.setFilters);
  const clearFilterCriteria = usePlannerStore((state) => state.clearFilterCriteria);
  const userId = useAuthStore((state) => state.user?.id);
  const peopleCounts = useBoardPeopleCounts();

  const [morePeopleOpen, setMorePeopleOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);

  const myAssigneeId = useMemo(() => resolveCurrentUserAssigneeId(assignees, userId), [assignees, userId]);

  const assigneeGroupMap = useMemo(
    () => buildAssigneeGroupMap(assignees, memberGroupAssignments),
    [assignees, memberGroupAssignments],
  );
  const selectedGroups = filters.groupIds;
  const selectedPeople = filters.assigneeIds;

  // The busiest people first; ties by name. "Mine" covers the current user.
  // With a group picked, the row narrows to its members (plus anyone already
  // selected, so a choice never disappears from view).
  const people = useMemo(() => (
    assignees
      .filter((person) => person.isActive && person.id !== myAssigneeId)
      .filter((person) => (
        selectedGroups.length === 0
        || selectedGroups.includes(assigneeGroupMap.get(person.id) ?? '')
        || selectedPeople.includes(person.id)
      ))
      .sort((left, right) => (
        (peopleCounts.get(right.id) ?? 0) - (peopleCounts.get(left.id) ?? 0)
        || left.name.localeCompare(right.name)
      ))
  ), [assignees, myAssigneeId, peopleCounts, selectedGroups, assigneeGroupMap, selectedPeople]);

  // A selected person stays visible even past the cut, so the row shows every
  // active choice without opening "+N".
  const visiblePeople = useMemo(() => {
    const top = people.slice(0, VISIBLE_PEOPLE);
    const extraSelected = people.slice(VISIBLE_PEOPLE).filter((person) => selectedPeople.includes(person.id));
    return [...top, ...extraSelected];
  }, [people, selectedPeople]);
  const foldedPeople = people.filter((person) => !visiblePeople.includes(person));

  const activeProjects = useMemo(
    () => sortProjectsByTracking(projects.filter((project) => !project.archived), trackedProjectIds),
    [projects, trackedProjectIds],
  );
  const selectedProjects = filters.projectIds;
  const projectLabel = (() => {
    if (selectedProjects.length === 0) return t`Project: all`;
    if (selectedProjects.length === 1) {
      const project = projects.find((item) => item.id === selectedProjects[0]);
      return project ? formatProjectLabel(project.name, project.code) : t`Project: all`;
    }
    return t`Projects: ${selectedProjects.length}`;
  })();

  const hasCriteria = filters.projectIds.length > 0
    || filters.assigneeIds.length > 0
    || filters.groupIds.length > 0
    || filters.statusIds.length > 0
    || filters.typeIds.length > 0
    || filters.tagIds.length > 0;
  const showReset = hasCriteria || search.trim().length > 0 || overdueOnly;

  const sortedGroups = useMemo(
    () => [...memberGroups].sort((left, right) => left.name.localeCompare(right.name)),
    [memberGroups],
  );
  const groupLabel = (() => {
    if (selectedGroups.length === 0) return t`Group: all`;
    if (selectedGroups.length === 1) {
      return memberGroups.find((group) => group.id === selectedGroups[0])?.name ?? t`Group: all`;
    }
    return t`Groups: ${selectedGroups.length}`;
  })();
  const toggleGroup = (id: string) => setFilters({ groupIds: toggleId(selectedGroups, id) });

  const togglePerson = (id: string) => setFilters({ assigneeIds: toggleId(selectedPeople, id) });
  const toggleProject = (id: string) => setFilters({ projectIds: toggleId(selectedProjects, id) });

  const handleReset = () => {
    clearFilterCriteria();
    onSearchChange('');
    onOverdueOnlyChange(false);
  };

  const personButton = (person: Assignee) => {
    const selected = selectedPeople.includes(person.id);
    const count = peopleCounts.get(person.id) ?? 0;
    return (
      <button
        key={person.id}
        type="button"
        onClick={() => togglePerson(person.id)}
        aria-pressed={selected}
        aria-label={person.name}
        title={`${person.name} · ${count}`}
        className={cn(
          'flex-shrink-0 rounded-full transition-transform hover:-translate-y-px',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
        )}
      >
        <PersonAvatar assigneeId={person.id} name={person.name} avatarUrl={person.avatar} size="sm" />
      </button>
    );
  };

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2"
      data-testid="board-quick-filters"
    >
      <div className="relative flex-shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t`Search by title`}
          aria-label={t`Search by title`}
          className="h-8 w-56 rounded-full pl-8 text-sm"
        />
      </div>

      <span aria-hidden className="h-5 w-px flex-shrink-0 bg-border" />

      {myAssigneeId && (
        <button
          type="button"
          onClick={() => togglePerson(myAssigneeId)}
          aria-pressed={selectedPeople.includes(myAssigneeId)}
          className={chipClass(selectedPeople.includes(myAssigneeId))}
        >
          <User className="h-4 w-4" />
          {t`Mine`}
        </button>
      )}

      {visiblePeople.length > 0 && (
        <div className="flex flex-shrink-0 items-center gap-1">
          {visiblePeople.map(personButton)}
          {foldedPeople.length > 0 && (
            <Popover open={morePeopleOpen} onOpenChange={setMorePeopleOpen}>
              <PopoverTrigger asChild>
                <button type="button" className={chipClass(false)} aria-label={t`More people`}>
                  +{foldedPeople.length}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder={t`Find a person`} />
                  <CommandList>
                    <CommandEmpty>{t`Nobody found`}</CommandEmpty>
                    <CommandGroup>
                      {foldedPeople.map((person) => (
                        <CommandItem
                          key={person.id}
                          value={`${person.name} ${person.id}`}
                          onSelect={() => {
                            togglePerson(person.id);
                            setMorePeopleOpen(false);
                          }}
                          className="gap-2"
                        >
                          <PersonAvatar assigneeId={person.id} name={person.name} avatarUrl={person.avatar} size="xs" />
                          <span className="min-w-0 flex-1 truncate">{person.name}</span>
                          {selectedPeople.includes(person.id) && <Check className="h-4 w-4 text-primary" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      <span aria-hidden className="h-5 w-px flex-shrink-0 bg-border" />

      {sortedGroups.length > 0 && (
        <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={chipClass(selectedGroups.length > 0)}>
              <Users className="h-4 w-4" />
              <span className="max-w-[10rem] truncate">{groupLabel}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder={t`Find a group`} />
              <CommandList>
                <CommandEmpty>{t`No groups found`}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all__"
                    onSelect={() => {
                      setFilters({ groupIds: [] });
                      setGroupsOpen(false);
                    }}
                    className="gap-2"
                  >
                    <span className="min-w-0 flex-1">{t`All groups`}</span>
                    {selectedGroups.length === 0 && <Check className="h-4 w-4 text-primary" />}
                  </CommandItem>
                  {sortedGroups.map((group) => (
                    <CommandItem
                      key={group.id}
                      value={`${group.name} ${group.id}`}
                      onSelect={() => {
                        toggleGroup(group.id);
                        setGroupsOpen(false);
                      }}
                      className="gap-2"
                    >
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      {selectedGroups.includes(group.id) && <Check className="h-4 w-4 text-primary" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <Popover open={projectsOpen} onOpenChange={setProjectsOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={chipClass(selectedProjects.length > 0)}>
            <span className="max-w-[12rem] truncate">{projectLabel}</span>
            <ChevronDown className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder={t`Find a project`} />
            <CommandList>
              <CommandEmpty>{t`No projects found`}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    setFilters({ projectIds: [] });
                    setProjectsOpen(false);
                  }}
                  className="gap-2"
                >
                  <span className="min-w-0 flex-1">{t`All projects`}</span>
                  {selectedProjects.length === 0 && <Check className="h-4 w-4 text-primary" />}
                </CommandItem>
                {activeProjects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={`${formatProjectLabel(project.name, project.code)} ${project.id}`}
                    onSelect={() => {
                      toggleProject(project.id);
                      setProjectsOpen(false);
                    }}
                    className="gap-2"
                  >
                    <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                    <span className="min-w-0 flex-1 truncate">{formatProjectLabel(project.name, project.code)}</span>
                    {selectedProjects.includes(project.id) && <Check className="h-4 w-4 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={() => onOverdueOnlyChange(!overdueOnly)}
        aria-pressed={overdueOnly}
        className={chipClass(overdueOnly)}
      >
        <AlertCircle className="h-4 w-4" />
        {t`Overdue`}
      </button>

      {showReset && (
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
          {t`Reset`}
        </button>
      )}
    </div>
  );
};
