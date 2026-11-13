import { describe, expect, it } from 'vitest';

import { MCP_TOOLS, planToolCall } from '../../../infra/supabase/functions/_shared/mcpTools';

const TASK_ID = '3f0c7a52-1b2c-4d3e-8f90-a1b2c3d4e5f6';

describe('MCP_TOOLS', () => {
  it('lists read-only tools in a fixed order, each with a closed input schema', () => {
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual([
      'get_workspace', 'list_people', 'list_projects', 'find_tasks', 'get_task', 'list_milestones', 'list_time_off',
    ]);
    for (const tool of MCP_TOOLS) {
      expect(tool.name).toMatch(/^[a-z_]{1,64}$/);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
  });

  it('offers nothing that writes', () => {
    expect(MCP_TOOLS.filter((tool) => /create|update|delete|set|add|remove|write/i.test(tool.name))).toEqual([]);
  });
});

describe('planToolCall', () => {
  const plan = (name: unknown, args?: unknown) => {
    const result = planToolCall(name, args);
    return 'target' in result ? { target: result.target, query: result.params.toString() } : result;
  };

  it('maps each tool onto what it reads', () => {
    expect(plan('get_workspace')).toEqual({ target: { kind: 'workspace' }, query: '' });
    expect(plan('list_people', {})).toEqual({ target: { kind: 'members' }, query: '' });
    expect(plan('list_projects', { archived: false })).toEqual({ target: { kind: 'projects' }, query: 'archived=false' });
    expect(plan('get_task', { id: TASK_ID.toUpperCase() })).toEqual({ target: { kind: 'task', taskId: TASK_ID }, query: '' });
    expect(plan('list_time_off', { from: '2026-11-01', to: '2026-11-30' }))
      .toEqual({ target: { kind: 'time-off' }, query: 'from=2026-11-01&to=2026-11-30' });
  });

  it('pages tasks and milestones by 100 unless asked otherwise', () => {
    expect(plan('find_tasks', { from: '2026-11-01', assignee_id: TASK_ID }))
      .toEqual({ target: { kind: 'tasks' }, query: `from=2026-11-01&assignee_id=${TASK_ID}&limit=100` });
    expect(plan('find_tasks', { limit: 20 })).toEqual({ target: { kind: 'tasks' }, query: 'limit=20' });
    expect(plan('list_milestones', null)).toEqual({ target: { kind: 'milestones' }, query: 'limit=100' });
  });

  it('skips nulls and refuses what the schema does not allow', () => {
    expect(plan('list_projects', { archived: null })).toEqual({ target: { kind: 'projects' }, query: '' });
    expect(plan('list_projects', { archived: 'yes' })).toEqual({ invalid: 'archived must be a boolean' });
    expect(plan('find_tasks', { limit: '20' })).toEqual({ invalid: 'limit must be an integer' });
    expect(plan('find_tasks', { limit: 2.5 })).toEqual({ invalid: 'limit must be an integer' });
    expect(plan('find_tasks', { workspace_id: TASK_ID })).toEqual({ invalid: 'unknown argument: workspace_id' });
    expect(plan('find_tasks', ['2026-11-01'])).toEqual({ invalid: 'arguments must be an object' });
    // Names every object inherits are unknown arguments like any other.
    for (const key of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(plan('get_workspace', { [key]: 'x' }), key).toEqual({ invalid: `unknown argument: ${key}` });
      expect(plan('find_tasks', { [key]: null }), key).toEqual({ invalid: `unknown argument: ${key}` });
    }
    expect(plan('find_tasks', JSON.parse('{"__proto__": {"limit": 1}}'))).toEqual({ invalid: 'unknown argument: __proto__' });
    expect(plan('get_task', {})).toEqual({ invalid: 'id is required' });
    expect(plan('get_task', { id: '42' })).toEqual({ invalid: 'id must be a task id (UUID)' });
  });

  it('does not know tools it does not list', () => {
    expect(plan('delete_task', { id: TASK_ID })).toEqual({ unknownTool: true });
    expect(plan(undefined)).toEqual({ unknownTool: true });
    expect(plan('__proto__')).toEqual({ unknownTool: true });
  });
});
