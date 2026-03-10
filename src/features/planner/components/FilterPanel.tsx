import React, { useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Input } from '@/shared/ui/input';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { t } from '@lingui/macro';
import { 
  Filter, 
  ChevronDown, 
  ChevronRight,
  FolderKanban,
  Users,
  UsersRound,
  CircleDot,
  Tag,
  Layers,
  ChevronLeft
} from 'lucide-react';

interface FilterSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
}

const FilterSection: React.FC<FilterSectionProps> = ({ 
  title, 
  icon, 
  children, 
  defaultOpen = true,
  collapsed = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  if (collapsed) {
    return (
      <div className={`p-2 flex justify-center ${disabled ? 'opacity-60' : ''}`}>
        {icon}
      </div>
    );
  }
  
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 w-full px-4 py-3 transition-colors text-left ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-accent'
        }`}
      >
        {icon}
        <span className="text-sm font-medium flex-1">{title}</span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
};

interface FilterPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

const normalizeQuery = (value: string) => value.trim().toLowerCase();

export const FilterPanel: React.FC<FilterPanelProps> = ({ collapsed, onToggle }) => {
  const { 
    projects, 
    trackedProjectIds,
    assignees, 
    memberGroups,
    statuses, 
    taskTypes, 
    tags,
    viewMode,
    filters,
    setFilters,
    clearFilterCriteria,
  } = usePlannerStore();
  const isCalendarView = viewMode === 'calendar';
  
  const filteredAssignees = useFilteredAssignees(assignees);
  const activeAssignees = useMemo(
    () => filteredAssignees.filter((assignee) => assignee.isActive),
    [filteredAssignees],
  );
  const disabledAssigneesCount = Math.max(0, filteredAssignees.length - activeAssignees.length);
  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => !project.archived),
      trackedProjectIds,
    ),
    [projects, trackedProjectIds],
  );
  const archivedProjectsCount = projects.length - activeProjects.length;
  const [projectQuery, setProjectQuery] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [statusQuery, setStatusQuery] = useState('');
  const [typeQuery, setTypeQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const filteredProjects = useMemo(() => {
    const query = normalizeQuery(projectQuery);
    if (!query) return activeProjects;
    return activeProjects.filter((project) => (
      project.name.toLowerCase().includes(query)
      || (project.code ?? '').toLowerCase().includes(query)
      || formatProjectLabel(project.name, project.code).toLowerCase().includes(query)
    ));
  }, [activeProjects, projectQuery]);
  const visibleAssignees = useMemo(() => {
    const query = normalizeQuery(peopleQuery);
    if (!query) return activeAssignees;
    return activeAssignees.filter((assignee) => assignee.name.toLowerCase().includes(query));
  }, [activeAssignees, peopleQuery]);
  const visibleGroups = useMemo(() => {
    const query = normalizeQuery(groupQuery);
    if (!query) return memberGroups;
    return memberGroups.filter((group) => group.name.toLowerCase().includes(query));
  }, [groupQuery, memberGroups]);
  const visibleStatuses = useMemo(() => {
    const query = normalizeQuery(statusQuery);
    if (!query) return statuses;
    return statuses.filter((status) => (
      formatStatusLabel(status.name, status.emoji).toLowerCase().includes(query)
      || status.name.toLowerCase().includes(query)
    ));
  }, [statusQuery, statuses]);
  const visibleTaskTypes = useMemo(() => {
    const query = normalizeQuery(typeQuery);
    if (!query) return taskTypes;
    return taskTypes.filter((type) => type.name.toLowerCase().includes(query));
  }, [taskTypes, typeQuery]);
  const visibleTags = useMemo(() => {
    const query = normalizeQuery(tagQuery);
    if (!query) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [tagQuery, tags]);
  
  const hasActiveFilters = 
    filters.projectIds.length > 0 ||
    filters.assigneeIds.length > 0 ||
    filters.groupIds.length > 0 ||
    filters.statusIds.length > 0 ||
    filters.typeIds.length > 0 ||
    filters.tagIds.length > 0;
  
  const toggleFilter = (
    type: 'projectIds' | 'assigneeIds' | 'groupIds' | 'statusIds' | 'typeIds' | 'tagIds',
    id: string,
  ) => {
    const current = filters[type];
    const updated = current.includes(id)
      ? current.filter(i => i !== id)
      : [...current, id];
    setFilters({ [type]: updated });
  };
  
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={t`Expand filters`}
        className="w-12 border-r border-border bg-card flex flex-col h-full transition-all duration-200 cursor-pointer"
      >
        <div className="flex flex-col items-center py-3 border-b border-border">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 py-2 space-y-2">
          <div className="flex justify-center p-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
          </div>
          <FilterSection 
            title="" 
            icon={<FolderKanban className="w-4 h-4 text-muted-foreground" />}
            collapsed
          >
            <></>
          </FilterSection>
          <FilterSection 
            title="" 
            icon={<Users className="w-4 h-4 text-muted-foreground" />}
            collapsed
          >
            <></>
          </FilterSection>
          <FilterSection 
            title="" 
            icon={<UsersRound className="w-4 h-4 text-muted-foreground" />}
            collapsed
          >
            <></>
          </FilterSection>
          <FilterSection 
            title="" 
            icon={<CircleDot className="w-4 h-4 text-muted-foreground" />}
            collapsed
          >
            <></>
          </FilterSection>
        </div>
      </button>
    );
  }
  
  return (
    <div className="w-full border-r border-border bg-card flex flex-col h-full transition-all duration-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" />
          <span className="font-semibold text-sm">{t`Filters`}</span>
        </div>
        <div className="flex items-center gap-1">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilterCriteria}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {t`Clear`}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-7 w-7"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <FilterSection 
          title={t`Projects`} 
          icon={<FolderKanban className="w-4 h-4 text-muted-foreground" />}
          defaultOpen={false}
        >
          <Input
            className="h-7 text-xs"
            placeholder={t`Search projects...`}
            value={projectQuery}
            onChange={(event) => setProjectQuery(event.target.value)}
          />
          {activeProjects.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No active projects.`}</div>
          )}
          {activeProjects.length > 0 && filteredProjects.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No matches.`}</div>
          )}
          {filteredProjects.map(project => (
            <label
              key={project.id}
              className="flex items-center gap-2 py-1 cursor-pointer"
            >
              <Checkbox
                checked={filters.projectIds.includes(project.id)}
                onCheckedChange={() => toggleFilter('projectIds', project.id)}
              />
              <div 
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: project.color }}
              />
              <div className="min-w-0">
                <div className="text-sm leading-snug break-words line-clamp-2">{project.name}</div>
                <div className="text-[11px] text-muted-foreground leading-snug break-words line-clamp-1">
                  {project.code ?? t`No code`}
                </div>
              </div>
            </label>
          ))}
          {archivedProjectsCount > 0 && (
            <div className="pt-1 text-[11px] text-muted-foreground">
              {t`Archived projects are hidden from filters.`}
            </div>
          )}
        </FilterSection>
        
        <FilterSection 
          title={t`People`} 
          icon={<Users className="w-4 h-4 text-muted-foreground" />}
          defaultOpen={false}
          disabled={isCalendarView}
        >
          <Input
            className="h-7 text-xs"
            placeholder={t`Search people...`}
            value={peopleQuery}
            onChange={(event) => setPeopleQuery(event.target.value)}
            disabled={isCalendarView}
          />
          {activeAssignees.length > 0 && visibleAssignees.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No matches.`}</div>
          )}
          {activeAssignees.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No active people.`}</div>
          )}
          {visibleAssignees.map(assignee => (
            <label
              key={assignee.id}
              className={`flex items-center gap-2 py-1 ${
                isCalendarView ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <Checkbox
                checked={filters.assigneeIds.includes(assignee.id)}
                onCheckedChange={() => toggleFilter('assigneeIds', assignee.id)}
                disabled={isCalendarView}
              />
              <span className="text-sm truncate">{assignee.name}</span>
            </label>
          ))}
          {disabledAssigneesCount > 0 && (
            <div className="pt-1 text-[11px] text-muted-foreground">
              {t`Disabled people are hidden from filters.`}
            </div>
          )}
        </FilterSection>

        <FilterSection 
          title={t`Groups`} 
          icon={<UsersRound className="w-4 h-4 text-muted-foreground" />}
          defaultOpen={false}
          disabled={isCalendarView}
        >
          <Input
            className="h-7 text-xs"
            placeholder={t`Search groups...`}
            value={groupQuery}
            onChange={(event) => setGroupQuery(event.target.value)}
            disabled={isCalendarView}
          />
          {memberGroups.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No groups yet.`}</div>
          )}
          {memberGroups.length > 0 && visibleGroups.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No matches.`}</div>
          )}
          {visibleGroups.map((group) => (
            <label
              key={group.id}
              className={`flex items-center gap-2 py-1 ${
                isCalendarView ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <Checkbox
                checked={filters.groupIds.includes(group.id)}
                onCheckedChange={() => toggleFilter('groupIds', group.id)}
                disabled={isCalendarView}
              />
              <span className="text-sm truncate">{group.name}</span>
            </label>
          ))}
        </FilterSection>
        
        <FilterSection 
          title={t`Status`} 
          icon={<CircleDot className="w-4 h-4 text-muted-foreground" />}
          defaultOpen={false}
          disabled={isCalendarView}
        >
          <Input
            className="h-7 text-xs"
            placeholder={t`Search status...`}
            value={statusQuery}
            onChange={(event) => setStatusQuery(event.target.value)}
            disabled={isCalendarView}
          />
          {statuses.length > 0 && visibleStatuses.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No matches.`}</div>
          )}
          {visibleStatuses.map(status => (
            <label
              key={status.id}
              className={`flex items-center gap-2 py-1 ${
                isCalendarView ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <Checkbox
                checked={filters.statusIds.includes(status.id)}
                onCheckedChange={() => toggleFilter('statusIds', status.id)}
                disabled={isCalendarView}
              />
              <span className="text-sm truncate">{formatStatusLabel(status.name, status.emoji)}</span>
            </label>
          ))}
        </FilterSection>
        
        <FilterSection 
          title={t`Type`} 
          icon={<Layers className="w-4 h-4 text-muted-foreground" />}
          defaultOpen={false}
          disabled={isCalendarView}
        >
          <Input
            className="h-7 text-xs"
            placeholder={t`Search types...`}
            value={typeQuery}
            onChange={(event) => setTypeQuery(event.target.value)}
            disabled={isCalendarView}
          />
          {taskTypes.length > 0 && visibleTaskTypes.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No matches.`}</div>
          )}
          {visibleTaskTypes.map(type => (
            <label
              key={type.id}
              className={`flex items-center gap-2 py-1 ${
                isCalendarView ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <Checkbox
                checked={filters.typeIds.includes(type.id)}
                onCheckedChange={() => toggleFilter('typeIds', type.id)}
                disabled={isCalendarView}
              />
              <span className="text-sm truncate">{type.name}</span>
            </label>
          ))}
        </FilterSection>
        
        <FilterSection 
          title={t`Tags`} 
          icon={<Tag className="w-4 h-4 text-muted-foreground" />}
          defaultOpen={false}
          disabled={isCalendarView}
        >
          <Input
            className="h-7 text-xs"
            placeholder={t`Search tags...`}
            value={tagQuery}
            onChange={(event) => setTagQuery(event.target.value)}
            disabled={isCalendarView}
          />
          {tags.length > 0 && visibleTags.length === 0 && (
            <div className="text-xs text-muted-foreground">{t`No matches.`}</div>
          )}
          {visibleTags.map(tag => (
            <label
              key={tag.id}
              className={`flex items-center gap-2 py-1 ${
                isCalendarView ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <Checkbox
                checked={filters.tagIds.includes(tag.id)}
                onCheckedChange={() => toggleFilter('tagIds', tag.id)}
                disabled={isCalendarView}
              />
              <div 
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-sm truncate">{tag.name}</span>
            </label>
          ))}
        </FilterSection>
      </ScrollArea>
    </div>
  );
};
