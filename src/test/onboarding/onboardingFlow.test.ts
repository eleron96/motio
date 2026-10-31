import { describe, expect, it } from 'vitest';
import {
  getNextOnboardingPage,
  getOnboardingPagePath,
  isOnboardingPageId,
  ONBOARDING_PAGE_ORDER,
} from '@/features/onboarding/lib/onboardingFlow';

describe('onboardingFlow', () => {
  it('keeps the expected page order and routes', () => {
    expect(ONBOARDING_PAGE_ORDER).toEqual(['planner', 'dashboard', 'projects', 'members']);
    expect(getOnboardingPagePath('planner', '/app')).toBe('/app');
    expect(getOnboardingPagePath('dashboard', '/app')).toBe('/app/dashboard');
    expect(getOnboardingPagePath('projects', '/app')).toBe('/app/projects');
    expect(getOnboardingPagePath('members', '/app')).toBe('/app/members');
  });

  it('keeps a tour started in the sandbox inside the sandbox', () => {
    // A hard '/app/…' walked demo visitors into the real app as the fake demo user.
    expect(getOnboardingPagePath('planner', '/demo')).toBe('/demo');
    expect(getOnboardingPagePath('dashboard', '/demo')).toBe('/demo/dashboard');
    expect(getOnboardingPagePath('projects', '/demo')).toBe('/demo/projects');
    expect(getOnboardingPagePath('members', '/demo')).toBe('/demo/members');
  });

  it('resolves the next onboarding page in sequence', () => {
    expect(getNextOnboardingPage('planner')).toBe('dashboard');
    expect(getNextOnboardingPage('dashboard')).toBe('projects');
    expect(getNextOnboardingPage('projects')).toBe('members');
    expect(getNextOnboardingPage('members')).toBeNull();
  });

  it('validates page ids from persisted state', () => {
    expect(isOnboardingPageId('planner')).toBe(true);
    expect(isOnboardingPageId('dashboard')).toBe(true);
    expect(isOnboardingPageId('random')).toBe(false);
    expect(isOnboardingPageId(null)).toBe(false);
  });
});
