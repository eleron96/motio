import { Suspense } from 'react';
import { useEasterEgg } from './useEasterEgg';

interface Props {
  /** Whether the daily brief is currently open. */
  active: boolean;
}

/**
 * Single integration point for the daily-brief easter eggs. Renders the current
 * user's egg (if any) lazily, so non-matching users never download its chunk.
 *
 * To remove the whole easter-egg feature: delete the `easter-eggs/` folder and
 * the one `<EasterEggSlot />` line (plus its import) in DailyBriefModal.
 */
export const EasterEggSlot = ({ active }: Props) => {
  const Egg = useEasterEgg();

  if (!active || !Egg) return null;

  return (
    <Suspense fallback={null}>
      <Egg />
    </Suspense>
  );
};
