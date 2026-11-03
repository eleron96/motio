// Grid layout of dashboard widgets: size presets, collision-free placement,
// and normalising saved layouts against the current widgets and breakpoints.
// Pure functions — the store only calls them.

import {
  DashboardLayouts,
  DashboardLayoutItem,
  DashboardWidget,
  DashboardWidgetSize,
} from '@/features/dashboard/types/dashboard';
import { createWidgetId, DEFAULT_BAR_PALETTE } from '@/features/dashboard/lib/dashboardUtils';
import {
  DASHBOARD_BREAKPOINT_ORDER,
  DASHBOARD_COLS,
  type DashboardBreakpoint,
} from '@/features/dashboard/lib/dashboardResponsive';


const SIZE_PRESETS: Record<DashboardWidgetSize, { w: number; h: number }> = {
  small: { w: 3, h: 2 },
  medium: { w: 6, h: 4 },
  large: { w: 12, h: 6 },
};

const KPI_SMALL_PRESET = { w: 1, h: 1 };
const MILESTONE_PRESETS: Record<DashboardWidgetSize, { w: number; h: number }> = {
  small: { w: 2, h: 3 },
  medium: { w: 6, h: 4 },
  large: { w: 12, h: 6 },
};

const getDefaultSize = (widget: DashboardWidget) => (widget.type === 'kpi' ? 'small' : 'medium');

export const normalizeWidgetSize = (
  type: DashboardWidget['type'],
  size?: DashboardWidgetSize,
): DashboardWidgetSize => (size ?? (type === 'kpi' ? 'small' : 'medium'));

const getPresetForWidget = (type: DashboardWidget['type'], size: DashboardWidgetSize) => {
  if (type === 'kpi' && size === 'small') return KPI_SMALL_PRESET;
  if (type === 'milestone' || type === 'milestone_calendar') return MILESTONE_PRESETS[size];
  return SIZE_PRESETS[size];
};

const getSizeForCols = (size: { w: number; h: number }, cols: number) => ({
  w: Math.min(size.w, cols),
  h: size.h,
});

const isChartWidgetType = (type: DashboardWidget['type']) => (
  type === 'bar' || type === 'line' || type === 'area' || type === 'pie'
);

const getResponsivePresetForWidget = (
  type: DashboardWidget['type'],
  size: DashboardWidgetSize,
  cols: number,
) => {
  const preset = getSizeForCols(getPresetForWidget(type, size), cols);
  if (!isChartWidgetType(type) || cols > DASHBOARD_COLS.sm) return preset;
  if (size !== 'small') return preset;
  return {
    ...preset,
    h: Math.max(preset.h, 3),
  };
};

const getLayoutBoundsForSize = (cols: number, minSize: DashboardWidgetSize) => {
  const min = getSizeForCols(SIZE_PRESETS[minSize], cols);
  const max = getSizeForCols(SIZE_PRESETS.large, cols);
  return {
    w: min.w,
    h: min.h,
    minW: min.w,
    minH: min.h,
    maxW: max.w,
    maxH: max.h,
  };
};

const getLayoutBoundsForWidget = (widget: DashboardWidget | null, cols: number) => {
  const type = widget?.type ?? 'kpi';
  const min = getResponsivePresetForWidget(type, 'small', cols);
  const max = getResponsivePresetForWidget(type, 'large', cols);
  return {
    minW: min.w,
    minH: min.h,
    maxW: max.w,
    maxH: max.h,
  };
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getWidgetLayoutSize = (widget: DashboardWidget, cols: number) => {
  const size = normalizeWidgetSize(widget.type, widget.size ?? getDefaultSize(widget));
  const base = getResponsivePresetForWidget(widget.type, size, cols);
  const bounds = getLayoutBoundsForWidget(widget, cols);
  return { ...base, ...bounds };
};

const hasCollision = (item: DashboardLayoutItem, others: DashboardLayoutItem[]) => (
  others.some((other) => (
    item.x < other.x + other.w
    && item.x + item.w > other.x
    && item.y < other.y + other.h
    && item.y + item.h > other.y
  ))
);

const findAvailablePosition = (
  layout: DashboardLayoutItem[],
  size: Pick<DashboardLayoutItem, 'w' | 'h'>,
  cols: number,
) => {
  const maxY = layout.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
  const maxX = Math.max(cols - size.w, 0);
  for (let y = 0; y <= maxY + size.h; y += 1) {
    for (let x = 0; x <= maxX; x += 1) {
      const candidate: DashboardLayoutItem = { i: 'candidate', x, y, w: size.w, h: size.h };
      if (!hasCollision(candidate, layout)) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: maxY };
};

const findAvailablePositionFrom = (
  layout: DashboardLayoutItem[],
  size: Pick<DashboardLayoutItem, 'w' | 'h'>,
  cols: number,
  preferredX: number,
  preferredY: number,
) => {
  const maxY = layout.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
  const maxX = Math.max(cols - size.w, 0);
  const startY = Math.max(0, preferredY);
  const clampedPreferredX = clampNumber(preferredX, 0, maxX);
  const xOrder = [
    ...Array.from({ length: Math.max(maxX - clampedPreferredX + 1, 0) }, (_, index) => clampedPreferredX + index),
    ...Array.from({ length: Math.max(clampedPreferredX, 0) }, (_, index) => index),
  ];

  for (let y = startY; y <= maxY + size.h; y += 1) {
    for (const x of xOrder) {
      const candidate: DashboardLayoutItem = { i: 'candidate', x, y, w: size.w, h: size.h };
      if (!hasCollision(candidate, layout)) {
        return { x, y };
      }
    }
  }

  for (let y = 0; y < startY; y += 1) {
    for (const x of xOrder) {
      const candidate: DashboardLayoutItem = { i: 'candidate', x, y, w: size.w, h: size.h };
      if (!hasCollision(candidate, layout)) {
        return { x, y };
      }
    }
  }

  return { x: clampedPreferredX, y: Math.max(startY, maxY) };
};

export const getClosestWidgetSize = (
  w: number,
  h: number,
  cols: number,
  widgetType?: DashboardWidget['type'],
): DashboardWidgetSize => {
  const type = widgetType ?? 'kpi';
  const candidates = (Object.keys(SIZE_PRESETS) as DashboardWidgetSize[]).map((size) => {
    const preset = getSizeForCols(getPresetForWidget(type, size), cols);
    const distance = Math.abs(preset.w - w) + Math.abs(preset.h - h);
    return { size, distance };
  });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.size ?? 'small';
};


const buildStackedLayout = (widgets: DashboardWidget[], cols: number) => {
  let y = 0;
  return widgets.map((widget) => {
    const size = getWidgetLayoutSize(widget, cols);
    const item: DashboardLayoutItem = {
      i: widget.id,
      x: 0,
      y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      maxW: size.maxW,
      maxH: size.maxH,
    };
    y += size.h;
    return item;
  });
};

const buildPackedLayout = (widgets: DashboardWidget[], cols: number) => {
  const layout: DashboardLayoutItem[] = [];
  widgets.forEach((widget) => {
    const size = getWidgetLayoutSize(widget, cols);
    const position = findAvailablePosition(layout, size, cols);
    layout.push({
      i: widget.id,
      x: position.x,
      y: position.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      maxW: size.maxW,
      maxH: size.maxH,
    });
  });
  return layout;
};

export const buildDefaultLayouts = (widgets: DashboardWidget[]): DashboardLayouts => {
  return DASHBOARD_BREAKPOINT_ORDER.reduce<DashboardLayouts>((acc, breakpoint) => {
    const cols = DASHBOARD_COLS[breakpoint];
    const layout = cols <= 2
      ? buildStackedLayout(widgets, cols)
      : buildPackedLayout(widgets, cols);
    acc[breakpoint] = layout;
    return acc;
  }, {});
};

export const createDefaultWidgets = (): DashboardWidget[] => [];

export const normalizeWidget = (widget: Partial<DashboardWidget>): DashboardWidget => {
  const rawType = widget.type ?? 'kpi';
  const type = rawType === 'milestone_calendar' ? 'milestone' : rawType;
  const hasPalette = type === 'bar' || type === 'line' || type === 'area' || type === 'pie';
  const milestoneView = type === 'milestone'
    ? (widget.milestoneView ?? (rawType === 'milestone_calendar' ? 'calendar' : 'list'))
    : undefined;
  const milestoneCalendarMode = type === 'milestone'
    ? (widget.milestoneCalendarMode ?? 'month')
    : undefined;
  const normalized: DashboardWidget = {
    id: widget.id ?? createWidgetId(),
    title: widget.title ?? 'Widget',
    type,
    period: widget.period ?? 'week',
    groupBy: widget.groupBy ?? 'none',
    size: normalizeWidgetSize(type, widget.size),
    barPalette: hasPalette ? (widget.barPalette ?? DEFAULT_BAR_PALETTE) : undefined,
    // Widgets saved before a toggle existed carry no flag. Defaulting to on is
    // what makes an entity's own colour the norm rather than an opt-in.
    useAssigneeColors: hasPalette ? (widget.useAssigneeColors ?? true) : undefined,
    useProjectColors: hasPalette ? (widget.useProjectColors ?? true) : undefined,
    useStatusColors: hasPalette ? (widget.useStatusColors ?? true) : undefined,
    showLegend: hasPalette ? (widget.showLegend ?? true) : undefined,
    milestoneView,
    milestoneCalendarMode,
    statusFilter: widget.statusFilter ?? 'all',
    statusIds: widget.statusIds ?? [],
    includeUnassigned: widget.includeUnassigned ?? true,
    includeDisabledAssignees: widget.includeDisabledAssignees ?? false,
    filterGroups: widget.filterGroups ?? [],
  };
  return normalized;
};

export const applyWidgetConstraints = (layouts: DashboardLayouts, widget: DashboardWidget): DashboardLayouts => {
  const nextLayouts: DashboardLayouts = {};
  Object.entries(DASHBOARD_COLS).forEach(([breakpoint, cols]) => {
    const currentLayout = layouts[breakpoint] ?? [];
    const bounds = getLayoutBoundsForWidget(widget, cols);
    nextLayouts[breakpoint] = currentLayout.map((item) => {
      if (item.i !== widget.id) return item;
      const w = clampNumber(Math.round(toFiniteNumber(item.w, bounds.minW)), bounds.minW, bounds.maxW);
      const h = clampNumber(Math.round(toFiniteNumber(item.h, bounds.minH)), bounds.minH, bounds.maxH);
      const x = clampNumber(Math.round(toFiniteNumber(item.x, 0)), 0, Math.max(cols - w, 0));
      return {
        ...item,
        x,
        w,
        h,
        minW: bounds.minW,
        minH: bounds.minH,
        maxW: bounds.maxW,
        maxH: bounds.maxH,
      };
    });
  });
  return nextLayouts;
};

export const addWidgetToLayouts = (layouts: DashboardLayouts, widget: DashboardWidget) => {
  const nextLayouts: DashboardLayouts = {};
  Object.entries(DASHBOARD_COLS).forEach(([breakpoint, cols]) => {
    const currentLayout = layouts[breakpoint] ?? [];
    const size = getWidgetLayoutSize(widget, cols);
    const position = findAvailablePosition(currentLayout, size, cols);
    const item: DashboardLayoutItem = {
      i: widget.id,
      x: position.x,
      y: position.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      maxW: size.maxW,
      maxH: size.maxH,
    };
    nextLayouts[breakpoint] = [...currentLayout, item];
  });
  return nextLayouts;
};

const resolveRawLayoutForBreakpoint = (
  layouts: DashboardLayouts,
  breakpoint: DashboardBreakpoint,
  widgetIds: Set<string>,
) => {
  const direct = (layouts[breakpoint] ?? []).filter((item) => widgetIds.has(item.i));
  if (direct.length > 0) return direct;

  const targetIndex = DASHBOARD_BREAKPOINT_ORDER.indexOf(breakpoint);
  if (targetIndex < 0) return [];

  for (let distance = 1; distance < DASHBOARD_BREAKPOINT_ORDER.length; distance += 1) {
    const candidates = [targetIndex - distance, targetIndex + distance]
      .filter((index) => index >= 0 && index < DASHBOARD_BREAKPOINT_ORDER.length);

    for (const index of candidates) {
      const sourceBreakpoint = DASHBOARD_BREAKPOINT_ORDER[index];
      const sourceLayout = (layouts[sourceBreakpoint] ?? []).filter((item) => widgetIds.has(item.i));
      if (sourceLayout.length === 0) continue;

      const sourceCols = DASHBOARD_COLS[sourceBreakpoint];
      const targetCols = DASHBOARD_COLS[breakpoint];
      if (sourceCols === targetCols) return sourceLayout;

      const ratio = targetCols / sourceCols;
      return sourceLayout.map((item) => {
        const rawW = Math.max(1, Math.round(toFiniteNumber(item.w, 1) * ratio));
        const w = clampNumber(rawW, 1, targetCols);
        const rawX = Math.round(toFiniteNumber(item.x, 0) * ratio);
        const x = clampNumber(rawX, 0, Math.max(targetCols - w, 0));
        return { ...item, x, w };
      });
    }
  }

  return [];
};

export const normalizeLayouts = (layouts: DashboardLayouts, widgets: DashboardWidget[]) => {
  const widgetIds = new Set(widgets.map((widget) => widget.id));
  const widgetMap = new Map(widgets.map((widget) => [widget.id, widget]));
  const normalized: DashboardLayouts = {};

  DASHBOARD_BREAKPOINT_ORDER.forEach((breakpoint) => {
    const cols = DASHBOARD_COLS[breakpoint];
    const rawLayout = resolveRawLayoutForBreakpoint(layouts, breakpoint, widgetIds);
    const currentLayout: DashboardLayoutItem[] = [];
    rawLayout.forEach((item) => {
      const widget = widgetMap.get(item.i) ?? null;
      const size = widget ? getWidgetLayoutSize(widget, cols) : getLayoutBoundsForSize(cols, 'small');
      const rawW = toFiniteNumber(item.w, size.w);
      const rawH = toFiniteNumber(item.h, size.h);
      const w = clampNumber(Math.round(rawW), 1, cols);
      const h = Math.max(1, Math.round(rawH));
      const rawX = toFiniteNumber(item.x, Number.NaN);
      const rawY = toFiniteNumber(item.y, Number.NaN);
      const shouldAutoPlace = !Number.isFinite(rawX) || !Number.isFinite(rawY);
      let x = Number.isFinite(rawX) ? Math.round(rawX) : 0;
      let y = Number.isFinite(rawY) ? Math.round(rawY) : 0;
      x = clampNumber(x, 0, Math.max(cols - w, 0));
      y = Math.max(0, y);
      let nextItem: DashboardLayoutItem = {
        ...item,
        x,
        y,
        w,
        h,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
      };
      if (shouldAutoPlace || hasCollision(nextItem, currentLayout)) {
        const position = findAvailablePosition(currentLayout, nextItem, cols);
        nextItem = { ...nextItem, x: position.x, y: position.y };
      }
      currentLayout.push(nextItem);
    });
    const existingIds = new Set(currentLayout.map((item) => item.i));
    const missingWidgets = widgets.filter((widget) => !existingIds.has(widget.id));
    const layoutWithAll = missingWidgets.reduce((acc, widget) => {
      const size = getWidgetLayoutSize(widget, cols);
      const position = findAvailablePosition(acc, size, cols);
      const item: DashboardLayoutItem = {
        i: widget.id,
        x: position.x,
        y: position.y,
        w: size.w,
        h: size.h,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
      };
      return [...acc, item];
    }, currentLayout);

    const resolvedLayout = layoutWithAll.reduce<DashboardLayoutItem[]>((acc, item) => {
      const widget = widgetMap.get(item.i) ?? null;
      const size = widget ? getWidgetLayoutSize(widget, cols) : getLayoutBoundsForSize(cols, 'small');
      const w = clampNumber(Math.round(toFiniteNumber(item.w, size.w)), size.minW, Math.min(size.maxW, cols));
      const h = clampNumber(Math.round(toFiniteNumber(item.h, size.h)), size.minH, size.maxH);
      const x = clampNumber(Math.round(toFiniteNumber(item.x, 0)), 0, Math.max(cols - w, 0));
      const y = Math.max(0, Math.round(toFiniteNumber(item.y, 0)));
      let nextItem: DashboardLayoutItem = {
        ...item,
        x,
        y,
        w,
        h,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
      };
      if (hasCollision(nextItem, acc)) {
        const position = findAvailablePositionFrom(acc, nextItem, cols, nextItem.x, nextItem.y);
        nextItem = { ...nextItem, x: position.x, y: position.y };
      }
      return [...acc, nextItem];
    }, []);

    normalized[breakpoint] = resolvedLayout;
  });

  return normalized;
};

// Meaningful equality of two layout maps: same breakpoints and, per
// breakpoint, the same items by position/size (i, x, y, w, h). Min/max bounds
// are derived by normalizeLayouts and intentionally ignored. Used to short-
// circuit no-op layout updates so react-grid-layout's onLayoutChange can't feed
// an unchanged layout back into the store and spin the grid (jitter).
export const layoutsEqual = (a: DashboardLayouts, b: DashboardLayouts): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const itemsA = a[key];
    const itemsB = b[key];
    if (!itemsB || itemsA.length !== itemsB.length) return false;
    const byId = new Map(itemsB.map((item) => [item.i, item]));
    for (const item of itemsA) {
      const other = byId.get(item.i);
      if (!other
        || other.x !== item.x
        || other.y !== item.y
        || other.w !== item.w
        || other.h !== item.h) {
        return false;
      }
    }
  }
  return true;
};
