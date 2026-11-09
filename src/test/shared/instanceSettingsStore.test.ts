import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store reads its cache when the module loads: import it fresh per test.
const loadStore = async () => {
  vi.resetModules();
  return import('@/shared/store/instanceSettingsStore');
};

const STORAGE_KEY = 'motio-instance-settings.v1';

describe('instance settings in the app', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/app');
  });

  it('starts with every setting off: Motio as before', async () => {
    const { useInstanceSettingsStore } = await loadStore();
    const values = useInstanceSettingsStore.getState().values;
    expect(Object.values(values).every((value) => value === false)).toBe(true);
    expect(values).toHaveProperty('timeline.density', false);
    // Server-only settings never reach the app.
    expect(values).not.toHaveProperty('groups.workspaces');
  });

  it('takes the values whoami hands over and keeps them for the next visit', async () => {
    const { useInstanceSettingsStore } = await loadStore();
    useInstanceSettingsStore.getState().applyServerValues({ 'timeline.density': true, 'groups.workspaces': true });
    expect(useInstanceSettingsStore.getState().values['timeline.density']).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ 'timeline.density': true });

    const again = await loadStore();
    expect(again.useInstanceSettingsStore.getState().values['timeline.density']).toBe(true);
  });

  it('changes nothing when an older server sends no settings', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'workspaces.closures': true }));
    const { useInstanceSettingsStore } = await loadStore();
    useInstanceSettingsStore.getState().applyServerValues(undefined);
    expect(useInstanceSettingsStore.getState().values['workspaces.closures']).toBe(true);
  });

  it('ignores values that are not true or false', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"timeline.density":"yes","nope":true}');
    const { useInstanceSettingsStore, sanitizeClientInstanceSettings } = await loadStore();
    expect(useInstanceSettingsStore.getState().values['timeline.density']).toBe(false);
    expect(sanitizeClientInstanceSettings('broken')['timeline.density']).toBe(false);
  });

  it('survives a broken cache', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    const { useInstanceSettingsStore } = await loadStore();
    expect(useInstanceSettingsStore.getState().values['timeline.density']).toBe(false);
  });

  it('keeps /demo on the defaults', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'timeline.density': true }));
    window.history.replaceState(null, '', '/demo');
    const { useInstanceSettingsStore } = await loadStore();
    expect(useInstanceSettingsStore.getState().values['timeline.density']).toBe(false);
    useInstanceSettingsStore.getState().applyServerValues({ 'timeline.density': true });
    expect(useInstanceSettingsStore.getState().values['timeline.density']).toBe(false);
  });
});
