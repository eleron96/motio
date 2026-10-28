import { describe, expect, it } from 'vitest';

import {
  MAX_UPSERT_ITEMS,
  parseApiRoute,
  parseBearerToken,
  parseListQuery,
  parseUpsertBody,
  sha256Hex,
} from '../../../infra/supabase/functions/_shared/timeOffApi';

const TOKEN = `motio_${'a1'.repeat(32)}`;

describe('parseApiRoute', () => {
  it('maps the three time-off endpoints', () => {
    expect(parseApiRoute('GET', '/api/v1/time-off')).toEqual({ kind: 'list' });
    expect(parseApiRoute('PUT', '/api/v1/time-off')).toEqual({ kind: 'upsert' });
    expect(parseApiRoute('POST', '/api/v1/time-off/')).toEqual({ kind: 'upsert' });
    expect(parseApiRoute('DELETE', '/api/v1/time-off/hr%2F42')).toEqual({ kind: 'delete', externalId: 'hr/42' });
  });

  it('tells unknown paths from wrong methods', () => {
    expect(parseApiRoute('GET', '/api/v1/tasks')).toEqual({ error: 'not_found' });
    expect(parseApiRoute('GET', '/api/v2/time-off')).toEqual({ error: 'not_found' });
    expect(parseApiRoute('DELETE', '/api/v1/time-off')).toEqual({ error: 'method_not_allowed' });
    expect(parseApiRoute('GET', '/api/v1/time-off/hr-1')).toEqual({ error: 'method_not_allowed' });
  });

  it('rejects a malformed or oversized external id', () => {
    expect(parseApiRoute('DELETE', '/api/v1/time-off/%E0%A4%A')).toEqual({ error: 'not_found' });
    expect(parseApiRoute('DELETE', `/api/v1/time-off/${'x'.repeat(201)}`)).toEqual({ error: 'not_found' });
  });
});

describe('parseBearerToken', () => {
  it('accepts only a well-formed workspace token', () => {
    expect(parseBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(parseBearerToken(`bearer ${TOKEN} `)).toBe(TOKEN);
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(TOKEN)).toBeNull();
    expect(parseBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.e30.x')).toBeNull();
    expect(parseBearerToken(`Bearer ${TOKEN.toUpperCase()}`)).toBeNull();
  });
});

describe('parseListQuery', () => {
  it('takes optional real dates in order', () => {
    expect(parseListQuery(new URLSearchParams(''))).toEqual({ from: null, to: null });
    expect(parseListQuery(new URLSearchParams('from=2026-11-01&to=2026-11-30'))).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(parseListQuery(new URLSearchParams('from=2026-02-30'))).toHaveProperty('error');
    expect(parseListQuery(new URLSearchParams('to=30.11.2026'))).toHaveProperty('error');
    expect(parseListQuery(new URLSearchParams('from=2026-12-01&to=2026-11-01'))).toHaveProperty('error');
  });
});

describe('parseUpsertBody', () => {
  it('accepts {items} or a bare array within the limit', () => {
    expect(parseUpsertBody({ items: [{ external_id: 'a' }] })).toEqual({ items: [{ external_id: 'a' }] });
    expect(parseUpsertBody([{ external_id: 'a' }])).toEqual({ items: [{ external_id: 'a' }] });
    expect(parseUpsertBody({ items: [] })).toHaveProperty('error');
    expect(parseUpsertBody({ external_id: 'a' })).toHaveProperty('error');
    expect(parseUpsertBody(Array.from({ length: MAX_UPSERT_ITEMS + 1 }, () => ({})))).toHaveProperty('error');
  });
});

describe('sha256Hex', () => {
  it('matches the hash the database stores', async () => {
    // select encode(sha256(convert_to('abc', 'UTF8')), 'hex')
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
