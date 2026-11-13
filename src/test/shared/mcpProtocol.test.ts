import { describe, expect, it } from 'vitest';

import {
  LEGACY_VERSIONS,
  MODERN_VERSION,
  SUPPORTED_VERSIONS,
  planMcpMessage,
  toolProtocolError,
  toolReply,
  type McpHeaders,
} from '../../../infra/supabase/functions/_shared/mcpProtocol';

const META = {
  'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
  'io.modelcontextprotocol/clientInfo': { name: 'ExampleClient', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

const modern = (method: string, params: Record<string, unknown> = {}, headers: Partial<McpHeaders> = {}) =>
  planMcpMessage(
    { jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: META } },
    { protocolVersion: MODERN_VERSION, method, name: null, ...headers },
  );

const legacy = (method: string, params?: Record<string, unknown>) =>
  planMcpMessage(
    { jsonrpc: '2.0', id: 7, method, ...(params ? { params } : {}) },
    { protocolVersion: null, method: null, name: null },
  );

const notification = (method: string, params?: Record<string, unknown>) =>
  planMcpMessage(
    { jsonrpc: '2.0', method, ...(params ? { params } : {}) },
    { protocolVersion: null, method: null, name: null },
  );

const replyOf = (plan: ReturnType<typeof planMcpMessage>) => {
  if (plan.kind !== 'reply') throw new Error('expected a reply');
  return plan.reply;
};
const errorOf = (plan: ReturnType<typeof planMcpMessage>) => {
  const reply = replyOf(plan);
  const error = (reply.body as { error: { code: number; data?: unknown } }).error;
  return { status: reply.status, code: error.code, data: error.data };
};
const resultOf = (plan: ReturnType<typeof planMcpMessage>) =>
  (replyOf(plan).body as { result: Record<string, unknown> }).result;

describe('modern clients (2026-07-28): no handshake, metadata on every request', () => {
  it('answers server/discover with the versions and capabilities it speaks', () => {
    const result = resultOf(modern('server/discover'));
    expect(result.resultType).toBe('complete');
    expect(result.supportedVersions).toEqual([MODERN_VERSION]);
    // Caching hints are mandatory on server/discover and tools/list.
    expect(result).toMatchObject({ ttlMs: 3600000, cacheScope: 'public' });
    expect(result.capabilities).toEqual({ tools: {} });
    expect(result._meta).toEqual({ 'io.modelcontextprotocol/serverInfo': { name: 'motio', title: 'Motio', version: '1.0.0' } });
    expect(String(result.instructions)).toMatch(/Read-only/);
  });

  it('lists the tools', () => {
    const result = resultOf(modern('tools/list'));
    expect(result.resultType).toBe('complete');
    expect((result.tools as Array<{ name: string }>).map((tool) => tool.name)).toContain('find_tasks');
    expect(result).toMatchObject({ ttlMs: 3600000, cacheScope: 'public' });
  });

  it('hands a tool call over once the headers match the body', () => {
    expect(modern('tools/call', { name: 'find_tasks', arguments: { limit: 5 } }, { name: 'find_tasks' }))
      .toEqual({ kind: 'tool', era: 'modern', id: 1, name: 'find_tasks', args: { limit: 5 } });
    // A name that is not plain ASCII travels base64-encoded.
    expect(modern('tools/call', { name: 'задачи' }, { name: '=?base64?0LfQsNC00LDRh9C4?=' }))
      .toMatchObject({ kind: 'tool', name: 'задачи' });
  });

  it('rejects headers that disagree with the body', () => {
    expect(errorOf(modern('tools/list', {}, { protocolVersion: '2025-11-25' }))).toMatchObject({ status: 400, code: -32020 });
    expect(errorOf(modern('tools/list', {}, { protocolVersion: null }))).toMatchObject({ status: 400, code: -32020 });
    expect(errorOf(modern('tools/list', {}, { method: 'tools/call' }))).toMatchObject({ status: 400, code: -32020 });
    expect(errorOf(modern('tools/list', {}, { method: null }))).toMatchObject({ status: 400, code: -32020 });
    expect(errorOf(modern('tools/call', { name: 'get_task' }, { name: 'find_tasks' }))).toMatchObject({ status: 400, code: -32020 });
    expect(errorOf(modern('tools/call', { name: 'get_task' }, { name: null }))).toMatchObject({ status: 400, code: -32020 });
  });

  it('names the versions it supports when asked for another one', () => {
    const plan = planMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { ...META, 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } } },
      { protocolVersion: '2099-01-01', method: 'tools/list', name: null },
    );
    expect(errorOf(plan)).toEqual({ status: 400, code: -32022, data: { supported: SUPPORTED_VERSIONS, requested: '2099-01-01' } });
  });

  it('never offers a version it would refuse in this shape', () => {
    // A handshake-era version sent the modern way is refused — and is not in the list to retry with.
    const plan = planMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { ...META, 'io.modelcontextprotocol/protocolVersion': '2025-11-25' } } },
      { protocolVersion: '2025-11-25', method: 'tools/list', name: null },
    );
    expect(errorOf(plan)).toEqual({ status: 400, code: -32022, data: { supported: [MODERN_VERSION], requested: '2025-11-25' } });
    expect(SUPPORTED_VERSIONS).not.toContain('2025-11-25');
  });

  it('tells a client with an unknown version header which versions exist, not which field is missing', () => {
    for (const version of ['2024-11-05', 'garbage', '1900-01-01']) {
      const plan = planMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { protocolVersion: version, method: null, name: null });
      expect(errorOf(plan), version).toEqual({ status: 400, code: -32022, data: { supported: [MODERN_VERSION], requested: version } });
    }
  });

  it('requires the metadata a modern request must carry', () => {
    const withoutCapabilities = planMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN_VERSION } } },
      { protocolVersion: MODERN_VERSION, method: 'tools/list', name: null },
    );
    expect(errorOf(withoutCapabilities)).toMatchObject({ status: 400, code: -32602 });
    // The header says modern, the body carries no version at all.
    const withoutMeta = planMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { protocolVersion: MODERN_VERSION, method: 'tools/list', name: null },
    );
    expect(errorOf(withoutMeta)).toMatchObject({ status: 400, code: -32602 });
    expect(errorOf(modern('tools/call', {}, { name: 'x' }))).toMatchObject({ status: 400, code: -32602 });
  });

  it('answers 404 with a JSON-RPC error for a method it does not implement', () => {
    expect(errorOf(modern('resources/list'))).toMatchObject({ status: 404, code: -32601 });
    expect(errorOf(modern('subscriptions/listen'))).toMatchObject({ status: 404, code: -32601 });
  });
});

describe('legacy clients: the initialize handshake', () => {
  it('agrees on the client\'s version when it speaks it, else offers its latest', () => {
    for (const version of LEGACY_VERSIONS) {
      expect(resultOf(legacy('initialize', { protocolVersion: version, capabilities: {} })).protocolVersion).toBe(version);
    }
    expect(resultOf(legacy('initialize', { protocolVersion: '2024-11-05' })).protocolVersion).toBe(LEGACY_VERSIONS[0]);
    expect(resultOf(legacy('initialize', { protocolVersion: MODERN_VERSION })).protocolVersion).toBe(LEGACY_VERSIONS[0]);

    const result = resultOf(legacy('initialize', { protocolVersion: '2025-06-18' }));
    expect(result).toMatchObject({ capabilities: { tools: {} }, serverInfo: { name: 'motio' } });
    expect(result).not.toHaveProperty('resultType');
  });

  it('accepts notifications without a reply', () => {
    expect(replyOf(notification('notifications/initialized'))).toEqual({ status: 202, body: null });
    expect(replyOf(notification('notifications/cancelled', { requestId: 3 }))).toEqual({ status: 202, body: null });
  });

  it('serves ping, tools/list and tools/call without any metadata', () => {
    expect(resultOf(legacy('ping'))).toEqual({});
    expect((resultOf(legacy('tools/list')).tools as unknown[]).length).toBeGreaterThan(0);
    expect(legacy('tools/call', { name: 'get_task', arguments: { id: 'x' } }))
      .toEqual({ kind: 'tool', era: 'legacy', id: 7, name: 'get_task', args: { id: 'x' } });
    // A legacy client that sends its negotiated version in the header stays legacy.
    expect(planMcpMessage({ jsonrpc: '2.0', id: 'a', method: 'tools/list' }, { protocolVersion: '2025-06-18', method: null, name: null }))
      .toMatchObject({ kind: 'reply', reply: { status: 200 } });
  });

  it('reports unknown methods inside a 200, as those revisions do', () => {
    expect(errorOf(legacy('resources/list'))).toMatchObject({ status: 200, code: -32601 });
    expect(errorOf(legacy('tools/call', {}))).toMatchObject({ status: 200, code: -32602 });
  });
});

describe('malformed messages', () => {
  const headers: McpHeaders = { protocolVersion: null, method: null, name: null };

  it('refuses anything that is not one JSON-RPC 2.0 message', () => {
    for (const body of [null, 'tools/list', 42, [], [{ jsonrpc: '2.0', id: 1, method: 'ping' }], {}, { jsonrpc: '1.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 1 }]) {
      expect(errorOf(planMcpMessage(body, headers)), JSON.stringify(body)).toMatchObject({ status: 400, code: -32600 });
    }
    expect(errorOf(planMcpMessage({ jsonrpc: '2.0', id: null, method: 'ping' }, headers))).toMatchObject({ status: 400, code: -32600 });
    expect(errorOf(planMcpMessage({ jsonrpc: '2.0', id: { a: 1 }, method: 'ping' }, headers))).toMatchObject({ status: 400, code: -32600 });
  });
});

describe('tool replies', () => {
  it('returns data as text and as structured content', () => {
    const data = { items: [{ id: 'a', title: 'First' }], next_cursor: null };
    expect(toolReply('modern', 3, { data })).toEqual({
      status: 200,
      body: {
        jsonrpc: '2.0',
        id: 3,
        result: {
          resultType: 'complete',
          content: [{ type: 'text', text: JSON.stringify(data) }],
          structuredContent: data,
          isError: false,
          _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'motio', title: 'Motio', version: '1.0.0' } },
        },
      },
    });
    expect((toolReply('legacy', 'x', { data }).body as { result: object }).result).toEqual({
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
      isError: false,
    });
  });

  it('reports what the model can fix as a tool error, and an unknown tool as a protocol error', () => {
    expect((toolReply('modern', 3, { error: 'from must be a date (YYYY-MM-DD)' }).body as { result: object }).result)
      .toMatchObject({ isError: true, content: [{ type: 'text', text: 'from must be a date (YYYY-MM-DD)' }] });
    expect(toolProtocolError('modern', 3, 'Unknown tool: x')).toMatchObject({ status: 400, body: { id: 3, error: { code: -32602 } } });
    expect(toolProtocolError('legacy', 3, 'Unknown tool: x')).toMatchObject({ status: 200, body: { id: 3, error: { code: -32602 } } });
  });
});
