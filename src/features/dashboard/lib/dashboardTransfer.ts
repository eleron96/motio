import type {
  DashboardFilterField,
  DashboardLayouts,
  DashboardOption,
  DashboardStatus,
  DashboardWidget,
} from '@/features/dashboard/types/dashboard';

// Dashboards to and from a file (server setting dashboards.transfer). Widgets
// point at statuses, projects, people and groups by id, and ids differ from one
// workspace to another — so the file carries the NAMES of what the widgets point
// at, and an import looks them up by name in the receiving workspace. What has
// no match there is left out of the filters, and the import says how many.

export const DASHBOARD_FILE_FORMAT = 'motio-dashboard';
export const DASHBOARD_FILE_VERSION = 1;

type ReferenceKind = DashboardFilterField; // 'assignee' | 'status' | 'project' | 'group'

export type DashboardCatalogs = {
  statuses: Pick<DashboardStatus, 'id' | 'name'>[];
  projects: Pick<DashboardOption, 'id' | 'name'>[];
  assignees: Pick<DashboardOption, 'id' | 'name'>[];
  groups: Pick<DashboardOption, 'id' | 'name'>[];
};

export type DashboardFile = {
  format: typeof DASHBOARD_FILE_FORMAT;
  version: number;
  name: string;
  exportedAt: string;
  widgets: DashboardWidget[];
  layouts: DashboardLayouts;
  // id → name of everything the widgets point at, per kind.
  references: Record<ReferenceKind, Record<string, string>>;
};

const catalogFor = (catalogs: DashboardCatalogs, kind: ReferenceKind) => {
  switch (kind) {
    case 'status': return catalogs.statuses;
    case 'project': return catalogs.projects;
    case 'assignee': return catalogs.assignees;
    case 'group': return catalogs.groups;
  }
};

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

export const buildDashboardFile = (
  dashboard: { name: string; widgets: DashboardWidget[]; layouts: DashboardLayouts },
  catalogs: DashboardCatalogs,
  exportedAt: string,
): DashboardFile => {
  const references: DashboardFile['references'] = { assignee: {}, status: {}, project: {}, group: {} };
  const remember = (kind: ReferenceKind, id: string) => {
    const found = catalogFor(catalogs, kind).find((item) => item.id === id);
    if (found) references[kind][id] = found.name;
  };
  for (const widget of dashboard.widgets) {
    (widget.statusIds ?? []).forEach((id) => remember('status', id));
    (widget.filterGroups ?? []).forEach((group) => group.rules.forEach((rule) => remember(rule.field, rule.value)));
  }
  return {
    format: DASHBOARD_FILE_FORMAT,
    version: DASHBOARD_FILE_VERSION,
    name: dashboard.name,
    exportedAt,
    widgets: dashboard.widgets,
    layouts: dashboard.layouts,
    references,
  };
};

export type DashboardFileProblem = 'not_json' | 'not_dashboard' | 'newer_version';

export const parseDashboardFile = (text: string): { file: DashboardFile } | { problem: DashboardFileProblem } => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { problem: 'not_json' };
  }
  if (!raw || typeof raw !== 'object') return { problem: 'not_dashboard' };
  const value = raw as Partial<DashboardFile>;
  if (value.format !== DASHBOARD_FILE_FORMAT || typeof value.version !== 'number') return { problem: 'not_dashboard' };
  if (value.version > DASHBOARD_FILE_VERSION) return { problem: 'newer_version' };
  if (!Array.isArray(value.widgets) || !value.layouts || typeof value.layouts !== 'object') {
    return { problem: 'not_dashboard' };
  }
  const references = (value.references ?? {}) as Partial<DashboardFile['references']>;
  return {
    file: {
      format: DASHBOARD_FILE_FORMAT,
      version: value.version,
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Dashboard',
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
      widgets: value.widgets as DashboardWidget[],
      layouts: value.layouts as DashboardLayouts,
      references: {
        assignee: references.assignee ?? {},
        status: references.status ?? {},
        project: references.project ?? {},
        group: references.group ?? {},
      },
    },
  };
};

/**
 * The file's widgets with ids of the receiving workspace. A status, project,
 * person or group with no namesake here drops out of the widget's filters; a
 * filter group left without rules goes too. `unmatched` counts the dropped ones.
 */
export const adaptDashboardFile = (
  file: DashboardFile,
  catalogs: DashboardCatalogs,
): { widgets: DashboardWidget[]; layouts: DashboardLayouts; unmatched: number } => {
  const lookups = new Map<ReferenceKind, Map<string, string>>();
  (['assignee', 'status', 'project', 'group'] as const).forEach((kind) => {
    const byName = new Map<string, string>();
    catalogFor(catalogs, kind).forEach((item) => {
      const key = nameKey(item.name);
      if (!byName.has(key)) byName.set(key, item.id);
    });
    lookups.set(kind, byName);
  });

  const missing = new Set<string>();
  const translate = (kind: ReferenceKind, id: string): string | null => {
    const name = file.references[kind][id];
    const found = name ? lookups.get(kind)?.get(nameKey(name)) : undefined;
    if (!found) {
      missing.add(`${kind}:${id}`);
      return null;
    }
    return found;
  };

  const widgets = file.widgets.map((widget) => {
    const next: DashboardWidget = { ...widget };
    if (widget.statusIds) {
      next.statusIds = widget.statusIds
        .map((id) => translate('status', id))
        .filter((id): id is string => Boolean(id));
    }
    if (widget.filterGroups) {
      next.filterGroups = widget.filterGroups
        .map((group) => ({
          ...group,
          rules: group.rules
            .map((rule) => {
              const value = translate(rule.field, rule.value);
              return value ? { ...rule, value } : null;
            })
            .filter((rule): rule is NonNullable<typeof rule> => rule !== null),
        }))
        .filter((group) => group.rules.length > 0);
    }
    return next;
  });

  return { widgets, layouts: file.layouts, unmatched: missing.size };
};

/** "Sales", then "Sales (2)", "Sales (3)"… — names are unique within a workspace. */
export const uniqueDashboardName = (base: string, taken: string[]): string => {
  const name = base.trim() || 'Dashboard';
  const used = new Set(taken.map(nameKey));
  if (!used.has(nameKey(name))) return name;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${name} (${index})`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
  return `${name} (${Date.now()})`;
};

export const dashboardFileName = (name: string) => {
  const slug = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `dashboard-${slug || 'export'}.json`;
};
