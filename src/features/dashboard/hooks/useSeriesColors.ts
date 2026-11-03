import React from 'react';
import { getBarPalette } from '@/features/dashboard/lib/dashboardUtils';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';
import { buildPersonColorMap } from '@/features/planner/lib/timeOffPalette';
import type {
  DashboardAssigneeOption,
  DashboardOption,
  DashboardSeriesItem,
  DashboardSeriesKey,
  DashboardStatus,
  DashboardWidget,
} from '@/features/dashboard/types/dashboard';

interface UseSeriesColorsOptions {
  widget: DashboardWidget;
  series: DashboardSeriesItem[];
  seriesKeys: DashboardSeriesKey[];
  /** A line or area chart with a per-day series: slots follow the series keys. */
  colorBySeriesKey: boolean;
  assignees: DashboardAssigneeOption[];
  projects: DashboardOption[];
  statuses: DashboardStatus[];
}

/** The colour of each series of a chart widget, by series name or key. */
export const useSeriesColors = ({
  widget,
  series,
  seriesKeys,
  colorBySeriesKey,
  assignees,
  projects,
  statuses,
}: UseSeriesColorsOptions) => {
  const paletteColors = React.useMemo(() => {
    const nextPalette = widget.type !== 'kpi'
      ? getBarPalette(widget.barPalette)
      : [DEFAULT_NEUTRAL_COLOR];
    return nextPalette.length > 0 ? nextPalette : [DEFAULT_NEUTRAL_COLOR];
  }, [widget.barPalette, widget.type]);
  const colorIndexBySeries = React.useMemo(() => {
    const map = new Map<string, number>();
    if (colorBySeriesKey) {
      seriesKeys.forEach((seriesKey, index) => {
        map.set(seriesKey.key, index);
        map.set(seriesKey.label, index);
      });
      return map;
    }

    series.forEach((item, index) => {
      if (!map.has(item.name)) {
        map.set(item.name, index);
      }
    });
    return map;
  }, [colorBySeriesKey, series, seriesKeys]);
  // Each grouping can be drawn in the colours its own entities carry rather than
  // in palette slots: people get the colour from workspace settings (or the
  // automatic one the calendar hands them — buildPersonColorMap is the calendar's
  // own function, so both views agree), projects and statuses get theirs from
  // their settings. Turn the matching toggle off and the widget palette paints
  // everything, as it did before.
  const entityColorByGroupId = React.useMemo(() => {
    const groupBy = widget.groupBy;
    if (groupBy === 'assignee' && widget.useAssigneeColors !== false) {
      return buildPersonColorMap(assignees);
    }
    if (groupBy === 'project' && widget.useProjectColors !== false) {
      const map = new Map<string, string>(
        projects
          .filter((project) => project.color)
          .map((project) => [project.id, project.color as string]),
      );
      // "No project" is an absence, not a project — grey says so.
      map.set('no-project', DEFAULT_NEUTRAL_COLOR);
      return map;
    }
    if (groupBy === 'status' && widget.useStatusColors !== false) {
      return new Map<string, string>(
        statuses
          .filter((status) => status.color)
          .map((status) => [status.id, status.color]),
      );
    }
    return new Map<string, string>();
  }, [
    assignees,
    projects,
    statuses,
    widget.groupBy,
    widget.useAssigneeColors,
    widget.useProjectColors,
    widget.useStatusColors,
  ]);
  const entityColorBySeries = React.useMemo(() => {
    const map = new Map<string, string>();
    if (entityColorByGroupId.size === 0) return map;

    // Both spellings a chart may pass in: the label (bar/pie cells) and the
    // sanitized series key (line/area).
    series.forEach((item) => {
      const color = item.groupId ? entityColorByGroupId.get(item.groupId) : undefined;
      if (color) map.set(item.name, color);
    });
    seriesKeys.forEach((seriesKey) => {
      const color = seriesKey.groupId ? entityColorByGroupId.get(seriesKey.groupId) : undefined;
      if (color) {
        map.set(seriesKey.key, color);
        map.set(seriesKey.label, color);
      }
    });
    return map;
  }, [entityColorByGroupId, series, seriesKeys]);
  return React.useCallback((seriesNameOrKey: string, index: number) => {
    const entityColor = entityColorBySeries.get(seriesNameOrKey);
    if (entityColor) return entityColor;
    const resolvedIndex = colorIndexBySeries.get(seriesNameOrKey) ?? index;
    return paletteColors[resolvedIndex % paletteColors.length];
  }, [colorIndexBySeries, entityColorBySeries, paletteColors]);
};
