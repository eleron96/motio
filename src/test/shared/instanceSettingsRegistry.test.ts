import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INSTANCE_SETTINGS } from '@/shared/contracts/instanceSettingsRegistry';

// The edge runtime cannot import from src/, so the list of server settings
// exists twice; infra/scripts/motio-settings.sh reads the JSON block of the
// functions copy. All three must agree.
const functionsCopy = readFileSync('infra/supabase/functions/_shared/instanceSettingsRegistry.ts', 'utf8');
const appCopy = readFileSync('src/shared/contracts/instanceSettingsRegistry.ts', 'utf8');

// The same extraction the command line does (motio-settings.sh).
const registryJson = (source: string) => {
  const start = source.indexOf('// registry:begin');
  const end = source.indexOf('// registry:end');
  const block = source.slice(start, end);
  return JSON.parse(block.slice(block.indexOf('['), block.lastIndexOf(']') + 1)) as Array<Record<string, unknown>>;
};

describe('server settings registry', () => {
  it('is the same file in the app and in the edge functions', () => {
    expect(appCopy).toBe(functionsCopy);
  });

  it('has a JSON block the command line can read, equal to what the app imports', () => {
    expect(registryJson(functionsCopy)).toEqual(INSTANCE_SETTINGS);
  });

  it('keeps every default as Motio works without the setting: off', () => {
    for (const setting of INSTANCE_SETTINGS) {
      expect(setting.default).toBe(false);
    }
  });

  it('uses unique keys the database accepts ("area.name")', () => {
    const keys = INSTANCE_SETTINGS.map((setting) => setting.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)+$/);
      expect(key.length).toBeLessThanOrEqual(100);
    }
  });

  it('describes every setting for the command line', () => {
    for (const setting of INSTANCE_SETTINGS) {
      expect(setting.description.length).toBeGreaterThan(10);
      expect(setting.description).toMatch(/^[\x20-\x7E]+$/);
    }
  });
});
