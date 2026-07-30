export type DashboardPeriod = 'day' | 'week' | 'month';

export type DashboardWidgetType =
  | 'kpi'
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'milestone'
  | 'milestone_calendar';

export type DashboardGroupBy = 'none' | 'assignee' | 'status' | 'project' | 'task_type';

export type DashboardStatusFilter = 'all' | 'active' | 'final' | 'cancelled' | 'custom';

export type DashboardWidgetSize = 'small' | 'medium' | 'large';

export type DashboardMilestoneView = 'list' | 'calendar';

export type DashboardMilestoneCalendarMode = 'month' | 'rolling';

export type DashboardBarPalette =
  | 'pastel-sky'
  | 'pastel-dawn'
  | 'pastel-mint'
  | 'mono'
  | 'checker';

export type DashboardFilterField = 'assignee' | 'status' | 'project' | 'group';

export type DashboardFilterOperator = 'eq' | 'neq';

export type DashboardFilterRule = {
  id: string;
  field: DashboardFilterField;
  operator: DashboardFilterOperator;
  value: string;
};

export type DashboardFilterGroup = {
  id: string;
  match: 'and' | 'or';
  rules: DashboardFilterRule[];
};

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  title: string;
  period: DashboardPeriod;
  groupBy?: DashboardGroupBy;
  size?: DashboardWidgetSize;
  barPalette?: DashboardBarPalette;
  /**
   * Paint each person in their own colour instead of the widget palette. Only
   * meaningful when grouping by assignee; defaults to on, which is how charts
   * behaved when person colours shipped.
   */
  useAssigneeColors?: boolean;
  /** Same for projects, which carry a colour of their own. Defaults to on. */
  useProjectColors?: boolean;
  /** Same for statuses. Defaults to on. */
  useStatusColors?: boolean;
  showLegend?: boolean;
  milestoneView?: DashboardMilestoneView;
  milestoneCalendarMode?: DashboardMilestoneCalendarMode;
  statusFilter: DashboardStatusFilter;
  statusIds?: string[];
  includeUnassigned?: boolean;
  includeDisabledAssignees?: boolean;
  filterGroups?: DashboardFilterGroup[];
};

export type DashboardLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
};

export type DashboardLayouts = Record<string, DashboardLayoutItem[]>;

export type DashboardStatus = {
  id: string;
  name: string;
  emoji: string | null;
  isFinal: boolean;
  isCancelled: boolean;
  color: string;
};

export type DashboardOption = {
  id: string;
  name: string;
  code?: string | null;
  color?: string;
};

export type DashboardAssigneeOption = DashboardOption & {
  isActive: boolean;
};

export type DashboardSummary = {
  id: string;
  name: string;
  createdAt?: string | null;
};

export type DashboardMilestone = {
  id: string;
  title: string;
  projectId: string;
  date: string;
  /** When false, the milestone is left out of the workload heatmap math. */
  includeInWorkload: boolean;
};

/**
 * A person's days off inside the heatmap window. Only what the workload math
 * needs — the note stays on the timeline, where the record is edited.
 */
export type DashboardTimeOff = {
  id: string;
  assigneeId: string;
  /** Inclusive on both ends, mirroring the time_off table (migration 0131). */
  startDate: string;
  endDate: string;
};

export type DashboardStatsRow = {
  assignee_id: string | null;
  assignee_name: string | null;
  group_id?: string | null;
  project_id: string | null;
  project_name: string | null;
  task_type_id: string | null;
  task_type_name: string | null;
  status_id: string;
  status_name: string;
  status_is_final: boolean;
  total: number;
};

export type DashboardSeriesItem = {
  name: string;
  value: number;
  /**
   * Id of the entity the series stands for — an assignee, project, status or
   * task type — or a sentinel like 'unassigned'. Carried so a series can be
   * painted in that entity's own colour instead of a palette slot; a label is
   * not enough, two people can share a name.
   */
  groupId?: string;
};

export type DashboardSeriesRow = {
  bucket_date: string;
  assignee_id: string | null;
  assignee_name: string | null;
  group_id?: string | null;
  project_id: string | null;
  project_name: string | null;
  task_type_id: string | null;
  task_type_name: string | null;
  status_id: string;
  status_name: string;
  status_is_final: boolean;
  total: number;
};

export type DashboardTimeSeriesPoint = {
  date: string;
  [key: string]: number | string;
};

export type DashboardSeriesKey = {
  key: string;
  label: string;
  /** See DashboardSeriesItem.groupId — same id, for time-series charts. */
  groupId?: string;
};

export type DashboardWidgetData = {
  total: number;
  series: DashboardSeriesItem[];
  timeSeries?: DashboardTimeSeriesPoint[];
  seriesKeys?: DashboardSeriesKey[];
};
