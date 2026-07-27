import { t } from '@lingui/macro';

// The decorative motif stamped on a person's time-off days.
//
// It is DECORATION and personal flair, nothing more: every motif is drawn in the
// same --muted-foreground at the same alpha, so no choice is louder than another
// and none of them encodes a reason (holiday / sick leave / trip). The grey band
// keeps carrying the meaning "not a working day"; the motif only makes that band
// impossible to confuse with a Saturday.
//
// The motif belongs to the PERSON, not to the viewer: I pick the stamp for my own
// time off and my teammates see it. That is why it travels on Assignee, resolved
// through resolveRowMotif.
//
// The art itself lives ONLY in src/app/index.css, keyed by [data-time-off-motif].
// Adding a motif therefore costs two edits — an entry here and a block there — in
// exchange for a single source of the SVG and markup that never carries a data URI.

export const TIME_OFF_MOTIF_PREFERENCE_KEY = 'time_off_motif';

export type TimeOffMotifId =
  | 'palm'
  | 'sun'
  | 'mountains'
  | 'waves'
  | 'umbrella'
  | 'tent'
  | 'beer'
  | 'star';

/** Everyone starts with palms; an unknown or missing value falls back here. */
export const DEFAULT_TIME_OFF_MOTIF_ID: TimeOffMotifId = 'palm';

// Order is the order of the picker. Every motif is line art that survives being
// stamped at 13-19px — anything with detail finer than the stroke turns to mush
// at the week-view size, which is what rules out the busier candidates.
export const TIME_OFF_MOTIF_IDS: readonly TimeOffMotifId[] = [
  'palm',
  'sun',
  'mountains',
  'waves',
  'umbrella',
  'tent',
  'beer',
  'star',
] as const;

const MOTIF_IDS = new Set<string>(TIME_OFF_MOTIF_IDS);

export const isValidTimeOffMotifId = (value: unknown): value is TimeOffMotifId =>
  typeof value === 'string' && MOTIF_IDS.has(value);

/** Narrow a raw value (a neighbour's stored preference) to a motif. */
export const resolveTimeOffMotifId = (value: unknown): TimeOffMotifId => (
  isValidTimeOffMotifId(value) ? value : DEFAULT_TIME_OFF_MOTIF_ID
);

/** Read my own motif out of the profile preferences blob. */
export const getTimeOffMotifId = (
  preferences: Record<string, unknown> | null | undefined,
): TimeOffMotifId => resolveTimeOffMotifId(preferences?.[TIME_OFF_MOTIF_PREFERENCE_KEY]);

// Resolved at call time so the label follows the active locale, exactly like
// getAccentLabel in shared/lib/accentColor.ts.
export const getTimeOffMotifLabel = (id: TimeOffMotifId): string => {
  switch (id) {
    case 'sun':
      return t`Sun`;
    case 'mountains':
      return t`Mountains`;
    case 'waves':
      return t`Waves`;
    case 'umbrella':
      return t`Umbrella`;
    case 'tent':
      return t`Tent`;
    case 'beer':
      return t`Beer`;
    case 'star':
      return t`Star`;
    case 'palm':
    default:
      return t`Palm`;
  }
};

/**
 * The motif to stamp on one timeline row.
 *
 * My own row reads the live preference so the picker repaints it immediately;
 * a teammate's row reads the value that came with their profile. This is also
 * the seam to change if the motif ever becomes a property of a single time-off
 * record rather than of the person.
 */
export const resolveRowMotif = ({
  isMe,
  myPreferences,
  assigneeMotif,
}: {
  isMe: boolean;
  myPreferences?: Record<string, unknown> | null;
  assigneeMotif?: unknown;
}): TimeOffMotifId => (
  isMe ? getTimeOffMotifId(myPreferences) : resolveTimeOffMotifId(assigneeMotif)
);
