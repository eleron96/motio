export type DashboardPeriod = 'day' | 'week' | 'month';

export type DashboardWidgetType =
  | 'kpi'
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'milestone'
  | 'milestone_calendar';

export type DashboardGroupBy = 'none' | 'assignee' | 'status' | 'project';

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
  showLegend?: boolean;
  milestoneView?: DashboardMilestoneView;
  milestoneCalendarMode?: DashboardMilestoneCalendarMode;
  statusFilter: DashboardStatusFilter;
  statusIds?: string[];
  includeUnassigned?: boolean;
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
};

export type DashboardStatsRow = {
  assignee_id: string | null;
  assignee_name: string | null;
  group_id?: string | null;
  project_id: string | null;
  project_name: string | null;
  status_id: string;
  status_name: string;
  status_is_final: boolean;
  total: number;
};

export type DashboardSeriesItem = {
  name: string;
  value: number;
};

export type DashboardSeriesRow = {
  bucket_date: string;
  assignee_id: string | null;
  assignee_name: string | null;
  group_id?: string | null;
  project_id: string | null;
  project_name: string | null;
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
};

export type DashboardWidgetData = {
  total: number;
  series: DashboardSeriesItem[];
  timeSeries?: DashboardTimeSeriesPoint[];
  seriesKeys?: DashboardSeriesKey[];
};
