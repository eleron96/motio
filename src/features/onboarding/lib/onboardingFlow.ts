import type { AppBasePath } from '@/features/workspace/lib/appNavigation';

export const ONBOARDING_PENDING_PAGE_STORAGE_KEY = 'motio-onboarding-pending-page';

export const ONBOARDING_PAGE_ORDER = ['planner', 'dashboard', 'projects', 'members'] as const;

export type OnboardingPageId = (typeof ONBOARDING_PAGE_ORDER)[number];

// Relative to the section the tour runs in: '/app' for the product, '/demo' for
// the sandbox. A hard '/app/…' here walked demo visitors out of the sandbox into
// the real app under the fake demo user.
const onboardingPageTails: Record<OnboardingPageId, string> = {
  planner: '',
  dashboard: '/dashboard',
  projects: '/projects',
  members: '/members',
};

export const isOnboardingPageId = (value: unknown): value is OnboardingPageId => (
  typeof value === 'string' && ONBOARDING_PAGE_ORDER.includes(value as OnboardingPageId)
);

export const getOnboardingPagePath = (pageId: OnboardingPageId, basePath: AppBasePath) => (
  `${basePath}${onboardingPageTails[pageId]}`
);

export const getNextOnboardingPage = (pageId: OnboardingPageId): OnboardingPageId | null => {
  const currentIndex = ONBOARDING_PAGE_ORDER.indexOf(pageId);
  if (currentIndex < 0) return null;
  return ONBOARDING_PAGE_ORDER[currentIndex + 1] ?? null;
};
