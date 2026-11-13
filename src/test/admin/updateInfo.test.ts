import { describe, expect, it } from 'vitest';
import { summarizeUpdate, type UpdateInfo } from '@/features/admin/lib/updateInfo';

const release = (tag: string, changes: string[]) => ({
  tag,
  url: `https://github.com/eleron96/motio/releases/tag/${tag}`,
  publishedAt: null,
  changes,
});

const info = (overrides: Partial<UpdateInfo> = {}): UpdateInfo => ({
  updateCheck: 'ok',
  selfHosted: true,
  releases: [
    release('v0.11.0', ['For your own servers: set NEW_KEY before updating.', 'A new board.']),
    release('v0.10.30', ['A fix.', 'for your own servers:   the installer waits for the database.']),
    release('v0.10.27', ['Already installed.']),
    release('v0.10.20', ['Old news.']),
  ],
  ...overrides,
});

describe('summarizeUpdate', () => {
  it('collects the notes of every release newer than the running one', () => {
    expect(summarizeUpdate('0.10.27', info())).toEqual({
      latest: info().releases[0],
      releasesBehind: 2,
      attention: ['set NEW_KEY before updating.', 'the installer waits for the database.'],
      changes: ['A new board.', 'A fix.'],
    });
  });

  it('says nothing when the running version is the newest, or ahead of the releases', () => {
    expect(summarizeUpdate('0.11.0', info())).toBeNull();
    expect(summarizeUpdate('0.12.3', info())).toBeNull();
  });

  it('says nothing without an answer from the check', () => {
    expect(summarizeUpdate('0.10.27', null)).toBeNull();
    expect(summarizeUpdate('0.10.27', info({ updateCheck: 'disabled', releases: [] }))).toBeNull();
    expect(summarizeUpdate('0.10.27', info({ updateCheck: 'unavailable', releases: [] }))).toBeNull();
  });

  it('does not repeat a note that two releases share', () => {
    const summary = summarizeUpdate('0.10.27', info({
      releases: [release('v0.11.0', ['Same line.']), release('v0.10.30', ['Same line.'])],
    }));
    expect(summary?.changes).toEqual(['Same line.']);
  });
});
