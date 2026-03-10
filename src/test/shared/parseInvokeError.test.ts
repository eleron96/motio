import { describe, expect, it } from 'vitest';
import { parseInvokeError } from '@/shared/lib/parseInvokeError';

describe('parseInvokeError', () => {
  it('returns error.message when no response is provided', async () => {
    const result = await parseInvokeError({ message: 'network error' });
    expect(result).toBe('network error');
  });

  it('returns error.message when response is undefined', async () => {
    const result = await parseInvokeError({ message: 'fallback' }, undefined);
    expect(result).toBe('fallback');
  });

  it('extracts the JSON error field from the response body when present', async () => {
    const response = new Response(JSON.stringify({ error: 'server error from JSON' }), {
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseInvokeError({ message: 'fallback' }, response);
    expect(result).toBe('server error from JSON');
  });

  it('falls back to plain text when response is not valid JSON', async () => {
    const response = new Response('plain text error', {
      headers: { 'content-type': 'text/plain' },
    });
    const result = await parseInvokeError({ message: 'fallback' }, response);
    expect(result).toBe('plain text error');
  });

  it('returns error.message when JSON body has no string error field', async () => {
    const response = new Response(JSON.stringify({ message: 'something else' }), {
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseInvokeError({ message: 'fallback' }, response);
    expect(result).toBe('fallback');
  });

  it('returns error.message when response text is empty', async () => {
    const response = new Response('', {
      headers: { 'content-type': 'text/plain' },
    });
    const result = await parseInvokeError({ message: 'fallback' }, response);
    expect(result).toBe('fallback');
  });

  it('ignores a non-string JSON error field and keeps error.message', async () => {
    const response = new Response(JSON.stringify({ error: 42 }), {
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseInvokeError({ message: 'fallback' }, response);
    expect(result).toBe('fallback');
  });
});
