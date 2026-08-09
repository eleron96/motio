export type EasterEggAudienceKind = 'user' | 'domain' | 'workspace' | 'all_active';

/** One assignment row, as the admin function returns it. */
export interface EasterEggTarget {
  id: string;
  eggKey: string;
  audienceKind: EasterEggAudienceKind;
  audienceValue: string | null;
  /** Workspace name where the value is an id; the raw value otherwise. */
  audienceLabel: string | null;
  userId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  enabled: boolean;
  note: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface EasterEggDraft {
  eggKey: string;
  audienceKind: EasterEggAudienceKind;
  userId: string;
  domain: string;
  workspaceId: string;
  note: string;
  startsAt: string;
  endsAt: string;
}

export const emptyEasterEggDraft = (eggKey: string): EasterEggDraft => ({
  eggKey,
  audienceKind: 'user',
  userId: '',
  domain: '',
  workspaceId: '',
  note: '',
  startsAt: '',
  endsAt: '',
});

/** The value the audience is addressed by, or null when it needs none. */
export const draftAudienceValue = (draft: EasterEggDraft): string | null => {
  if (draft.audienceKind === 'domain') return draft.domain.trim();
  if (draft.audienceKind === 'workspace') return draft.workspaceId;
  return null;
};

/** An assignment is ready once it says who it is for. */
export const isEasterEggDraftReady = (draft: EasterEggDraft): boolean => {
  if (!draft.eggKey) return false;
  if (draft.audienceKind === 'user') return draft.userId.length > 0;
  if (draft.audienceKind === 'domain') return draft.domain.trim().length > 0;
  if (draft.audienceKind === 'workspace') return draft.workspaceId.length > 0;
  return true;
};

export type EasterEggStatus = 'off' | 'scheduled' | 'live' | 'finished';

/**
 * Where an assignment stands right now. Switched off outranks the window: a
 * disabled row with an old end date is off, not finished.
 */
export const easterEggStatus = (
  target: Pick<EasterEggTarget, 'enabled' | 'startsAt' | 'endsAt'>,
  now: number = Date.now(),
): EasterEggStatus => {
  if (!target.enabled) return 'off';
  if (target.startsAt && new Date(target.startsAt).getTime() > now) return 'scheduled';
  if (target.endsAt && new Date(target.endsAt).getTime() < now) return 'finished';
  return 'live';
};

/**
 * Who a row addresses, in one line. Personal rows read as the person; the rest
 * carry their audience's own label.
 */
export const audienceSummary = (
  target: Pick<EasterEggTarget,
    'audienceKind' | 'audienceLabel' | 'audienceValue' | 'userDisplayName' | 'userEmail' | 'userId'>,
  labels: { everyone: string; unknownWorkspace: string; unknownUser: string },
): string => {
  switch (target.audienceKind) {
    case 'user':
      return target.userDisplayName
        ?? target.userEmail
        ?? (target.userId ? labels.unknownUser : labels.unknownUser);
    case 'domain':
      return `@${target.audienceValue ?? ''}`;
    case 'workspace':
      return target.audienceLabel ?? labels.unknownWorkspace;
    default:
      return labels.everyone;
  }
};

/** A date input speaks days; the window is stored to the second. */
export const toDateInput = (value: string | null): string => (value ? value.slice(0, 10) : '');
export const startOfDay = (day: string): string => new Date(`${day}T00:00:00`).toISOString();
export const endOfDay = (day: string): string => new Date(`${day}T23:59:59`).toISOString();
