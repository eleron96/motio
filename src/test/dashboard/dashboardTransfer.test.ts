import { describe, expect, it } from 'vitest';
import {
  adaptDashboardFile,
  buildDashboardFile,
  dashboardFileName,
  parseDashboardFile,
  uniqueDashboardName,
} from '@/features/dashboard/lib/dashboardTransfer';
import type { DashboardWidget } from '@/features/dashboard/types/dashboard';

const source = {
  statuses: [{ id: 's-done', name: 'Done' }, { id: 's-open', name: 'Open' }],
  projects: [{ id: 'p-north', name: 'North' }],
  assignees: [{ id: 'a-anna', name: 'Anna' }],
  groups: [{ id: 'g-field', name: 'Field' }],
};

const widget: DashboardWidget = {
  id: 'w1',
  type: 'bar',
  title: 'Load',
  period: 'week',
  statusFilter: 'custom',
  statusIds: ['s-done', 's-open'],
  filterGroups: [
    {
      id: 'fg1',
      match: 'and',
      rules: [
        { id: 'r1', field: 'project', operator: 'eq', value: 'p-north' },
        { id: 'r2', field: 'assignee', operator: 'eq', value: 'a-anna' },
      ],
    },
    { id: 'fg2', match: 'or', rules: [{ id: 'r3', field: 'group', operator: 'neq', value: 'g-field' }] },
  ],
};

const layouts = { lg: [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }] };

describe('dashboards to and from a file', () => {
  it('writes the names of what the widgets point at', () => {
    const file = buildDashboardFile({ name: 'Weekly', widgets: [widget], layouts }, source, '2026-11-09T10:00:00Z');
    expect(file.format).toBe('motio-dashboard');
    expect(file.references).toEqual({
      status: { 's-done': 'Done', 's-open': 'Open' },
      project: { 'p-north': 'North' },
      assignee: { 'a-anna': 'Anna' },
      group: { 'g-field': 'Field' },
    });
  });

  it('puts the ids of the receiving workspace in, by name and regardless of case', () => {
    const file = buildDashboardFile({ name: 'Weekly', widgets: [widget], layouts }, source, '');
    const target = {
      statuses: [{ id: 'S1', name: 'done' }, { id: 'S2', name: 'Open' }],
      projects: [{ id: 'P1', name: 'North' }],
      assignees: [{ id: 'A1', name: 'Anna' }],
      groups: [{ id: 'G1', name: 'Field' }],
    };
    const adapted = adaptDashboardFile(parseDashboardFileOk(JSON.stringify(file)), target);
    expect(adapted.unmatched).toBe(0);
    expect(adapted.widgets[0].statusIds).toEqual(['S1', 'S2']);
    expect(adapted.widgets[0].filterGroups?.[0].rules.map((rule) => rule.value)).toEqual(['P1', 'A1']);
    expect(adapted.layouts).toEqual(layouts);
  });

  it('leaves out what has no match and says how much', () => {
    const file = buildDashboardFile({ name: 'Weekly', widgets: [widget], layouts }, source, '');
    const target = { statuses: [{ id: 'S1', name: 'Done' }], projects: [], assignees: [{ id: 'A1', name: 'Anna' }], groups: [] };
    const adapted = adaptDashboardFile(file, target);
    expect(adapted.unmatched).toBe(3);
    expect(adapted.widgets[0].statusIds).toEqual(['S1']);
    expect(adapted.widgets[0].filterGroups).toEqual([
      { id: 'fg1', match: 'and', rules: [{ id: 'r2', field: 'assignee', operator: 'eq', value: 'A1' }] },
    ]);
  });

  it('refuses files that are not dashboards', () => {
    expect(parseDashboardFile('{oops')).toEqual({ problem: 'not_json' });
    expect(parseDashboardFile('{"format":"something"}')).toEqual({ problem: 'not_dashboard' });
    expect(parseDashboardFile('{"format":"motio-dashboard","version":99,"widgets":[],"layouts":{}}'))
      .toEqual({ problem: 'newer_version' });
    expect(parseDashboardFile('{"format":"motio-dashboard","version":1,"widgets":"x","layouts":{}}'))
      .toEqual({ problem: 'not_dashboard' });
  });

  it('keeps names unique within a workspace', () => {
    expect(uniqueDashboardName('Weekly', ['Other'])).toBe('Weekly');
    expect(uniqueDashboardName('Weekly', ['weekly', 'Weekly (2)'])).toBe('Weekly (3)');
    expect(uniqueDashboardName('  ', [])).toBe('Dashboard');
  });

  it('names the file after the dashboard', () => {
    expect(dashboardFileName('Weekly load / North')).toBe('dashboard-weekly-load-north.json');
    expect(dashboardFileName('Загрузка')).toBe('dashboard-загрузка.json');
    expect(dashboardFileName('!!!')).toBe('dashboard-export.json');
  });
});

function parseDashboardFileOk(text: string) {
  const parsed = parseDashboardFile(text);
  if ('problem' in parsed) throw new Error(parsed.problem);
  return parsed.file;
}
