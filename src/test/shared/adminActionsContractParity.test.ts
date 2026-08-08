import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_ACTIONS, PUSH_ACTIONS, INVITE_ACTIONS } from '@/shared/contracts/actions';

/**
 * The edge runtime cannot import from `src/`, so it carries its own copy of the
 * action contract. Adding an action to one copy and not the other produced
 * `z.literal(undefined)` in the request schema, which collapsed the
 * discriminated union and took *every* function down on boot — admin, inbox,
 * push and holidays alike.
 *
 * The copies are parsed as text rather than imported: the functions file is
 * Deno-flavoured TypeScript outside the app's tsconfig.
 */
const parseActions = (source: string, constName: string): Record<string, string> => {
  const start = source.indexOf(`export const ${constName} = {`);
  if (start === -1) throw new Error(`${constName} not found in the functions copy`);
  const end = source.indexOf('} as const;', start);
  const body = source.slice(start, end);

  const entries: Record<string, string> = {};
  for (const match of body.matchAll(/^\s*([A-Z0-9_]+):\s*'([^']+)'/gm)) {
    entries[match[1]] = match[2];
  }
  return entries;
};

const functionsSource = readFileSync('infra/supabase/functions/_shared/actions.ts', 'utf8');

describe('action contracts stay in sync between the app and the edge functions', () => {
  it.each([
    ['ADMIN_ACTIONS', ADMIN_ACTIONS as Record<string, string>],
    ['PUSH_ACTIONS', PUSH_ACTIONS as Record<string, string>],
    ['INVITE_ACTIONS', INVITE_ACTIONS as Record<string, string>],
  ])('%s matches', (constName, appActions) => {
    const edgeActions = parseActions(functionsSource, constName);

    expect(Object.keys(edgeActions).sort()).toEqual(Object.keys(appActions).sort());
    expect(edgeActions).toEqual(appActions);
  });
});
