import { describe, expect, it } from 'vitest';

import {
  MAX_PAGE_SIZE,
  decodeCursor,
  isIsoTimestamp,
  encodeCursor,
  isRouteAllowed,
  parseMilestonesQuery,
  parseProjectsQuery,
  parseTasksQuery,
  parseWorkspaceApiRoute,
  scopesForRoute,
  toPage,
  type WorkspaceApiRoute,
} from '../../../infra/supabase/functions/_shared/workspaceApi';

const TASK_ID = '3f0c7a52-1b2c-4d3e-8f90-a1b2c3d4e5f6';
const query = (text: string) => new URLSearchParams(text);

describe('parseWorkspaceApiRoute', () => {
  it('maps the read endpoints and keeps the time-off ones', () => {
    expect(parseWorkspaceApiRoute('GET', '/api/v1/workspace')).toEqual({ kind: 'workspace' });
    expect(parseWorkspaceApiRoute('GET', '/api/v1/members/')).toEqual({ kind: 'members' });
    expect(parseWorkspaceApiRoute('GET', '/api/v1/projects')).toEqual({ kind: 'projects' });
    expect(parseWorkspaceApiRoute('GET', '/api/v1/tasks')).toEqual({ kind: 'tasks' });
    expect(parseWorkspaceApiRoute('GET', `/api/v1/tasks/${TASK_ID.toUpperCase()}`)).toEqual({ kind: 'task', taskId: TASK_ID });
    expect(parseWorkspaceApiRoute('GET', '/api/v1/milestones')).toEqual({ kind: 'milestones' });
    expect(parseWorkspaceApiRoute('GET', '/api/v1/time-off')).toEqual({ kind: 'list' });
    expect(parseWorkspaceApiRoute('DELETE', '/api/v1/time-off/hr-1')).toEqual({ kind: 'delete', externalId: 'hr-1' });
    // An id with a slash cannot travel in a path through every proxy: it may come as a parameter.
    expect(parseWorkspaceApiRoute('DELETE', '/api/v1/time-off', new URLSearchParams({ external_id: 'hr/2032 01' })))
      .toEqual({ kind: 'delete', externalId: 'hr/2032 01' });
    expect(parseWorkspaceApiRoute('DELETE', '/api/v1/time-off', new URLSearchParams({ external_id: '' })))
      .toEqual({ error: 'not_found' });
    expect(parseWorkspaceApiRoute('DELETE', '/api/v1/time-off', new URLSearchParams())).toEqual({ error: 'method_not_allowed' });
  });

  it('reads only: every other method is refused, unknown paths are not found', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(parseWorkspaceApiRoute(method, '/api/v1/tasks')).toEqual({ error: 'method_not_allowed' });
      expect(parseWorkspaceApiRoute(method, `/api/v1/tasks/${TASK_ID}`)).toEqual({ error: 'method_not_allowed' });
      expect(parseWorkspaceApiRoute(method, '/api/v1/members')).toEqual({ error: 'method_not_allowed' });
    }
    expect(parseWorkspaceApiRoute('GET', '/api/v1/tasks/not-an-id')).toEqual({ error: 'not_found' });
    expect(parseWorkspaceApiRoute('GET', '/api/v1/comments')).toEqual({ error: 'not_found' });
    expect(parseWorkspaceApiRoute('GET', '/api/v2/tasks')).toEqual({ error: 'not_found' });
    expect(parseWorkspaceApiRoute('GET', `/api/v1/tasks/${TASK_ID}/comments`)).toEqual({ error: 'not_found' });
  });
});

describe('scopes', () => {
  const routes: WorkspaceApiRoute[] = [
    { kind: 'workspace' }, { kind: 'members' }, { kind: 'projects' }, { kind: 'tasks' },
    { kind: 'task', taskId: TASK_ID }, { kind: 'milestones' },
    { kind: 'list' }, { kind: 'upsert' }, { kind: 'delete', externalId: 'hr-1' },
  ];

  it('a token made for importing absences reads nothing but absences', () => {
    const allowed = routes.filter((route) => isRouteAllowed(route, ['time_off'])).map((route) => route.kind);
    expect(allowed).toEqual(['list', 'upsert', 'delete']);
  });

  it('a read token reads everything and changes nothing', () => {
    const allowed = routes.filter((route) => isRouteAllowed(route, ['read'])).map((route) => route.kind);
    expect(allowed).toEqual(['workspace', 'members', 'projects', 'tasks', 'task', 'milestones', 'list']);
  });

  it('no scope, or one this API does not know, opens nothing', () => {
    expect(routes.filter((route) => isRouteAllowed(route, []))).toEqual([]);
    expect(routes.filter((route) => isRouteAllowed(route, ['admin', 'write']))).toEqual([]);
    expect(scopesForRoute({ kind: 'upsert' })).toEqual(['time_off']);
  });
});

describe('paging', () => {
  it('turns limit + 1 rows into a page and a cursor for the next one', () => {
    const rows = [
      { id: 'a0000000-0000-4000-8000-000000000001', start_date: '2026-11-01' },
      { id: 'a0000000-0000-4000-8000-000000000002', start_date: '2026-11-03' },
      { id: 'a0000000-0000-4000-8000-000000000003', start_date: '2026-11-03' },
    ];
    const page = toPage(rows, 2, (row) => row.start_date);
    expect(page.items).toEqual(rows.slice(0, 2));
    expect(page.next_cursor).toBe('2026-11-03_a0000000-0000-4000-8000-000000000002');
    expect(decodeCursor(page.next_cursor!)).toEqual({ date: '2026-11-03', id: rows[1].id });

    expect(toPage(rows, 3, (row) => row.start_date)).toEqual({ items: rows, next_cursor: null });
    expect(toPage([], 200, () => '')).toEqual({ items: [], next_cursor: null });
  });

  it('accepts only cursors it produced', () => {
    const cursor = encodeCursor({ date: '2026-11-03', id: TASK_ID });
    expect(decodeCursor(cursor)).toEqual({ date: '2026-11-03', id: TASK_ID });
    for (const bad of [
      '', 'x', '2026-11-03', `2026-11-03_${TASK_ID}_x`, `03.11.2026_${TASK_ID}`, "2026-11-03_'; drop table tasks",
      // Shaped like a date, but no such day: these reached the database and came back as 500.
      `2026-13-45_${TASK_ID}`, `2026-02-30_${TASK_ID}`, `9999-99-99_${TASK_ID}`, `0000-01-01_${TASK_ID}`,
    ]) {
      expect(decodeCursor(bad), bad).toBeNull();
    }
  });
});

describe('parseTasksQuery', () => {
  it('has sensible defaults', () => {
    expect(parseTasksQuery(query(''))).toEqual({
      from: null, to: null, projectId: null, assigneeId: null, updatedSince: null, limit: 200, after: null,
    });
  });

  it('reads every filter', () => {
    expect(parseTasksQuery(query(
      `from=2026-11-01&to=2026-11-30&project_id=${TASK_ID}&assignee_id=${TASK_ID.toUpperCase()}`
      + `&updated_since=2026-11-01T09:00:00%2B01:00&limit=50&cursor=2026-11-03_${TASK_ID}`,
    ))).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
      projectId: TASK_ID,
      assigneeId: TASK_ID,
      updatedSince: '2026-11-01T09:00:00+01:00',
      limit: 50,
      after: { date: '2026-11-03', id: TASK_ID },
    });
  });

  it('names what is wrong with a filter', () => {
    const errorOf = (text: string) => {
      const result = parseTasksQuery(query(text));
      return 'error' in result ? result.error : null;
    };
    expect(errorOf('from=2026-13-01')).toMatch(/from must be a date/);
    expect(errorOf('from=0000-01-01')).toMatch(/from must be a date/);
    expect(errorOf('to=0000-12-31')).toMatch(/to must be a date/);
    expect(errorOf('updated_since=2026-02-30T00:00:00Z')).toMatch(/updated_since must be a timestamp/);
    expect(errorOf('from=2026-11-10&to=2026-11-01')).toMatch(/to must not be earlier/);
    expect(errorOf('project_id=42')).toMatch(/project_id must be an id/);
    expect(errorOf('assignee_id=anna@example.com')).toMatch(/assignee_id must be an id/);
    expect(errorOf('updated_since=2026-11-01')).toMatch(/updated_since must be a timestamp/);
    expect(errorOf('updated_since=2026-11-01T09:00:00')).toMatch(/updated_since must be a timestamp/);
    expect(errorOf('limit=0')).toMatch(/limit must be a number/);
    expect(errorOf(`limit=${MAX_PAGE_SIZE + 1}`)).toMatch(/limit must be a number/);
    expect(errorOf('limit=ten')).toMatch(/limit must be a number/);
    expect(errorOf('cursor=abc')).toMatch(/cursor is not one/);
    expect(errorOf(`limit=${MAX_PAGE_SIZE}`)).toBeNull();
  });
});

describe('isIsoTimestamp', () => {
  it('accepts a real moment with a zone and keeps its microseconds for the database', () => {
    for (const good of [
      '2026-11-01T09:00:00Z', '2026-11-01T09:00Z', '2026-11-01T09:00:00.259887+00:00',
      '2026-11-01T23:59:59.9-14:00', '2026-02-28T00:00:00+05:30', '0002-01-01T00:00:00Z', '9998-12-31T23:59:59Z',
    ]) {
      expect(isIsoTimestamp(good), good).toBe(true);
    }
    const parsed = parseTasksQuery(new URLSearchParams({ updated_since: '2026-11-11T12:35:00.259887+00:00' }));
    expect('error' in parsed ? null : parsed.updatedSince).toBe('2026-11-11T12:35:00.259887+00:00');
  });

  it('refuses days and times that do not exist, and years an offset could push out of range', () => {
    for (const bad of [
      '2026-02-30T00:00:00Z', '2026-02-31T09:00:00Z', '2026-13-01T00:00:00Z', '2026-11-01T24:00:00Z',
      '2026-11-01T09:60:00Z', '2026-11-01T09:00:60Z', '2026-11-01T09:00:00+15:00', '2026-11-01T09:00:00+01:60',
      '0000-01-01T00:00:00Z', '0001-01-01T00:00:00+14:00', '9999-12-31T23:59:59-14:00',
      '2026-11-01', '2026-11-01T09:00:00', '2026-11-01 09:00:00Z',
    ]) {
      expect(isIsoTimestamp(bad), bad).toBe(false);
    }
  });
});

describe('parseMilestonesQuery and parseProjectsQuery', () => {
  it('milestones take a range, a project and paging', () => {
    expect(parseMilestonesQuery(query(`from=2026-11-01&project_id=${TASK_ID}&limit=10`))).toEqual({
      from: '2026-11-01', to: null, projectId: TASK_ID, limit: 10, after: null,
    });
    expect(parseMilestonesQuery(query('to=soon'))).toEqual({ error: 'to must be a date (YYYY-MM-DD)' });
  });

  it('projects can be narrowed to archived or active', () => {
    expect(parseProjectsQuery(query(''))).toEqual({ archived: null });
    expect(parseProjectsQuery(query('archived=TRUE'))).toEqual({ archived: true });
    expect(parseProjectsQuery(query('archived=false'))).toEqual({ archived: false });
    expect(parseProjectsQuery(query('archived=yes'))).toEqual({ error: 'archived must be true or false' });
  });
});
