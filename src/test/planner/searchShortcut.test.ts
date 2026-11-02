import { describe, expect, it } from 'vitest';
import {
  isApplePlatform,
  isSearchShortcut,
  isSearchSlash,
  searchShortcutLabel,
} from '@/features/planner/lib/searchShortcut';

const key = (overrides: Partial<Parameters<typeof isSearchShortcut>[0]>) => ({
  key: '',
  code: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe('isSearchShortcut', () => {
  it('opens on ⌘K and on Ctrl+K', () => {
    expect(isSearchShortcut(key({ key: 'k', code: 'KeyK', metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: 'k', code: 'KeyK', ctrlKey: true }))).toBe(true);
  });

  it('works in a Russian layout, where the key types «л»', () => {
    expect(isSearchShortcut(key({ key: 'л', code: 'KeyK', ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: 'л', code: 'KeyK', metaKey: true }))).toBe(true);
  });

  it('falls back to the character when the browser gives no key code', () => {
    expect(isSearchShortcut(key({ key: 'K', ctrlKey: true }))).toBe(true);
  });

  it('leaves K without a modifier, AltGr (Ctrl+Alt) and Ctrl+Shift+K alone', () => {
    expect(isSearchShortcut(key({ key: 'k', code: 'KeyK' }))).toBe(false);
    expect(isSearchShortcut(key({ key: 'ĸ', code: 'KeyK', ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: 'l', code: 'KeyL', ctrlKey: true }))).toBe(false);
  });
});

describe('isSearchSlash', () => {
  it('opens on "/" and on the slash key in any layout', () => {
    expect(isSearchSlash(key({ key: '/', code: 'Slash' }))).toBe(true);
    // Russian layout: the same key types ".".
    expect(isSearchSlash(key({ key: '.', code: 'Slash' }))).toBe(true);
    // Russian layout on Windows: "/" is Shift+\.
    expect(isSearchSlash(key({ key: '/', code: 'Backslash', shiftKey: true }))).toBe(true);
  });

  it('leaves "?" (Shift+/) and modified slashes alone', () => {
    expect(isSearchSlash(key({ key: '?', code: 'Slash', shiftKey: true }))).toBe(false);
    expect(isSearchSlash(key({ key: '/', code: 'Slash', ctrlKey: true }))).toBe(false);
    expect(isSearchSlash(key({ key: '/', code: 'Slash', metaKey: true }))).toBe(false);
  });
});

describe('searchShortcutLabel', () => {
  it('names the shortcut the way the platform does', () => {
    expect(isApplePlatform('MacIntel')).toBe(true);
    expect(isApplePlatform('macOS')).toBe(true);
    expect(isApplePlatform('iPad')).toBe(true);
    expect(searchShortcutLabel('macOS')).toBe('⌘K');
    expect(searchShortcutLabel('Windows')).toBe('Ctrl+K');
    expect(searchShortcutLabel('Win32')).toBe('Ctrl+K');
    expect(searchShortcutLabel('Linux x86_64')).toBe('Ctrl+K');
  });
});
