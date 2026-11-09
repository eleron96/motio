import { describe, expect, it } from 'vitest';

import {
  clientInstanceSettingValues,
  instanceSettingValues,
  isEnvSwitchOn,
  isInstanceSettingKey,
  resolveInstanceSettings,
} from '../../../infra/supabase/functions/_shared/instanceSettings';

const noEnv = () => undefined;
const envOf = (values: Record<string, string>) => (name: string) => values[name];

const byKey = (resolved: ReturnType<typeof resolveInstanceSettings>, key: string) => {
  const found = resolved.find((setting) => setting.key === key);
  if (!found) throw new Error(`no ${key}`);
  return found;
};

describe('server settings: how a value is decided', () => {
  it('is Motio as before when nothing is stored: every setting off, from the defaults', () => {
    const resolved = resolveInstanceSettings([], noEnv);
    expect(resolved.length).toBeGreaterThan(0);
    for (const setting of resolved) {
      expect(setting.value).toBe(false);
      expect(setting.source).toBe('default');
    }
  });

  it('takes what a super admin stored', () => {
    const resolved = resolveInstanceSettings(
      [{ key: 'timeline.density', value: true, updated_at: '2026-11-09T10:00:00Z', updated_by: 'u1' }],
      noEnv,
    );
    const density = byKey(resolved, 'timeline.density');
    expect(density).toMatchObject({ value: true, source: 'admin', updatedAt: '2026-11-09T10:00:00Z', updatedBy: 'u1' });
    expect(byKey(resolved, 'workspaces.closures').value).toBe(false);
  });

  it('keeps a stored "off" as a choice of its own', () => {
    const resolved = resolveInstanceSettings([{ key: 'timeline.density', value: false }], noEnv);
    expect(byKey(resolved, 'timeline.density')).toMatchObject({ value: false, source: 'admin' });
  });

  it('ignores rows it does not know and values that are not true or false', () => {
    const resolved = resolveInstanceSettings(
      [
        { key: 'something.else', value: true },
        { key: 'timeline.density', value: 'yes' },
      ],
      noEnv,
    );
    expect(resolved.some((setting) => setting.key === ('something.else' as never))).toBe(false);
    expect(byKey(resolved, 'timeline.density')).toMatchObject({ value: false, source: 'default' });
  });

  it('lets an older .env key set to true turn the setting on and lock it', () => {
    const resolved = resolveInstanceSettings(
      [{ key: 'groups.workspaces', value: false, updated_by: 'u1' }],
      envOf({ KEYCLOAK_WORKSPACES_FROM_GROUPS: 'true' }),
    );
    expect(byKey(resolved, 'groups.workspaces')).toMatchObject({
      value: true,
      source: 'env',
      env: 'KEYCLOAK_WORKSPACES_FROM_GROUPS',
      updatedBy: null,
    });
  });

  it('does not lock anything with false or an empty .env value (update writes "=false" into every install)', () => {
    for (const raw of ['false', '', ' ', 'no', '1']) {
      const resolved = resolveInstanceSettings(
        [{ key: 'groups.workspaces', value: true }],
        envOf({ KEYCLOAK_WORKSPACES_FROM_GROUPS: raw }),
      );
      expect(byKey(resolved, 'groups.workspaces')).toMatchObject({ value: true, source: 'admin' });
    }
  });

  it('reads the .env switch the same way as before: only true, any case and spaces', () => {
    expect(isEnvSwitchOn(' TRUE ')).toBe(true);
    expect(isEnvSwitchOn('true')).toBe(true);
    expect(isEnvSwitchOn('false')).toBe(false);
    expect(isEnvSwitchOn(undefined)).toBe(false);
  });

  it('hands the app only the settings it needs', () => {
    const resolved = resolveInstanceSettings([{ key: 'groups.workspaces', value: true }], noEnv);
    const client = clientInstanceSettingValues(resolved);
    expect(client).not.toHaveProperty('groups.workspaces');
    expect(client).toHaveProperty('timeline.density', false);
    expect(instanceSettingValues(resolved)['groups.workspaces']).toBe(true);
  });

  it('knows its keys', () => {
    expect(isInstanceSettingKey('timeline.density')).toBe(true);
    expect(isInstanceSettingKey('timeline.nothing')).toBe(false);
  });
});
