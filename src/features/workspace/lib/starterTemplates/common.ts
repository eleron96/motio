import { t } from '@lingui/macro';
import type {
  StarterPerson,
  StarterStatus,
  StarterTag,
  StarterTaskType,
} from '@/shared/domain/starterTemplate';

/**
 * Pieces every template shares. Each is a function, not a constant: the
 * wording has to be read in the interface language at the moment the template
 * is applied, and a module-level `t` would freeze whatever language was active
 * when the file first loaded.
 *
 * Nothing here belongs to one country: no design stages, permits or standards
 * by name — those differ from place to place and teams add their own.
 */

/** Open → in progress → (the template's own step) → done, plus cancelled. */
export const statusesWith = (ownStep: StarterStatus | null): StarterStatus[] => [
  { key: 'todo', name: t({ message: 'To do', context: 'task status' }), emoji: '📝', color: '#94a3b8' },
  { key: 'doing', name: t({ message: 'In progress', context: 'task status' }), emoji: '🚧', color: '#3b82f6' },
  ...(ownStep ? [ownStep] : []),
  { key: 'done', name: t({ message: 'Done', context: 'task status' }), emoji: '✅', color: '#22c55e', isFinal: true },
  { key: 'cancelled', name: t({ message: 'Cancelled', context: 'task status' }), emoji: '🚫', color: '#ef4444', isCancelled: true },
];

export const meetingType = (): StarterTaskType => ({ key: 'meeting', name: t`Meeting` });

export const urgentTag = (): StarterTag => ({ key: 'urgent', name: t`Urgent`, color: '#ef4444' });

export const disciplineTags = (): StarterTag[] => [
  { key: 'arch', name: t`Architecture`, color: '#8b5cf6' },
  { key: 'struct', name: t`Structure`, color: '#0ea5e9' },
  { key: 'mep', name: t`Building services`, color: '#f97316' },
];

const fictional = 'Fictional colleague in example data: use a common name of the language, not a translation.';

/** Made-up colleagues: rows on the timeline without an account behind them. */
export const people = {
  anna: (): StarterPerson => ({ key: 'anna', name: t({ message: 'Anna Peters', comment: fictional }) }),
  mark: (): StarterPerson => ({ key: 'mark', name: t({ message: 'Mark Collins', comment: fictional }) }),
  sofia: (): StarterPerson => ({ key: 'sofia', name: t({ message: 'Sofia Reyes', comment: fictional }) }),
  tom: (): StarterPerson => ({ key: 'tom', name: t({ message: 'Tom Bennett', comment: fictional }) }),
  nina: (): StarterPerson => ({ key: 'nina', name: t({ message: 'Nina Clarke', comment: fictional }) }),
};

export const vacation = () => t`Vacation`;

/** Weekday numbers as `Date.getDay()` has them. */
export const MONDAY = 1;
export const TUESDAY = 2;

/** About three months of a weekly series: long enough to look real, short enough to tidy away. */
export const WEEKS_OF_EXAMPLES = 12;
