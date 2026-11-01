import { describe, expect, it } from 'vitest';
import { IOS_HOME_SCREEN_APP_CLASS, markIosHomeScreenApp } from '@/shared/lib/iosHomeScreenApp';

const nav = (standalone?: boolean) => ({ standalone }) as unknown as Navigator;

describe('markIosHomeScreenApp', () => {
  it('marks an iOS Home Screen app', () => {
    const root = document.createElement('html');
    markIosHomeScreenApp(nav(true), root);
    expect(root.classList.contains(IOS_HOME_SCREEN_APP_CLASS)).toBe(true);
  });

  it('leaves a Safari tab alone (standalone is false)', () => {
    const root = document.createElement('html');
    markIosHomeScreenApp(nav(false), root);
    expect(root.classList.contains(IOS_HOME_SCREEN_APP_CLASS)).toBe(false);
  });

  it('leaves other browsers alone (no standalone property)', () => {
    const root = document.createElement('html');
    markIosHomeScreenApp(nav(undefined), root);
    expect(root.classList.contains(IOS_HOME_SCREEN_APP_CLASS)).toBe(false);
  });
});
