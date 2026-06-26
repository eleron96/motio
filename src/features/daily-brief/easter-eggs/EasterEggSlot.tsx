import { Suspense } from 'react';
import { EasterEggBoundary } from './EasterEggBoundary';
import { useEasterEgg } from './useEasterEgg';

interface Props {
  /** Whether the daily brief is currently open. */
  active: boolean;
}

/**
 * Single integration point for the daily-brief easter eggs. Resolves the current
 * user's egg from the DB (only while the brief is open) and renders it lazily —
 * non-matching users never download a chunk. The egg is wrapped in its own error
 * boundary so a failing chunk/render can never take down the brief.
 *
 * To remove the whole easter-egg feature: delete the `easter-eggs/` folder and
 * the one `<EasterEggSlot />` line (plus its import) in DailyBriefModal.
 */
export const EasterEggSlot = ({ active }: Props) => {
  const Egg = useEasterEgg(active);

  if (!active || !Egg) return null;

  return (
    <EasterEggBoundary>
      <Suspense fallback={null}>
        <Egg />
      </Suspense>
    </EasterEggBoundary>
  );
};
