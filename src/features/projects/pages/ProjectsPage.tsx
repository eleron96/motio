import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { MilestoneDialog } from '@/features/planner/components/timeline/MilestoneDialog';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';
import { WorkspaceNav } from '@/features/workspace/components/WorkspaceNav';
import { SettingsPanel } from '@/features/workspace/components/SettingsPanel';
import { AccountSettingsDialog } from '@/features/auth/components/AccountSettingsDialog';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Badge } from '@/shared/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Checkbox } from '@/shared/ui/checkbox';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { t } from '@lingui/macro';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { ColorPicker } from '@/shared/ui/color-picker';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/shared/ui/resizable';
import { supabase } from '@/shared/lib/supabaseClient';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { compareNames } from '@/shared/lib/nameSorting';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import {
  ArrowDownAZ,
  ArrowDownZA,
  CalendarDays,
  ChevronDown,
  Filter,
  Layers,
  Settings,
  User,
  Plus,
  RefreshCcw,
  Star,
} from 'lucide-react';
import { Customer, Milestone, Project, Task } from '@/features/planner/types/planner';
import DOMPurify from 'dompurify';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';

type TaskRow = {
  id: string;
  title: string;
  project_id: string | null;
  assignee_id: string | null;
  assignee_ids: string[] | null;
  start_date: string;
  end_date: string;
  status_id: string;
  type_id: string;
  priority: string | null;
  tag_ids: string[] | null;
  description: string | null;
  repeat_id: string | null;
};

type DisplayTaskRow = {
  key: string;
  task: Task;
  repeatMeta: {
    label: string;
    remaining: number;
    total: number;
  } | null;
};

type MilestoneGroupBy = 'project' | 'customer' | 'month';

const normalizeAssigneeIds = (assigneeIds: string[] | null | undefined, legacyId: string | null | undefined) => {
  const combined = [
    ...(assigneeIds ?? []),
    ...(legacyId ? [legacyId] : []),
  ];
  return Array.from(new Set(combined.filter(Boolean)));
};

const mapTaskRow = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  projectId: row.project_id,
  assigneeIds: normalizeAssigneeIds(row.assignee_ids, row.assignee_id),
  startDate: row.start_date,
  endDate: row.end_date,
  statusId: row.status_id,
  typeId: row.type_id,
  priority: row.priority as Task['priority'],
  tagIds: row.tag_ids ?? [],
  description: row.description,
  repeatId: row.repeat_id ?? null,
});

const hasRichTags = (value: string) => (
  /<\/?(b|strong|i|em|u|s|strike|ul|ol|li|blockquote|br|div|p|span|img)\b/i.test(value)
);

const sanitizeDescription = (value: string) => (
  DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'strike',
      'ul',
      'ol',
      'li',
      'blockquote',
      'br',
      'div',
      'p',
      'span',
      'img',
    ],
    ALLOWED_ATTR: ['src', 'alt', 'style', 'width', 'height'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data:image\/)|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  })
);

const inferRepeatLabel = (tasks: Task[]) => {
  if (tasks.length < 2) return 'Повторяющаяся';
  const sorted = [...tasks].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const first = parseISO(sorted[0].startDate);
  const second = parseISO(sorted[1].startDate);
  const diffDays = Math.abs(differenceInCalendarDays(second, first));
  if (diffDays === 1) return 'Ежедневная';
  if (diffDays === 7) return 'Еженедельная';
  if (diffDays >= 28 && diffDays <= 31) return 'Ежемесячная';
  if (diffDays >= 364 && diffDays <= 366) return 'Ежегодная';
  return 'Повторяющаяся';
};

const CustomerCombobox: React.FC<{
  value: string | null;
  customers: Customer[];
  onChange: (value: string | null) => void;
  onCreateCustomer: (name: string) => Promise<Customer | null>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}> = ({
  value,
  customers,
  onChange,
  onCreateCustomer,
  disabled,
  placeholder = t`No customer`,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim();
  const normalizedLower = normalizedQuery.toLowerCase();
  const filteredCustomers = useMemo(() => {
    if (!normalizedLower) return customers;
    return customers.filter((customer) => customer.name.toLowerCase().includes(normalizedLower));
  }, [customers, normalizedLower]);
  const exactMatch = useMemo(() => (
    normalizedLower
      ? customers.find((customer) => customer.name.trim().toLowerCase() === normalizedLower)
      : null
  ), [customers, normalizedLower]);
  const selectedLabel = value
    ? customers.find((customer) => customer.id === value)?.name ?? placeholder
    : placeholder;

  const handleSelect = (nextValue: string | null) => {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  };

  const handleCreate = async () => {
    if (!normalizedQuery) return;
    if (exactMatch) {
      handleSelect(exactMatch.id);
      return;
    }
    const created = await onCreateCustomer(normalizedQuery);
    if (created) {
      handleSelect(created.id);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between ${className ?? ''}`}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start" portalled={false}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t`Find or add customer...`}
            value={query}
            onValueChange={setQuery}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (normalizedQuery) {
                  void handleCreate();
                }
              }
            }}
          />
          <CommandList
            className="max-h-60 overscroll-contain"
            onWheel={(event) => {
              event.stopPropagation();
            }}
          >
            <CommandEmpty>{t`No customers found.`}</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => handleSelect(null)}>
                {t`No customer`}
              </CommandItem>
              {normalizedQuery && !exactMatch && (
                <CommandItem onSelect={() => void handleCreate()}>
                  {t`Create "${normalizedQuery}"`}
                </CommandItem>
              )}
              {filteredCustomers.map((customer) => (
                <CommandItem key={customer.id} onSelect={() => handleSelect(customer.id)}>
                  {customer.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const ProjectsPage = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [search, setSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [statusFilterIds, setStatusFilterIds] = useState<string[]>([]);
  const [assigneeFilterIds, setAssigneeFilterIds] = useState<string[]>([]);
  const [customerFilterIds, setCustomerFilterIds] = useState<string[]>([]);
  const [nameSort, setNameSort] = useState<'asc' | 'desc'>('asc');
  const [groupByCustomer, setGroupByCustomer] = useState(false);
  const [mode, setMode] = useState<'projects' | 'milestones' | 'customers'>('projects');
  const [milestoneSearch, setMilestoneSearch] = useState('');
  const [milestoneTab, setMilestoneTab] = useState<'active' | 'past'>('active');
  const [milestoneGroupBy, setMilestoneGroupBy] = useState<MilestoneGroupBy>('project');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectConfirmOpen, setCreateProjectConfirmOpen] = useState(false);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogDate, setMilestoneDialogDate] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [projectSettingsTarget, setProjectSettingsTarget] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#3b82f6');
  const [newProjectCustomerId, setNewProjectCustomerId] = useState<string | null>(null);
  const [projectSettingsName, setProjectSettingsName] = useState('');
  const [projectSettingsCode, setProjectSettingsCode] = useState('');
  const [projectSettingsColor, setProjectSettingsColor] = useState('#3b82f6');
  const [projectSettingsCustomerId, setProjectSettingsCustomerId] = useState<string | null>(null);
  const [projectSettingsConfirmOpen, setProjectSettingsConfirmOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingCustomerName, setEditingCustomerName] = useState('');
  const [editingCustomerOriginalName, setEditingCustomerOriginalName] = useState('');
  const [renameCustomerOpen, setRenameCustomerOpen] = useState(false);
  const [renameCustomerConfirmOpen, setRenameCustomerConfirmOpen] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<Milestone | null>(null);
  const [deleteMilestoneOpen, setDeleteMilestoneOpen] = useState(false);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [deleteCustomerOpen, setDeleteCustomerOpen] = useState(false);

  const {
    projects,
    milestones,
    trackedProjectIds,
    customers,
    statuses,
    assignees,
    taskTypes,
    tags,
    loadWorkspaceData,
    addProject,
    addCustomer,
    updateProject,
    updateCustomer,
    deleteCustomer,
    deleteProject,
    deleteMilestone,
    toggleTrackedProject,
    setHighlightedTaskId,
    setViewMode,
    setCurrentDate,
    requestScrollToDate,
    clearFilters,
  } = usePlannerStore();

  const {
    user,
    currentWorkspaceId,
    currentWorkspaceRole,
    isSuperAdmin,
  } = useAuthStore();

  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const projectsViewPrefsStorageKey = currentWorkspaceId
    ? `projects-view-prefs-${currentWorkspaceId}`
    : user?.id
      ? `projects-view-prefs-user-${user.id}`
      : 'projects-view-prefs';
  const projectsViewPrefsHydratedRef = useRef(false);

  useEffect(() => {
    if (currentWorkspaceId) {
      loadWorkspaceData(currentWorkspaceId);
    }
  }, [currentWorkspaceId, loadWorkspaceData]);

  useEffect(() => {
    projectsViewPrefsHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(projectsViewPrefsStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<{
          nameSort: 'asc' | 'desc';
          groupByCustomer: boolean;
          milestoneTab: 'active' | 'past';
          milestoneGroupBy: MilestoneGroupBy;
        }>;
        if (parsed.nameSort === 'asc' || parsed.nameSort === 'desc') {
          setNameSort(parsed.nameSort);
        }
        if (typeof parsed.groupByCustomer === 'boolean') {
          setGroupByCustomer(parsed.groupByCustomer);
        }
        if (parsed.milestoneTab === 'active' || parsed.milestoneTab === 'past') {
          setMilestoneTab(parsed.milestoneTab);
        }
        if (parsed.milestoneGroupBy === 'project' || parsed.milestoneGroupBy === 'customer' || parsed.milestoneGroupBy === 'month') {
          setMilestoneGroupBy(parsed.milestoneGroupBy);
        }
      } catch {
        // Ignore invalid localStorage payload and keep defaults.
      }
    }
    projectsViewPrefsHydratedRef.current = true;
  }, [projectsViewPrefsStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!projectsViewPrefsHydratedRef.current) return;
    window.localStorage.setItem(projectsViewPrefsStorageKey, JSON.stringify({
      nameSort,
      groupByCustomer,
      milestoneTab,
      milestoneGroupBy,
    }));
  }, [groupByCustomer, milestoneGroupBy, milestoneTab, nameSort, projectsViewPrefsStorageKey]);

  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => !project.archived),
      trackedProjectIds,
      nameSort,
    ),
    [projects, trackedProjectIds, nameSort],
  );
  const archivedProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => project.archived),
      trackedProjectIds,
      nameSort,
    ),
    [projects, trackedProjectIds, nameSort],
  );
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => compareNames(a.name, b.name, nameSort));
  }, [customers, nameSort]);
  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const filteredCustomers = useMemo(() => {
    if (!normalizedCustomerSearch) return sortedCustomers;
    return sortedCustomers.filter((customer) => customer.name.toLowerCase().includes(normalizedCustomerSearch));
  }, [normalizedCustomerSearch, sortedCustomers]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const statusById = useMemo(
    () => new Map(statuses.map((status) => [status.id, status])),
    [statuses],
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee])),
    [assignees],
  );
  const taskTypeById = useMemo(
    () => new Map(taskTypes.map((type) => [type.id, type])),
    [taskTypes],
  );
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );

  const projectAssigneeIds = useMemo(() => {
    const ids = new Set<string>();
    projectTasks.forEach((task) => {
      task.assigneeIds.forEach((id) => ids.add(id));
    });
    return ids;
  }, [projectTasks]);

  const assigneeOptions = useMemo(
    () => assignees.filter((assignee) => projectAssigneeIds.has(assignee.id)),
    [assignees, projectAssigneeIds],
  );

  const customerProjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((project) => {
      const key = project.customerId ?? 'none';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [projects]);

  const matchesCustomerFilter = useCallback((project: Project) => {
    if (customerFilterIds.length === 0) return true;
    const targetId = project.customerId ?? 'none';
    return customerFilterIds.includes(targetId);
  }, [customerFilterIds]);

  const matchesProjectSearch = useCallback((project: Project) => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return true;
    return project.name.toLowerCase().includes(query);
  }, [projectSearch]);

  const filteredActiveProjects = useMemo(
    () => activeProjects.filter((project) => matchesCustomerFilter(project) && matchesProjectSearch(project)),
    [activeProjects, matchesCustomerFilter, matchesProjectSearch],
  );

  const filteredArchivedProjects = useMemo(
    () => archivedProjects.filter((project) => matchesCustomerFilter(project) && matchesProjectSearch(project)),
    [archivedProjects, matchesCustomerFilter, matchesProjectSearch],
  );
  const trackedProjectIdSet = useMemo(() => new Set(trackedProjectIds), [trackedProjectIds]);
  const normalizedMilestoneSearch = milestoneSearch.trim().toLowerCase();
  const todayMilestoneKey = format(new Date(), 'yyyy-MM-dd');
  const filteredMilestones = useMemo(() => {
    const matchesSearch = (milestone: Milestone) => {
      if (!normalizedMilestoneSearch) return true;
      const project = projectById.get(milestone.projectId);
      const customer = project?.customerId ? customerById.get(project.customerId) : null;
      return [
        milestone.title,
        project?.name ?? '',
        project?.code ?? '',
        customer?.name ?? '',
      ].join(' ').toLowerCase().includes(normalizedMilestoneSearch);
    };

    return milestones
      .filter(matchesSearch)
      .sort((left, right) => {
        const leftTracked = trackedProjectIdSet.has(left.projectId);
        const rightTracked = trackedProjectIdSet.has(right.projectId);
        if (leftTracked !== rightTracked) return leftTracked ? -1 : 1;
        const byDate = left.date.localeCompare(right.date);
        if (byDate !== 0) return byDate;
        const byTitle = compareNames(left.title, right.title, nameSort);
        if (byTitle !== 0) return byTitle;
        const leftProjectName = projectById.get(left.projectId)?.name ?? '';
        const rightProjectName = projectById.get(right.projectId)?.name ?? '';
        return compareNames(leftProjectName, rightProjectName, nameSort);
      });
  }, [customerById, milestones, nameSort, normalizedMilestoneSearch, projectById, trackedProjectIdSet]);
  const filteredActiveMilestones = useMemo(() => {
    return filteredMilestones.filter((milestone) => milestone.date >= todayMilestoneKey);
  }, [filteredMilestones, todayMilestoneKey]);
  const filteredPastMilestones = useMemo(() => {
    return filteredMilestones.filter((milestone) => milestone.date < todayMilestoneKey);
  }, [filteredMilestones, todayMilestoneKey]);
  const visibleMilestones = milestoneTab === 'active' ? filteredActiveMilestones : filteredPastMilestones;
  const groupedMilestones = useMemo(() => {
    const buckets = new Map<string, Milestone[]>();
    visibleMilestones.forEach((milestone) => {
      if (milestoneGroupBy === 'project') {
        const key = projectById.has(milestone.projectId) ? milestone.projectId : 'missing-project';
        const list = buckets.get(key) ?? [];
        list.push(milestone);
        buckets.set(key, list);
        return;
      }

      if (milestoneGroupBy === 'customer') {
        const project = projectById.get(milestone.projectId);
        const key = project ? (project.customerId ?? 'none') : 'missing-project';
        const list = buckets.get(key) ?? [];
        list.push(milestone);
        buckets.set(key, list);
        return;
      }

      const monthKey = format(parseISO(milestone.date), 'yyyy-MM');
      const list = buckets.get(monthKey) ?? [];
      list.push(milestone);
      buckets.set(monthKey, list);
    });

    if (milestoneGroupBy === 'project') {
      const orderedProjects = sortProjectsByTracking(projects, trackedProjectIds, nameSort);
      const result = orderedProjects
        .map((project) => {
          const list = buckets.get(project.id) ?? [];
          if (list.length === 0) return null;
          return {
            id: project.id,
            name: formatProjectLabel(project.name, project.code),
            milestones: list,
          };
        })
        .filter((item): item is { id: string; name: string; milestones: Milestone[] } => Boolean(item));
      const missing = buckets.get('missing-project');
      if (missing && missing.length > 0) {
        result.push({ id: 'missing-project', name: t`Unknown project`, milestones: missing });
      }
      return result;
    }

    if (milestoneGroupBy === 'customer') {
      const result = sortedCustomers
        .map((customer) => {
          const list = buckets.get(customer.id) ?? [];
          if (list.length === 0) return null;
          return {
            id: customer.id,
            name: customer.name,
            milestones: list,
          };
        })
        .filter((item): item is { id: string; name: string; milestones: Milestone[] } => Boolean(item));
      const noCustomer = buckets.get('none');
      if (noCustomer && noCustomer.length > 0) {
        result.push({ id: 'none', name: t`No customer`, milestones: noCustomer });
      }
      const missing = buckets.get('missing-project');
      if (missing && missing.length > 0) {
        result.push({ id: 'missing-project', name: t`Unknown project`, milestones: missing });
      }
      return result;
    }

    return Array.from(buckets.entries())
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([monthKey, list]) => ({
        id: monthKey,
        name: format(parseISO(`${monthKey}-01`), 'LLLL yyyy', { locale: dateLocale }),
        milestones: list,
      }));
  }, [dateLocale, milestoneGroupBy, nameSort, projectById, projects, sortedCustomers, trackedProjectIds, visibleMilestones]);
  const selectedMilestone = useMemo(
    () => milestones.find((milestone) => milestone.id === selectedMilestoneId) ?? null,
    [milestones, selectedMilestoneId],
  );
  const selectedMilestoneProject = useMemo(
    () => (selectedMilestone ? projectById.get(selectedMilestone.projectId) ?? null : null),
    [projectById, selectedMilestone],
  );
  const selectedMilestoneCustomer = useMemo(() => (
    selectedMilestoneProject?.customerId ? customerById.get(selectedMilestoneProject.customerId) ?? null : null
  ), [customerById, selectedMilestoneProject?.customerId]);
  const milestoneGroupLabel = useMemo(() => {
    if (milestoneGroupBy === 'project') return t`Project`;
    if (milestoneGroupBy === 'customer') return t`Customer`;
    return t`Month`;
  }, [milestoneGroupBy]);

  useEffect(() => {
    const list = tab === 'active' ? filteredActiveProjects : filteredArchivedProjects;
    if (list.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !list.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(list[0].id);
    }
  }, [filteredActiveProjects, filteredArchivedProjects, selectedProjectId, tab]);

  const fetchProjectTasks = useCallback(async (projectId: string) => {
    if (!currentWorkspaceId) return;
    setTasksLoading(true);
    setTasksError('');
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', currentWorkspaceId)
      .eq('project_id', projectId)
      .order('start_date', { ascending: true });
    if (error) {
      setTasksError(error.message);
      setTasksLoading(false);
      return;
    }
    setProjectTasks((data ?? []).map((row) => mapTaskRow(row as TaskRow)));
    setTasksLoading(false);
  }, [currentWorkspaceId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectTasks([]);
      setSelectedTaskId(null);
      return;
    }
    fetchProjectTasks(selectedProjectId);
  }, [fetchProjectTasks, selectedProjectId]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (!projectTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [projectTasks, selectedTaskId]);

  const selectedTask = useMemo(
    () => projectTasks.find((task) => task.id === selectedTaskId) ?? null,
    [projectTasks, selectedTaskId],
  );

  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === selectedTask?.projectId) ?? null,
    [projects, selectedTask?.projectId],
  );
  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customerById.get(selectedCustomerId) ?? null : null),
    [customerById, selectedCustomerId],
  );
  const selectedCustomerProjects = useMemo(() => {
    if (!selectedCustomerId) return [];
    return sortProjectsByTracking(
      projects.filter((project) => project.customerId === selectedCustomerId),
      trackedProjectIds,
    );
  }, [projects, selectedCustomerId, trackedProjectIds]);
  const selectedTaskCustomer = useMemo(() => (
    selectedTaskProject?.customerId ? customerById.get(selectedTaskProject.customerId) ?? null : null
  ), [customerById, selectedTaskProject?.customerId]);

  const selectedTaskTags = useMemo(() => (
    selectedTask?.tagIds.map((tagId) => tagById.get(tagId)).filter(Boolean) ?? []
  ), [selectedTask?.tagIds, tagById]);

  const selectedTaskDescription = useMemo(() => {
    if (!selectedTask?.description) return '';
    if (!hasRichTags(selectedTask.description)) return selectedTask.description;
    return sanitizeDescription(selectedTask.description);
  }, [selectedTask?.description]);

  const navigate = useNavigate();

  const handleOpenTaskInTimeline = useCallback(() => {
    if (!selectedTask) return;
    setHighlightedTaskId(selectedTask.id);
    clearFilters();
    if (user?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(`planner-filters-${user.id}`);
    }
    setViewMode('week');
    setCurrentDate(selectedTask.startDate);
    requestScrollToDate(selectedTask.startDate);
    setSelectedTaskId(null);
    navigate('/');
  }, [
    clearFilters,
    navigate,
    requestScrollToDate,
    selectedTask,
    setHighlightedTaskId,
    setCurrentDate,
    setSelectedTaskId,
    setViewMode,
    user?.id,
  ]);

  const filteredTasks = useMemo(() => (
    projectTasks.filter((task) => {
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        if (!task.title.toLowerCase().includes(query)) return false;
      }
      if (statusFilterIds.length > 0 && !statusFilterIds.includes(task.statusId)) {
        return false;
      }
      if (assigneeFilterIds.length > 0) {
        if (!task.assigneeIds.some((id) => assigneeFilterIds.includes(id))) return false;
      }
      return true;
    })
  ), [assigneeFilterIds, projectTasks, search, statusFilterIds]);

  const displayTaskRows = useMemo<DisplayTaskRow[]>(() => {
    const repeatBuckets = new Map<string, Task[]>();
    const rows: DisplayTaskRow[] = [];

    filteredTasks.forEach((task) => {
      if (!task.repeatId) {
        rows.push({
          key: task.id,
          task,
          repeatMeta: null,
        });
        return;
      }
      const bucket = repeatBuckets.get(task.repeatId) ?? [];
      bucket.push(task);
      repeatBuckets.set(task.repeatId, bucket);
    });

    repeatBuckets.forEach((tasks, repeatId) => {
      const sorted = [...tasks].sort((left, right) => left.startDate.localeCompare(right.startDate));
      rows.push({
        key: `repeat:${repeatId}`,
        task: sorted[0],
        repeatMeta: {
          label: inferRepeatLabel(sorted),
          remaining: Math.max(0, sorted.length - 1),
          total: sorted.length,
        },
      });
    });

    rows.sort((left, right) => {
      const byStart = left.task.startDate.localeCompare(right.task.startDate);
      if (byStart !== 0) return byStart;
      const byEnd = left.task.endDate.localeCompare(right.task.endDate);
      if (byEnd !== 0) return byEnd;
      return left.task.title.localeCompare(right.task.title);
    });

    return rows;
  }, [filteredTasks]);

  const statusFilterLabel = statusFilterIds.length === 0
    ? t`All statuses`
    : t`${statusFilterIds.length} selected`;

  const assigneeFilterLabel = assigneeFilterIds.length === 0
    ? t`All assignees`
    : t`${assigneeFilterIds.length} selected`;

  const customerFilterLabel = customerFilterIds.length === 0
    ? t`All`
    : t`${customerFilterIds.length} selected`;

  const nameSortLabel = nameSort === 'asc' ? t`A-Z` : t`Z-A`;

  const modeToggle = (
    <div className="inline-flex items-center gap-2 rounded-lg bg-muted/60 p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMode('projects')}
        className={`h-7 px-3 text-xs rounded-md ${mode === 'projects' ? 'bg-foreground text-background shadow-sm' : ''}`}
      >
        {t`Projects`}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMode('milestones')}
        className={`h-7 px-3 text-xs rounded-md ${mode === 'milestones' ? 'bg-foreground text-background shadow-sm' : ''}`}
      >
        {t`Milestones`}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMode('customers')}
        className={`h-7 px-3 text-xs rounded-md ${mode === 'customers' ? 'bg-foreground text-background shadow-sm' : ''}`}
      >
        {t`Customers`}
      </Button>
    </div>
  );

  const handleToggleStatus = (statusId: string) => {
    setStatusFilterIds((current) => (
      current.includes(statusId)
        ? current.filter((id) => id !== statusId)
        : [...current, statusId]
    ));
  };

  const handleToggleAssignee = (assigneeId: string) => {
    setAssigneeFilterIds((current) => (
      current.includes(assigneeId)
        ? current.filter((id) => id !== assigneeId)
        : [...current, assigneeId]
    ));
  };

  const handleToggleCustomer = (customerId: string) => {
    setCustomerFilterIds((current) => (
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    ));
  };

  const setStatusPreset = (mode: 'all' | 'open' | 'done') => {
    if (mode === 'all') {
      setStatusFilterIds([]);
      return;
    }
    const targetIds = statuses
      .filter((status) => (mode === 'done'
        ? (status.isFinal || status.isCancelled)
        : (!status.isFinal && !status.isCancelled)))
      .map((status) => status.id);
    setStatusFilterIds(targetIds);
  };

  const resetCreateProjectForm = useCallback(() => {
    setNewProjectName('');
    setNewProjectCode('');
    setNewProjectColor('#3b82f6');
    setNewProjectCustomerId(null);
    setEditingCustomerId(null);
    setEditingCustomerName('');
  }, []);

  const handleCreateProject = useCallback(async () => {
    if (!canEdit || !newProjectName.trim()) return;
    await addProject({
      name: newProjectName.trim(),
      code: newProjectCode.trim() ? newProjectCode.trim() : null,
      color: newProjectColor,
      archived: false,
      customerId: newProjectCustomerId,
    });
    setCreateProjectOpen(false);
    resetCreateProjectForm();
  }, [
    addProject,
    canEdit,
    newProjectCode,
    newProjectColor,
    newProjectCustomerId,
    newProjectName,
    resetCreateProjectForm,
  ]);

  const createCustomerByName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!canEdit || !trimmed) return null;
    const normalized = trimmed.toLowerCase();
    const existing = customers.find((customer) => customer.name.trim().toLowerCase() === normalized);
    if (existing) return existing;
    return addCustomer({ name: trimmed });
  }, [addCustomer, canEdit, customers]);

  const handleAddCustomerFromTab = useCallback(async () => {
    if (!newCustomerName.trim()) return;
    const created = await createCustomerByName(newCustomerName);
    if (created) {
      setSelectedCustomerId(created.id);
    }
    setNewCustomerName('');
    setCreateCustomerOpen(false);
  }, [createCustomerByName, newCustomerName]);

  const startCustomerEdit = useCallback((customerId: string, customerName: string) => {
    if (!canEdit) return;
    setEditingCustomerId(customerId);
    setEditingCustomerName(customerName);
    setEditingCustomerOriginalName(customerName);
    setRenameCustomerOpen(true);
  }, [canEdit]);

  const commitCustomerEdit = useCallback(async (customerId: string) => {
    if (!canEdit) return;
    const nextName = editingCustomerName.trim();
    if (!nextName) {
      setEditingCustomerId(null);
      setEditingCustomerName('');
      setEditingCustomerOriginalName('');
      return;
    }
    await updateCustomer(customerId, { name: nextName });
    setEditingCustomerId(null);
    setEditingCustomerName('');
    setEditingCustomerOriginalName('');
  }, [canEdit, editingCustomerName, updateCustomer]);

  const cancelCustomerEdit = useCallback(() => {
    setEditingCustomerId(null);
    setEditingCustomerName('');
    setEditingCustomerOriginalName('');
  }, []);
  const handleRenameCustomer = useCallback(async () => {
    if (!editingCustomerId) return;
    await commitCustomerEdit(editingCustomerId);
    setRenameCustomerOpen(false);
  }, [commitCustomerEdit, editingCustomerId]);
  const requestCloseRenameCustomer = useCallback(() => {
    if (
      editingCustomerId
      && editingCustomerName.trim()
      && editingCustomerName.trim() !== editingCustomerOriginalName.trim()
    ) {
      setRenameCustomerConfirmOpen(true);
      return;
    }
    setRenameCustomerOpen(false);
    cancelCustomerEdit();
  }, [cancelCustomerEdit, editingCustomerId, editingCustomerName, editingCustomerOriginalName]);

  const openProjectSettings = useCallback((project: Project) => {
    if (!canEdit) return;
    setProjectSettingsTarget(project);
    setProjectSettingsName(project.name);
    setProjectSettingsCode(project.code ?? '');
    setProjectSettingsColor(project.color);
    setProjectSettingsCustomerId(project.customerId ?? null);
    setProjectSettingsOpen(true);
  }, [canEdit]);

  const handleSaveProjectSettings = useCallback(async () => {
    if (!canEdit || !projectSettingsTarget) return;
    const nextName = projectSettingsName.trim();
    if (!nextName) return;
    const nextCode = projectSettingsCode.trim();
    const normalizedCode = nextCode ? nextCode : null;
    const updates: Partial<Project> = {};
    if (nextName !== projectSettingsTarget.name) updates.name = nextName;
    if ((projectSettingsTarget.code ?? null) !== normalizedCode) updates.code = normalizedCode;
    if (projectSettingsColor !== projectSettingsTarget.color) updates.color = projectSettingsColor;
    if (projectSettingsCustomerId !== projectSettingsTarget.customerId) {
      updates.customerId = projectSettingsCustomerId;
    }
    if (Object.keys(updates).length > 0) {
      await updateProject(projectSettingsTarget.id, updates);
    }
    setProjectSettingsOpen(false);
  }, [
    canEdit,
    projectSettingsCode,
    projectSettingsColor,
    projectSettingsCustomerId,
    projectSettingsName,
    projectSettingsTarget,
    updateProject,
  ]);

  const projectSettingsHasUnsavedChanges = useMemo(() => {
    if (!projectSettingsTarget) return false;
    const nextName = projectSettingsName.trim();
    const nextCode = projectSettingsCode.trim();
    const normalizedCode = nextCode ? nextCode : null;

    if (nextName !== projectSettingsTarget.name.trim()) return true;
    if ((projectSettingsTarget.code ?? null) !== normalizedCode) return true;
    if (projectSettingsColor !== projectSettingsTarget.color) return true;
    if (projectSettingsCustomerId !== projectSettingsTarget.customerId) return true;

    return false;
  }, [
    projectSettingsCode,
    projectSettingsColor,
    projectSettingsCustomerId,
    projectSettingsName,
    projectSettingsTarget,
  ]);

  const requestCloseProjectSettings = useCallback(() => {
    if (projectSettingsHasUnsavedChanges) {
      setProjectSettingsConfirmOpen(true);
      return;
    }
    setProjectSettingsOpen(false);
  }, [projectSettingsHasUnsavedChanges]);

  const createProjectHasUnsavedChanges = useMemo(() => (
    newProjectName.trim().length > 0
    || newProjectCode.trim().length > 0
    || newProjectColor !== '#3b82f6'
    || newProjectCustomerId !== null
  ), [newProjectCode, newProjectColor, newProjectCustomerId, newProjectName]);

  const requestCloseCreateProject = useCallback(() => {
    if (createProjectHasUnsavedChanges) {
      setCreateProjectConfirmOpen(true);
      return;
    }
    setCreateProjectOpen(false);
  }, [createProjectHasUnsavedChanges]);

  const requestDeleteProject = useCallback((project: Project) => {
    if (!canEdit) return;
    setDeleteProjectTarget(project);
    setDeleteProjectOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteProject = useCallback(() => {
    if (!deleteProjectTarget) return;
    deleteProject(deleteProjectTarget.id);
    setDeleteProjectOpen(false);
    setDeleteProjectTarget(null);
  }, [deleteProject, deleteProjectTarget]);

  const formatMilestoneDate = useCallback((date: string) => (
    format(parseISO(date), 'dd MMM yyyy', { locale: dateLocale })
  ), [dateLocale]);

  const handleCycleMilestoneGroup = useCallback(() => {
    setMilestoneGroupBy((current) => {
      if (current === 'project') return 'customer';
      if (current === 'customer') return 'month';
      return 'project';
    });
  }, []);

  const handleOpenProjectFromMilestone = useCallback((milestone: Milestone) => {
    const project = projectById.get(milestone.projectId);
    if (!project) return;
    setMode('projects');
    setTab(project.archived ? 'archived' : 'active');
    setSelectedProjectId(project.id);
  }, [projectById]);

  const handleOpenCreateMilestone = useCallback(() => {
    setEditingMilestone(null);
    setMilestoneDialogDate(selectedMilestone?.date ?? format(new Date(), 'yyyy-MM-dd'));
    setMilestoneDialogOpen(true);
  }, [selectedMilestone?.date]);

  const handleOpenMilestoneSettings = useCallback((milestone: Milestone) => {
    setEditingMilestone(milestone);
    setMilestoneDialogDate(null);
    setMilestoneDialogOpen(true);
  }, []);

  const handleMilestoneDialogOpenChange = useCallback((open: boolean) => {
    setMilestoneDialogOpen(open);
    if (!open) {
      setEditingMilestone(null);
      setMilestoneDialogDate(null);
    }
  }, []);

  const requestDeleteMilestone = useCallback((milestone: Milestone) => {
    if (!canEdit) return;
    setDeleteMilestoneTarget(milestone);
    setDeleteMilestoneOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteMilestone = useCallback(async () => {
    if (!deleteMilestoneTarget) return;
    await deleteMilestone(deleteMilestoneTarget.id);
    if (selectedMilestoneId === deleteMilestoneTarget.id) {
      setSelectedMilestoneId(null);
    }
    setDeleteMilestoneOpen(false);
    setDeleteMilestoneTarget(null);
  }, [deleteMilestone, deleteMilestoneTarget, selectedMilestoneId]);

  const requestDeleteCustomer = useCallback((customer: Customer) => {
    if (!canEdit) return;
    setDeleteCustomerTarget(customer);
    setDeleteCustomerOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteCustomer = useCallback(() => {
    if (!deleteCustomerTarget) return;
    deleteCustomer(deleteCustomerTarget.id);
    if (selectedCustomerId === deleteCustomerTarget.id) {
      setSelectedCustomerId(null);
    }
    setDeleteCustomerOpen(false);
    setDeleteCustomerTarget(null);
  }, [deleteCustomer, deleteCustomerTarget, selectedCustomerId]);

  useEffect(() => {
    if (!createProjectOpen) {
      resetCreateProjectForm();
      setCreateProjectConfirmOpen(false);
    }
  }, [createProjectOpen, resetCreateProjectForm]);

  useEffect(() => {
    if (!projectSettingsOpen) {
      setProjectSettingsTarget(null);
      setProjectSettingsConfirmOpen(false);
    }
  }, [projectSettingsOpen]);

  const deleteProjectLabel = deleteProjectTarget
    ? formatProjectLabel(deleteProjectTarget.name, deleteProjectTarget.code)
    : t`this project`;
  const deleteMilestoneLabel = deleteMilestoneTarget?.title ?? t`this milestone`;
  const deleteCustomerLabel = deleteCustomerTarget?.name ?? t`this customer`;

  useEffect(() => {
    if (mode !== 'customers') return;
    if (filteredCustomers.length === 0) {
      setSelectedCustomerId(null);
      return;
    }
    if (!selectedCustomerId || !filteredCustomers.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(filteredCustomers[0].id);
    }
  }, [filteredCustomers, mode, selectedCustomerId]);

  useEffect(() => {
    if (mode !== 'milestones') return;
    if (visibleMilestones.length === 0) {
      setSelectedMilestoneId(null);
      return;
    }
    if (!selectedMilestoneId || !visibleMilestones.some((milestone) => milestone.id === selectedMilestoneId)) {
      setSelectedMilestoneId(visibleMilestones[0].id);
    }
  }, [mode, selectedMilestoneId, visibleMilestones]);

  const groupedProjects = useCallback((list: Project[]) => {
    if (!groupByCustomer) {
      return [
        { id: 'all', name: t`All projects`, projects: list },
      ];
    }

    const grouped = new Map<string, Project[]>();
    list.forEach((project) => {
      const key = project.customerId ?? 'none';
      const bucket = grouped.get(key) ?? [];
      bucket.push(project);
      grouped.set(key, bucket);
    });

    const result: Array<{ id: string; name: string; projects: Project[] }> = [];
    sortedCustomers.forEach((customer) => {
      const bucket = grouped.get(customer.id);
      if (bucket && bucket.length > 0) {
        result.push({ id: customer.id, name: customer.name, projects: sortProjectsByTracking(bucket, trackedProjectIds) });
      }
    });

    const noCustomer = grouped.get('none');
    if (noCustomer && noCustomer.length > 0) {
      result.push({ id: 'none', name: t`No customer`, projects: sortProjectsByTracking(noCustomer, trackedProjectIds) });
    }

    return result;
  }, [groupByCustomer, sortedCustomers, trackedProjectIds]);

  const handleOpenProjectFromCustomer = useCallback((project: Project) => {
    setMode('projects');
    setTab(project.archived ? 'archived' : 'active');
    setSelectedProjectId(project.id);
  }, []);

  if (isSuperAdmin) {
    return <Navigate to="/admin/users" replace />;
  }

  const renderProjectItem = (project: Project, showArchivedBadge: boolean) => {
    const customerName = project.customerId ? customerById.get(project.customerId)?.name : null;
    const isTracked = trackedProjectIds.includes(project.id);
    return (
      <ContextMenu key={project.id}>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedProjectId(project.id)}
            onDoubleClick={() => {
              if (!canEdit) return;
              openProjectSettings(project);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelectedProjectId(project.id);
              }
            }}
            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
              selectedProjectId === project.id ? 'border-foreground/60 bg-muted/60' : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {formatProjectLabel(project.name, project.code)}
                </div>
                <div className="text-xs text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {customerName ?? t`No customer`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isTracked && (
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                )}
                {showArchivedBadge && (
                  <Badge variant="secondary" className="text-[10px]">{t`Archived`}</Badge>
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => void toggleTrackedProject(project.id, !isTracked)}>
            {isTracked ? t`Stop tracking` : t`Track`}
          </ContextMenuItem>
          <ContextMenuItem disabled={!canEdit} onSelect={() => openProjectSettings(project)}>
            {t`Edit`}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={() => updateProject(project.id, { archived: !project.archived })}
          >
            {project.archived ? t`Restore` : t`Archive`}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={() => requestDeleteProject(project)}
            className="text-destructive focus:text-destructive"
          >
            {t`Delete`}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderProjectGroups = (list: Project[], showArchivedBadge: boolean) => {
    if (list.length === 0) {
      return (
        <div className="text-sm text-muted-foreground">
          {t`No projects match the current filters.`}
        </div>
      );
    }

    if (!groupByCustomer) {
      return (
        <div className="space-y-2">
          {list.map((project) => renderProjectItem(project, showArchivedBadge))}
        </div>
      );
    }

    const groups = groupedProjects(list);
    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {group.name}
            </div>
            <div className="space-y-2">
              {group.projects.map((project) => renderProjectItem(project, showArchivedBadge))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderMilestoneItem = (milestone: Milestone) => {
    const project = projectById.get(milestone.projectId);
    const customer = project?.customerId ? customerById.get(project.customerId) : null;
    const projectLabel = project
      ? formatProjectLabel(project.name, project.code)
      : t`Unknown project`;
    const isTracked = trackedProjectIdSet.has(milestone.projectId);

    return (
      <ContextMenu key={milestone.id}>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedMilestoneId(milestone.id)}
            onDoubleClick={() => {
              if (!canEdit) return;
              handleOpenMilestoneSettings(milestone);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelectedMilestoneId(milestone.id);
              }
            }}
            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
              selectedMilestoneId === milestone.id ? 'border-foreground/60 bg-muted/60' : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {milestone.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatMilestoneDate(milestone.date)}
                </div>
                <div className="text-xs text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {projectLabel}
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {customer?.name ?? t`No customer`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isTracked && (
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                )}
                {project?.archived && (
                  <Badge variant="secondary" className="text-[10px]">{t`Archived`}</Badge>
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled={!canEdit} onSelect={() => handleOpenMilestoneSettings(milestone)}>
            {t`Edit`}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!project}
            onSelect={() => handleOpenProjectFromMilestone(milestone)}
          >
            {t`Open project`}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={() => requestDeleteMilestone(milestone)}
            className="text-destructive focus:text-destructive"
          >
            {t`Delete`}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderMilestoneGroups = () => {
    if (groupedMilestones.length === 0) {
      return (
        <div className="text-sm text-muted-foreground">
          {t`No milestones match the current filters.`}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {groupedMilestones.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {group.name}
            </div>
            <div className="space-y-2">
              {group.milestones.map((milestone) => renderMilestoneItem(milestone))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <WorkspaceSwitcher />
          <WorkspaceNav />
        </div>
        <div className="flex items-center gap-2">
          {mode === 'customers' ? (
            <Button
              onClick={() => setCreateCustomerOpen(true)}
              size="sm"
              className="gap-2"
              disabled={!canEdit}
            >
              <Plus className="h-4 w-4" />
              {t`New customer`}
            </Button>
          ) : mode === 'milestones' ? (
            <Button
              onClick={handleOpenCreateMilestone}
              size="sm"
              className="gap-2"
              disabled={!canEdit}
            >
              <Plus className="h-4 w-4" />
              {t`New milestone`}
            </Button>
          ) : (
            <Button
              onClick={() => setCreateProjectOpen(true)}
              size="sm"
              className="gap-2"
              disabled={!canEdit}
            >
              <Plus className="h-4 w-4" />
              {t`New project`}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="h-9 w-9"
            disabled={!canEdit}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <InviteNotifications />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAccountSettings(true)}
            className="h-9 w-9"
          >
            <User className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="projects-layout-split"
          className="flex-1 min-h-0"
        >
          <ResizablePanel defaultSize={28} minSize={18} maxSize={42} className="min-w-[260px]">
            <aside className="h-full min-h-0 min-w-0 bg-card flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            {modeToggle}
          </div>
          {mode === 'customers' && (
            <>
              <div className="px-4 py-3 border-b border-border">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <Input
                    className="h-8"
                    placeholder={t`Search customers...`}
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                  />
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 px-2"
                      onClick={() => setNameSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
                    >
                      {nameSort === 'asc' ? (
                        <ArrowDownAZ className="h-4 w-4" />
                      ) : (
                        <ArrowDownZA className="h-4 w-4" />
                      )}
                      <span className="text-xs text-muted-foreground">{nameSortLabel}</span>
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
                  {sortedCustomers.length === 0 && (
                    <div className="text-sm text-muted-foreground">{t`No customers yet.`}</div>
                  )}
                  {sortedCustomers.length > 0 && filteredCustomers.length === 0 && (
                    <div className="text-sm text-muted-foreground">{t`No customers found.`}</div>
                  )}
                  {filteredCustomers.length > 0 && (
                    <div className="space-y-2">
                      {filteredCustomers.map((customer) => {
                        const projectCount = customerProjectCounts.get(customer.id) ?? 0;
                        const isSelected = selectedCustomerId === customer.id;
                        return (
                          <ContextMenu key={customer.id}>
                            <ContextMenuTrigger asChild>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedCustomerId(customer.id)}
                                onContextMenu={() => setSelectedCustomerId(customer.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedCustomerId(customer.id);
                                  }
                                }}
                                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                                  isSelected ? 'border-foreground/60 bg-muted/60' : 'border-border hover:bg-muted/40'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                                    {customer.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {t`${projectCount} projects`}
                                  </div>
                                </div>
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                disabled={!canEdit}
                                onSelect={() => startCustomerEdit(customer.id, customer.name)}
                              >
                                {t`Edit`}
                              </ContextMenuItem>
                              <ContextMenuItem
                                disabled={!canEdit}
                                onSelect={() => requestDeleteCustomer(customer)}
                                className="text-destructive focus:text-destructive"
                              >
                                {t`Delete`}
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                    </div>
                  )}
              </div>
            </>
          )}

          {mode === 'milestones' && (
            <Tabs
              value={milestoneTab}
              onValueChange={(value) => setMilestoneTab(value as 'active' | 'past')}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="px-4 py-3 border-b border-border">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <Input
                    className="h-8"
                    placeholder={t`Search milestones...`}
                    value={milestoneSearch}
                    onChange={(event) => setMilestoneSearch(event.target.value)}
                  />
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 px-2"
                      onClick={() => setNameSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
                    >
                      {nameSort === 'asc' ? (
                        <ArrowDownAZ className="h-4 w-4" />
                      ) : (
                        <ArrowDownZA className="h-4 w-4" />
                      )}
                      <span className="text-xs text-muted-foreground">{nameSortLabel}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 px-2"
                      onClick={handleCycleMilestoneGroup}
                      title={t`Group milestones`}
                    >
                      <Layers className="h-4 w-4" />
                      <span className="text-xs text-muted-foreground">{milestoneGroupLabel}</span>
                    </Button>
                  </div>
                </div>
              </div>
              <TabsList className="mx-4 mt-2 grid grid-cols-2">
                <TabsTrigger value="active">{t`Current`}</TabsTrigger>
                <TabsTrigger value="past">{t`Past`}</TabsTrigger>
              </TabsList>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
                {milestones.length === 0 && (
                  <div className="text-sm text-muted-foreground">{t`No milestones yet.`}</div>
                )}
                {milestones.length > 0 && visibleMilestones.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    {milestoneTab === 'active' ? t`No current milestones.` : t`No past milestones.`}
                  </div>
                )}
                {milestones.length > 0 && visibleMilestones.length > 0 && renderMilestoneGroups()}
              </div>
            </Tabs>
          )}

          {mode === 'projects' && (
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as 'active' | 'archived')}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="px-4 py-3 border-b border-border">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <Input
                    className="h-8"
                    placeholder={t`Search projects...`}
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                  />
                  <div className="flex items-center justify-end gap-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-2 px-2">
                          <Filter className="h-4 w-4" />
                          <span className="text-xs text-muted-foreground">{customerFilterLabel}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-60 p-3" align="start">
                        <div className="flex items-center justify-between pb-2">
                          <span className="text-xs text-muted-foreground">{t`Filter customers`}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCustomerFilterIds([])}
                          >
                            {t`Clear`}
                          </Button>
                        </div>
                        <ScrollArea className="max-h-56 pr-2">
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 py-1 cursor-pointer">
                              <Checkbox
                                checked={customerFilterIds.includes('none')}
                                onCheckedChange={() => handleToggleCustomer('none')}
                              />
                              <span className="text-sm">{t`No customer`}</span>
                            </label>
                            {sortedCustomers.length === 0 && (
                              <div className="text-xs text-muted-foreground">{t`No customers yet.`}</div>
                            )}
                            {sortedCustomers.map((customer) => (
                              <label key={customer.id} className="flex items-center gap-2 py-1 cursor-pointer">
                                <Checkbox
                                  checked={customerFilterIds.includes(customer.id)}
                                  onCheckedChange={() => handleToggleCustomer(customer.id)}
                                />
                                <span className="text-sm truncate">{customer.name}</span>
                              </label>
                            ))}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 px-2"
                      onClick={() => setNameSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
                    >
                      {nameSort === 'asc' ? (
                        <ArrowDownAZ className="h-4 w-4" />
                      ) : (
                        <ArrowDownZA className="h-4 w-4" />
                      )}
                      <span className="text-xs text-muted-foreground">{nameSortLabel}</span>
                    </Button>
                    <Button
                      variant={groupByCustomer ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setGroupByCustomer((current) => !current)}
                      aria-pressed={groupByCustomer}
                      title={t`Group by customer`}
                    >
                      <Layers className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <TabsList className="mx-4 mt-2 grid grid-cols-2">
                <TabsTrigger value="active">{t`Active`}</TabsTrigger>
                <TabsTrigger value="archived">{t`Archived`}</TabsTrigger>
              </TabsList>
              <TabsContent value="active" className="mt-0 flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-y-auto overflow-x-hidden px-4 py-3">
                  {activeProjects.length === 0 && (
                    <div className="text-sm text-muted-foreground">{t`No active projects.`}</div>
                  )}
                  {activeProjects.length > 0 && renderProjectGroups(filteredActiveProjects, false)}
                </div>
              </TabsContent>
              <TabsContent value="archived" className="mt-0 flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-y-auto overflow-x-hidden px-4 py-3">
                  {archivedProjects.length === 0 && (
                    <div className="text-sm text-muted-foreground">{t`No archived projects.`}</div>
                  )}
                  {archivedProjects.length > 0 && renderProjectGroups(filteredArchivedProjects, true)}
                </div>
              </TabsContent>
            </Tabs>
          )}
            </aside>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-border/70" />
          <ResizablePanel defaultSize={72} minSize={58}>
            <section className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col">
          {mode === 'projects' ? (
            <>
              {!selectedProject && (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t`Select a project to view details.`}
                </div>
              )}

              {selectedProject && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="border-b border-border px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-lg font-semibold break-words [overflow-wrap:anywhere]">
                            {formatProjectLabel(selectedProject.name, selectedProject.code)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {customerById.get(selectedProject.customerId ?? '')?.name ?? t`No customer`}
                          </div>
                        </div>
                        {selectedProject.archived && (
                          <Badge variant="secondary">{t`Archived`}</Badge>
                        )}
                      </div>
                      
                    </div>
                  </div>

                  <div className="px-6 py-4 border-b border-border">
                    <div className="flex flex-wrap items-center gap-3">
                      <Input
                        className="w-[220px]"
                        placeholder={t`Search tasks...`}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline">{statusFilterLabel}</Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start">
                          <div className="flex gap-2 pb-2">
                            <Button size="sm" variant="ghost" onClick={() => setStatusPreset('all')}>{t`All`}</Button>
                            <Button size="sm" variant="ghost" onClick={() => setStatusPreset('open')}>{t`Open`}</Button>
                            <Button size="sm" variant="ghost" onClick={() => setStatusPreset('done')}>{t`Done`}</Button>
                          </div>
                          <ScrollArea className="max-h-48 pr-2">
                            <div className="space-y-1">
                              {statuses.map((status) => (
                                <label key={status.id} className="flex items-center gap-2 py-1 cursor-pointer">
                                  <Checkbox
                                    checked={statusFilterIds.includes(status.id)}
                                    onCheckedChange={() => handleToggleStatus(status.id)}
                                  />
                                  <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                                  <span className="text-sm truncate">{formatStatusLabel(status.name, status.emoji)}</span>
                                </label>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline">{assigneeFilterLabel}</Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start">
                          <ScrollArea className="max-h-48 pr-2">
                            <div className="space-y-1">
                              {assigneeOptions.length === 0 && (
                                <div className="text-xs text-muted-foreground">{t`No assignees on this project.`}</div>
                              )}
                              {assigneeOptions.map((assignee) => (
                                <label key={assignee.id} className="flex items-center gap-2 py-1 cursor-pointer">
                                  <Checkbox
                                    checked={assigneeFilterIds.includes(assignee.id)}
                                    onCheckedChange={() => handleToggleAssignee(assignee.id)}
                                  />
                                  <span className="text-sm truncate">
                                    {assignee.name}
                                    {!assignee.isActive && (
                                      <span className="ml-1 text-[10px] text-muted-foreground">{t`(disabled)`}</span>
                                    )}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>

                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSearch('');
                          setStatusFilterIds([]);
                          setAssigneeFilterIds([]);
                        }}
                      >
                        {t`Clear filters`}
                      </Button>

                      <Button
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => selectedProjectId && fetchProjectTasks(selectedProjectId)}
                        disabled={!selectedProjectId || tasksLoading}
                      >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        {t`Refresh`}
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto px-6 py-4">
                    {tasksLoading && (
                      <div className="text-sm text-muted-foreground">{t`Loading tasks...`}</div>
                    )}
                    {!tasksLoading && tasksError && (
                      <div className="text-sm text-destructive">{tasksError}</div>
                    )}
                    {!tasksLoading && !tasksError && (
                      <>
                        {displayTaskRows.length === 0 ? (
                          <div className="text-sm text-muted-foreground">{t`No tasks match the current filters.`}</div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t`Task`}</TableHead>
                                <TableHead>{t`Status`}</TableHead>
                                <TableHead>{t`Assignees`}</TableHead>
                                <TableHead>{t`Dates`}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayTaskRows.map((row) => {
                                const { task } = row;
                                const status = statusById.get(task.statusId);
                                const assigneesList = task.assigneeIds
                                  .map((id) => assigneeById.get(id))
                                  .filter((assignee): assignee is NonNullable<typeof assignee> => Boolean(assignee));
                                return (
                                  <TableRow
                                    key={row.key}
                                    role="button"
                                    tabIndex={0}
                                    className="cursor-pointer hover:bg-muted/40"
                                    onClick={() => setSelectedTaskId(task.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        setSelectedTaskId(task.id);
                                      }
                                    }}
                                  >
                                    <TableCell className="font-medium">
                                      <div className="space-y-1">
                                        <div>{task.title}</div>
                                        {row.repeatMeta && (
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="text-[10px]">
                                              {row.repeatMeta.label}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                              {row.repeatMeta.remaining > 0
                                                ? `Еще ${row.repeatMeta.remaining}`
                                                : 'Последняя в серии'}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2 text-sm">
                                        <span
                                          className="inline-flex h-2 w-2 rounded-full"
                                          style={{ backgroundColor: status?.color ?? '#94a3b8' }}
                                        />
                                        <span>{status ? formatStatusLabel(status.name, status.emoji) : t`Unknown`}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {assigneesList.length === 0 ? (
                                        <span className="text-xs text-muted-foreground">{t`Unassigned`}</span>
                                      ) : (
                                        <div className="flex flex-wrap gap-1">
                                          {assigneesList.map((assignee) => (
                                            <Badge
                                              key={assignee.id}
                                              variant="secondary"
                                              className="text-[10px]"
                                            >
                                              {assignee.name}
                                              {!assignee.isActive && ` ${t`(disabled)`}`}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {format(parseISO(task.startDate), 'dd MMM yyyy')} – {format(parseISO(task.endDate), 'dd MMM yyyy')}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : mode === 'milestones' ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              {!selectedMilestone && (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t`Select a milestone to view details.`}
                </div>
              )}
              {selectedMilestone && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="border-b border-border px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <CalendarDays className="mt-1 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="text-lg font-semibold break-words [overflow-wrap:anywhere]">
                            {selectedMilestone.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatMilestoneDate(selectedMilestone.date)}
                          </div>
                          <div className="text-xs text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                            {selectedMilestoneProject
                              ? formatProjectLabel(selectedMilestoneProject.name, selectedMilestoneProject.code)
                              : t`Unknown project`}
                          </div>
                        </div>
                        {selectedMilestoneProject?.archived && (
                          <Badge variant="secondary">{t`Archived`}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleOpenProjectFromMilestone(selectedMilestone)}
                          disabled={!selectedMilestoneProject}
                        >
                          {t`Open project`}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleOpenMilestoneSettings(selectedMilestone)}
                          disabled={!canEdit}
                        >
                          {t`Edit`}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => requestDeleteMilestone(selectedMilestone)}
                          disabled={!canEdit}
                        >
                          {t`Delete`}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto px-6 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">{t`Date`}</div>
                        <div className="text-sm">{formatMilestoneDate(selectedMilestone.date)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t`Project`}</div>
                        <div className="text-sm break-words [overflow-wrap:anywhere]">
                          {selectedMilestoneProject
                            ? formatProjectLabel(selectedMilestoneProject.name, selectedMilestoneProject.code)
                            : t`Unknown project`}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t`Customer`}</div>
                        <div className="text-sm break-words [overflow-wrap:anywhere]">
                          {selectedMilestoneCustomer?.name ?? t`No customer`}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t`Tracking`}</div>
                        <div className="text-sm">
                          {trackedProjectIdSet.has(selectedMilestone.projectId) ? t`Tracked project` : t`Not tracked`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-border px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">
                      {selectedCustomer?.name ?? t`Select a customer`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedCustomer
                        ? t`${selectedCustomerProjects.length} projects`
                        : t`${customers.length} customers`}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto px-6 py-4">
                {!selectedCustomer && (
                  <div className="text-sm text-muted-foreground">{t`Choose a customer to see their projects.`}</div>
                )}
                {selectedCustomer && selectedCustomerProjects.length === 0 && (
                  <div className="text-sm text-muted-foreground">{t`No projects assigned to this customer.`}</div>
                )}
                {selectedCustomer && selectedCustomerProjects.length > 0 && (
                  <div className="space-y-2">
                    {selectedCustomerProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => handleOpenProjectFromCustomer(project)}
                        className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                            {formatProjectLabel(project.name, project.code)}
                          </div>
                        {project.archived && (
                          <div className="text-[10px] text-muted-foreground">{t`Archived`}</div>
                        )}
                      </div>
                    </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <SettingsPanel open={showSettings} onOpenChange={setShowSettings} />
      <AccountSettingsDialog open={showAccountSettings} onOpenChange={setShowAccountSettings} />
      <Dialog
        open={createCustomerOpen}
        onOpenChange={(open) => {
          setCreateCustomerOpen(open);
          if (!open) {
            setNewCustomerName('');
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t`New customer`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Create a new customer for grouping projects.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddCustomerFromTab();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>{t`Customer name`}</Label>
              <Input
                placeholder={t`Enter customer name...`}
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
                disabled={!canEdit}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateCustomerOpen(false)}
              >
                {t`Cancel`}
              </Button>
              <Button type="submit" disabled={!canEdit || !newCustomerName.trim()}>
                {t`Create`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={renameCustomerOpen}
        onOpenChange={(open) => {
          if (open) {
            setRenameCustomerOpen(true);
            return;
          }
          requestCloseRenameCustomer();
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t`Rename customer`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Update customer name.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameCustomer();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>{t`Customer name`}</Label>
              <Input
                placeholder={t`Enter customer name...`}
                value={editingCustomerName}
                onChange={(event) => setEditingCustomerName(event.target.value)}
                disabled={!canEdit}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={requestCloseRenameCustomer}
              >
                {t`Cancel`}
              </Button>
              <Button type="submit" disabled={!canEdit || !editingCustomerName.trim()}>
                {t`Save`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={renameCustomerConfirmOpen} onOpenChange={setRenameCustomerConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Unsaved changes`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`You have unsaved changes. Close without saving?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep editing`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setRenameCustomerConfirmOpen(false);
                setRenameCustomerOpen(false);
                cancelCustomerEdit();
              }}
            >
              {t`Discard`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={createProjectOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateProjectOpen(true);
            return;
          }
          requestCloseCreateProject();
        }}
      >
        <DialogContent className="w-[95vw] max-w-xl">
          <DialogHeader>
            <DialogTitle>{t`New project`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Create a new project and assign customer, code, and color.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
              <div className="space-y-1">
                <Label>{t`Project name`}</Label>
                <Input
                  placeholder={t`Enter project name...`}
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleCreateProject()}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1">
                <Label>{t`Code`}</Label>
                <Input
                  placeholder={t`Code`}
                  value={newProjectCode}
                  onChange={(event) => setNewProjectCode(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleCreateProject()}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1">
                <Label>{t`Color`}</Label>
                <div className="flex items-center">
                  <ColorPicker value={newProjectColor} onChange={setNewProjectColor} disabled={!canEdit} />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t`Customer`}</Label>
              <CustomerCombobox
                value={newProjectCustomerId}
                customers={customers}
                onChange={setNewProjectCustomerId}
                onCreateCustomer={createCustomerByName}
                disabled={!canEdit}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={requestCloseCreateProject}>
                {t`Cancel`}
              </Button>
              <Button onClick={handleCreateProject} disabled={!canEdit || !newProjectName.trim()}>
                {t`Create project`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={createProjectConfirmOpen} onOpenChange={setCreateProjectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Unsaved changes`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`You have unsaved changes. Close without saving?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep editing`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCreateProjectConfirmOpen(false);
                setCreateProjectOpen(false);
              }}
            >
              {t`Discard`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={projectSettingsOpen}
        onOpenChange={(open) => {
          if (open) {
            setProjectSettingsOpen(true);
            return;
          }
          requestCloseProjectSettings();
        }}
      >
        <DialogContent className="w-[95vw] max-w-xl">
          <DialogHeader>
            <DialogTitle>{t`Edit project`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Edit project details such as name, code, customer, and color.`}
            </DialogDescription>
          </DialogHeader>
          {!projectSettingsTarget && (
            <div className="text-sm text-muted-foreground">{t`Project not found.`}</div>
          )}
          {projectSettingsTarget && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                <div className="space-y-1">
                  <Label>{t`Project name`}</Label>
                  <Input
                    placeholder={t`Enter project name...`}
                    value={projectSettingsName}
                    onChange={(event) => setProjectSettingsName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSaveProjectSettings();
                      }
                    }}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t`Code`}</Label>
                  <Input
                    placeholder={t`Code`}
                    value={projectSettingsCode}
                    onChange={(event) => setProjectSettingsCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSaveProjectSettings();
                      }
                    }}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t`Color`}</Label>
                  <div className="flex items-center">
                    <ColorPicker value={projectSettingsColor} onChange={setProjectSettingsColor} disabled={!canEdit} />
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t`Customer`}</Label>
                <CustomerCombobox
                  value={projectSettingsCustomerId}
                  customers={customers}
                  onChange={setProjectSettingsCustomerId}
                  onCreateCustomer={createCustomerByName}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={requestCloseProjectSettings}>
                  {t`Cancel`}
                </Button>
                <Button
                  onClick={handleSaveProjectSettings}
                  disabled={!canEdit || !projectSettingsName.trim()}
                >
                  {t`Save`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={projectSettingsConfirmOpen} onOpenChange={setProjectSettingsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Unsaved changes`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`You have unsaved changes. Close without saving?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep editing`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setProjectSettingsConfirmOpen(false);
                setProjectSettingsOpen(false);
              }}
            >
              {t`Discard`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MilestoneDialog
        open={milestoneDialogOpen}
        onOpenChange={handleMilestoneDialogOpenChange}
        date={milestoneDialogDate}
        milestone={editingMilestone}
        canEdit={canEdit}
        allowDateEdit
      />
      <Dialog open={Boolean(selectedTaskId)} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <DialogContent className="w-[95vw] max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTask?.title ?? t`Task details`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`View task details linked to this project.`}
            </DialogDescription>
          </DialogHeader>
          {!selectedTask && (
            <div className="text-sm text-muted-foreground">{t`Task not found.`}</div>
          )}
          {selectedTask && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">{t`Project`}</div>
                  <div className="text-sm">
                    {selectedTaskProject
                      ? formatProjectLabel(selectedTaskProject.name, selectedTaskProject.code)
                      : t`No project`}
                  </div>
                  {selectedTaskProject && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t`Customer:`} {selectedTaskCustomer?.name ?? t`No customer`}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Status`}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="inline-flex h-2 w-2 rounded-full"
                      style={{ backgroundColor: statusById.get(selectedTask.statusId)?.color ?? '#94a3b8' }}
                    />
                    <span>{statusById.get(selectedTask.statusId)
                      ? formatStatusLabel(
                        statusById.get(selectedTask.statusId)!.name,
                        statusById.get(selectedTask.statusId)!.emoji,
                      )
                      : t`Unknown`}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Assignees`}</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTask.assigneeIds.length === 0 && (
                      <span className="text-xs text-muted-foreground">{t`Unassigned`}</span>
                    )}
                    {selectedTask.assigneeIds.map((id) => {
                      const assignee = assigneeById.get(id);
                      if (!assignee) return null;
                      return (
                        <Badge key={assignee.id} variant="secondary" className="text-[10px]">
                          {assignee.name}
                          {!assignee.isActive && ` ${t`(disabled)`}`}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Dates`}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(parseISO(selectedTask.startDate), 'dd MMM yyyy')} – {format(parseISO(selectedTask.endDate), 'dd MMM yyyy')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Type`}</div>
                  <div className="text-sm">
                    {taskTypeById.get(selectedTask.typeId)?.name ?? t`Unknown`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Priority`}</div>
                  <div className="text-sm">{selectedTask.priority ?? t`None`}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">{t`Tags`}</div>
                  {selectedTaskTags.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t`No tags`}</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTaskTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-[10px]"
                          style={{ borderColor: tag.color, color: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t`Description`}</div>
                {!selectedTask.description && (
                  <div className="text-sm text-muted-foreground">{t`No description.`}</div>
                )}
                {selectedTask.description && hasRichTags(selectedTask.description) && (
                  <div
                    className="text-sm leading-6"
                    dangerouslySetInnerHTML={{ __html: selectedTaskDescription }}
                  />
                )}
                {selectedTask.description && !hasRichTags(selectedTask.description) && (
                  <div className="text-sm whitespace-pre-wrap">{selectedTaskDescription}</div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={handleOpenTaskInTimeline}>
                  {t`Go to task`}
                </Button>
                <Button variant="outline" onClick={() => setSelectedTaskId(null)}>
                  {t`Close`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleteProjectOpen}
        onOpenChange={(open) => {
          setDeleteProjectOpen(open);
          if (!open) {
            setDeleteProjectTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete project?`}</AlertDialogTitle>
          <AlertDialogDescription>
              {t`This will remove "${deleteProjectLabel}". Tasks will remain, but the project will be cleared from them.`}
          </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteProjectTarget(null)}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteProject}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={deleteMilestoneOpen}
        onOpenChange={(open) => {
          setDeleteMilestoneOpen(open);
          if (!open) {
            setDeleteMilestoneTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete milestone?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This will remove "${deleteMilestoneLabel}" from the project timeline.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteMilestoneTarget(null)}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDeleteMilestone()}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={deleteCustomerOpen}
        onOpenChange={(open) => {
          setDeleteCustomerOpen(open);
          if (!open) {
            setDeleteCustomerTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete customer?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This will remove "${deleteCustomerLabel}". Projects will remain, but the customer will be cleared from them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteCustomerTarget(null)}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteCustomer}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectsPage;
