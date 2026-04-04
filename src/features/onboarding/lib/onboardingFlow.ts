export const ONBOARDING_PENDING_PAGE_STORAGE_KEY = 'motio-onboarding-pending-page';

export const ONBOARDING_PAGE_ORDER = ['planner', 'dashboard', 'projects', 'members'] as const;

export type OnboardingPageId = (typeof ONBOARDING_PAGE_ORDER)[number];

const onboardingPagePaths: Record<OnboardingPageId, string> = {
  planner: '/app',
  dashboard: '/app/dashboard',
  projects: '/app/projects',
  members: '/app/members',
};

export const isOnboardingPageId = (value: unknown): value is OnboardingPageId => (
  typeof value === 'string' && ONBOARDING_PAGE_ORDER.includes(value as OnboardingPageId)
);

export const getOnboardingPagePath = (pageId: OnboardingPageId) => onboardingPagePaths[pageId];

export const getNextOnboardingPage = (pageId: OnboardingPageId): OnboardingPageId | null => {
  const currentIndex = ONBOARDING_PAGE_ORDER.indexOf(pageId);
  if (currentIndex < 0) return null;
  return ONBOARDING_PAGE_ORDER[currentIndex + 1] ?? null;
};
