// The "update available" mark of the admin console: which published releases
// are newer than the running one and what their notes say. Pure — the list
// itself comes from the admin Edge Function (action system.version).
import { isNewerVersion } from '@/shared/domain/versionCompare';

export interface ReleaseInfo {
  tag: string;
  url: string;
  publishedAt: string | null;
  /** Bullet lines of the release notes, plain text (English, as published). */
  changes: string[];
}

export interface UpdateInfo {
  updateCheck: 'disabled' | 'ok' | 'unavailable';
  selfHosted: boolean;
  /** Published releases, newest first. */
  releases: ReleaseInfo[];
}

export interface UpdateSummary {
  latest: ReleaseInfo;
  /** How many published releases the running version is behind. */
  releasesBehind: number;
  /** Notes written for people who run their own server, without the prefix. */
  attention: string[];
  /** Every other change since the running version, newest release first. */
  changes: string[];
}

// The changelog marks what needs a self-hosted admin's attention with this
// prefix (AGENTS.md §5.6): those lines go first, the rest below.
const SELF_HOST_PREFIX = /^for your own servers:\s*/i;

/** What a newer release brings, or null when the running version is the newest known. */
export const summarizeUpdate = (current: string, info: UpdateInfo | null): UpdateSummary | null => {
  if (!info || info.updateCheck !== 'ok') return null;
  const newer = info.releases.filter((release) => isNewerVersion(current, release.tag));
  const latest = newer[0];
  if (!latest) return null;

  const attention: string[] = [];
  const changes: string[] = [];
  const seen = new Set<string>();
  for (const release of newer) {
    for (const change of release.changes) {
      if (seen.has(change)) continue;
      seen.add(change);
      if (SELF_HOST_PREFIX.test(change)) attention.push(change.replace(SELF_HOST_PREFIX, ''));
      else changes.push(change);
    }
  }
  return { latest, releasesBehind: newer.length, attention, changes };
};
