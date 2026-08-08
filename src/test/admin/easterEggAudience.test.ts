import { describe, expect, it } from 'vitest';
import {
  audienceSummary,
  draftAudienceValue,
  easterEggStatus,
  emptyEasterEggDraft,
  isEasterEggDraftReady,
  type EasterEggTarget,
} from '@/features/admin/lib/easterEggAudience';

const labels = {
  everyone: 'Everyone',
  unknownWorkspace: 'Unknown workspace',
  unknownUser: 'Unknown user',
};

const target = (overrides: Partial<EasterEggTarget> = {}): EasterEggTarget => ({
  id: 'e1',
  eggKey: 'anniversary-blueprint',
  audienceKind: 'user',
  audienceValue: null,
  audienceLabel: null,
  userId: 'u1',
  userEmail: 'anna@example.com',
  userDisplayName: 'Anna',
  enabled: true,
  note: null,
  startsAt: null,
  endsAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

describe('easter egg audiences', () => {
  it('knows when a draft says who it is for', () => {
    const draft = emptyEasterEggDraft('anniversary-blueprint');

    // A personal assignment needs a person.
    expect(isEasterEggDraftReady(draft)).toBe(false);
    expect(isEasterEggDraftReady({ ...draft, userId: 'u1' })).toBe(true);

    // A domain needs a domain, a workspace needs a workspace...
    expect(isEasterEggDraftReady({ ...draft, audienceKind: 'domain' })).toBe(false);
    expect(isEasterEggDraftReady({ ...draft, audienceKind: 'domain', domain: ' speech.ru ' })).toBe(true);
    expect(isEasterEggDraftReady({ ...draft, audienceKind: 'workspace' })).toBe(false);
    expect(isEasterEggDraftReady({ ...draft, audienceKind: 'workspace', workspaceId: 'w1' })).toBe(true);

    // ...and "everyone" needs nothing at all.
    expect(isEasterEggDraftReady({ ...draft, audienceKind: 'all_active' })).toBe(true);
  });

  it('sends only the value the audience is addressed by', () => {
    const draft = emptyEasterEggDraft('shabbat');

    expect(draftAudienceValue({ ...draft, userId: 'u1' })).toBeNull();
    expect(draftAudienceValue({ ...draft, audienceKind: 'all_active' })).toBeNull();
    expect(draftAudienceValue({ ...draft, audienceKind: 'domain', domain: '  Speech.ru ' })).toBe('Speech.ru');
    expect(draftAudienceValue({ ...draft, audienceKind: 'workspace', workspaceId: 'w1' })).toBe('w1');
  });

  it('describes each audience in one line', () => {
    expect(audienceSummary(target(), labels)).toBe('Anna');
    expect(audienceSummary(target({ userDisplayName: null }), labels)).toBe('anna@example.com');
    expect(audienceSummary(
      target({ audienceKind: 'domain', audienceValue: 'speech.ru', userId: null }),
      labels,
    )).toBe('@speech.ru');
    expect(audienceSummary(
      target({ audienceKind: 'workspace', audienceValue: 'w1', audienceLabel: 'Studio', userId: null }),
      labels,
    )).toBe('Studio');
    expect(audienceSummary(target({ audienceKind: 'all_active', userId: null }), labels)).toBe('Everyone');
  });

  it('falls back to a plain label when a workspace has gone', () => {
    expect(audienceSummary(
      target({ audienceKind: 'workspace', audienceValue: 'w1', audienceLabel: null, userId: null }),
      labels,
    )).toBe('Unknown workspace');
  });

  it('tells apart off, scheduled, live and finished', () => {
    const now = Date.parse('2026-08-08T12:00:00.000Z');

    expect(easterEggStatus(target(), now)).toBe('live');
    expect(easterEggStatus(target({ enabled: false }), now)).toBe('off');
    expect(easterEggStatus(target({ startsAt: '2026-09-01T00:00:00.000Z' }), now)).toBe('scheduled');
    expect(easterEggStatus(target({ endsAt: '2026-07-01T00:00:00.000Z' }), now)).toBe('finished');
    // Inside its window is live, either bound open or not.
    expect(easterEggStatus(
      target({ startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-31T00:00:00.000Z' }),
      now,
    )).toBe('live');
  });

  it('treats a switched-off row as off even after its window passed', () => {
    const now = Date.parse('2026-08-08T12:00:00.000Z');

    // Off is a decision; finished is just the calendar.
    expect(easterEggStatus(
      target({ enabled: false, endsAt: '2026-07-01T00:00:00.000Z' }),
      now,
    )).toBe('off');
  });
});
