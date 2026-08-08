export type AnnouncementLevel = 'info' | 'critical';
export type AnnouncementAudienceKind = 'all_active' | 'domain' | 'workspace';

/** One row of the announcement history, as the admin function returns it. */
export interface AnnouncementRow {
  id: string;
  title: string;
  titleEn: string | null;
  bodyRu: string | null;
  bodyEn: string | null;
  level: AnnouncementLevel;
  audienceKind: AnnouncementAudienceKind;
  audienceValue: string | null;
  published: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  dismissedCount: number;
}

/** What the form edits, before it becomes a request. */
export interface AnnouncementDraft {
  level: AnnouncementLevel;
  audienceKind: AnnouncementAudienceKind;
  domain: string;
  workspaceId: string;
  titleRu: string;
  titleEn: string;
  bodyRu: string;
  bodyEn: string;
  endsAt: string;
}

export const emptyAnnouncementDraft = (): AnnouncementDraft => ({
  level: 'info',
  audienceKind: 'all_active',
  domain: '',
  workspaceId: '',
  titleRu: '',
  titleEn: '',
  bodyRu: '',
  bodyEn: '',
  endsAt: '',
});

/** A `date` input speaks days; the window itself is stored to the second. */
export const toDateInput = (value: string | null): string => (value ? value.slice(0, 10) : '');
export const startOfDay = (day: string): string => new Date(`${day}T00:00:00`).toISOString();
export const endOfDay = (day: string): string => new Date(`${day}T23:59:59`).toISOString();

export const todayInput = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export const draftFromRow = (row: AnnouncementRow): AnnouncementDraft => ({
  level: row.level,
  audienceKind: row.audienceKind,
  domain: row.audienceKind === 'domain' ? row.audienceValue ?? '' : '',
  workspaceId: row.audienceKind === 'workspace' ? row.audienceValue ?? '' : '',
  titleRu: row.title,
  titleEn: row.titleEn ?? '',
  bodyRu: row.bodyRu ?? '',
  bodyEn: row.bodyEn ?? '',
  endsAt: toDateInput(row.endsAt),
});

export const draftAudienceValue = (draft: AnnouncementDraft): string | null => {
  if (draft.audienceKind === 'domain') return draft.domain.trim();
  if (draft.audienceKind === 'workspace') return draft.workspaceId;
  return null;
};

/** A draft is ready once it says something and knows who it is for. */
export const isAnnouncementDraftReady = (draft: AnnouncementDraft): boolean => {
  if (!draft.titleRu.trim()) return false;
  if (draft.audienceKind === 'domain') return draft.domain.trim().length > 0;
  if (draft.audienceKind === 'workspace') return draft.workspaceId.length > 0;
  return true;
};

export type AnnouncementStatus = 'draft' | 'scheduled' | 'live' | 'expired';

/**
 * Where an announcement stands right now. Unpublished outranks the window: a
 * draft with an old end date is still a draft, not something that finished.
 */
export const announcementStatus = (row: AnnouncementRow, now: number = Date.now()): AnnouncementStatus => {
  if (!row.published) return 'draft';
  if (new Date(row.startsAt).getTime() > now) return 'scheduled';
  if (row.endsAt && new Date(row.endsAt).getTime() < now) return 'expired';
  return 'live';
};

export interface AnnouncementSummary {
  live: AnnouncementRow[];
  scheduled: number;
  drafts: number;
  finished: number;
  /** How many dismissals the currently live announcements have collected. */
  liveDismissed: number;
}

export const summarizeAnnouncements = (
  rows: AnnouncementRow[],
  now: number = Date.now(),
): AnnouncementSummary => {
  const summary: AnnouncementSummary = { live: [], scheduled: 0, drafts: 0, finished: 0, liveDismissed: 0 };
  for (const row of rows) {
    const status = announcementStatus(row, now);
    if (status === 'live') {
      summary.live.push(row);
      summary.liveDismissed += row.dismissedCount;
    } else if (status === 'scheduled') summary.scheduled += 1;
    else if (status === 'draft') summary.drafts += 1;
    else summary.finished += 1;
  }
  return summary;
};
