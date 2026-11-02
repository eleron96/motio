import React, { Suspense } from 'react';
import { useOnboardingTour } from '@/features/onboarding/hooks/useOnboardingTour';
import { lazyNamed } from '@/shared/lib/lazyComponent';

// Most people have long met the timeline: the cards' code loads only for the
// phone that is about to show them, like driver.js does for the desktop tour.
const MobileOnboardingCards = lazyNamed(
  () => import('@/features/onboarding/components/MobileOnboardingCards'),
  'MobileOnboardingCards',
);

type OnboardingTourProps = {
  canEdit: boolean;
  isAdmin: boolean;
};

/**
 * The timeline's first meeting with a newcomer. The desktop tour draws itself
 * (driver.js); only the phone cards need a place in the page.
 */
export const OnboardingTour: React.FC<OnboardingTourProps> = ({ canEdit, isAdmin }) => {
  const { mobileIntro, closeMobileIntro } = useOnboardingTour({ canEdit, isAdmin });

  if (mobileIntro === 'hidden') return null;

  return (
    <Suspense fallback={null}>
      <MobileOnboardingCards
        open={mobileIntro === 'open'}
        canEdit={canEdit}
        onClose={closeMobileIntro}
      />
    </Suspense>
  );
};
