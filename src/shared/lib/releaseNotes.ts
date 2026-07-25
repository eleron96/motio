// Release notes are parsed from the CHANGELOG files at build time via `?raw`.
//
// That makes this module expensive (~210 KB of markdown for both locales, and it
// grows with every release), so it MUST stay off the critical path: import it
// dynamically, only where the user asked to see the notes. `APP_VERSION` lives in
// `@/shared/lib/appVersion` precisely so that displaying a version number does not
// pull the changelog along. See `src/test/shared/releaseNotesBoundary.test.ts`,
// which fails the build if a static import creeps back in.
import type { Locale } from '@/shared/lib/locale';
import changelogEnRaw from '../../../CHANGELOG.en.md?raw';
import changelogRuRaw from '../../../CHANGELOG.md?raw';

export type ReleaseNotesSection = {
  title: string;
  items: string[];
};

export type ReleaseNotesEntry = {
  /** Version as written in the changelog heading, or `Unreleased`. */
  version: string;
  /** Release date from the heading (`YYYY-MM-DD`), empty for `Unreleased`. */
  date: string;
  sections: ReleaseNotesSection[];
};

/**
 * How many releases the "latest changes" dialog offers to scroll through.
 * The whole changelog is in the chunk either way; this only bounds what we
 * hand to the UI so the dialog stays scannable.
 */
export const RECENT_RELEASES_LIMIT = 40;

const UNRELEASED_HEADER_PATTERN = /^##\s+\[Unreleased\]/i;
const VERSION_HEADER_PATTERN = /^##\s+\[[^\]]+\]/i;
const SECTION_HEADER_PATTERN = /^###\s+/;
const ITEM_PATTERN = /^\s*-\s+/;
const HEADING_META_PATTERN = /^##\s+\[([^\]]+)\]\s*(?:-\s*(\S+))?/i;
const IGNORED_SECTION_TITLES = new Set(['infrastructure', 'инфраструктура']);
const PLACEHOLDER_ITEMS = new Set(['no documented changes.', 'нет зафиксированных изменений.']);

const parseSectionBody = (lines: string[], locale: Locale): ReleaseNotesSection[] => {
  const sections: ReleaseNotesSection[] = [];
  let currentTitle = locale === 'ru' ? 'Изменения' : 'Changes';
  let currentItems: string[] = [];

  const flushSection = () => {
    if (!currentItems.length) return;
    if (IGNORED_SECTION_TITLES.has(currentTitle.trim().toLowerCase())) {
      currentItems = [];
      return;
    }
    sections.push({ title: currentTitle, items: currentItems });
    currentItems = [];
  };

  lines.forEach((line) => {
    if (SECTION_HEADER_PATTERN.test(line)) {
      flushSection();
      currentTitle = line.replace(SECTION_HEADER_PATTERN, '').trim();
      return;
    }

    if (ITEM_PATTERN.test(line)) {
      currentItems.push(line.replace(ITEM_PATTERN, '').trim());
    }
  });

  flushSection();
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !PLACEHOLDER_ITEMS.has(item.trim().toLowerCase())),
    }))
    .filter((section) => section.items.length > 0);
};

const parseSectionByStartIndex = (
  lines: string[],
  startIndex: number,
  locale: Locale,
): ReleaseNotesSection[] => {
  if (startIndex === -1) return [];

  const collected: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trimEnd();
    if (VERSION_HEADER_PATTERN.test(line.trim())) {
      break;
    }

    collected.push(line.trim());
  }

  return parseSectionBody(collected, locale);
};

const parseHeadingMeta = (line: string): { version: string; date: string } => {
  const match = HEADING_META_PATTERN.exec(line.trim());
  if (!match) return { version: '', date: '' };
  return { version: match[1].trim(), date: (match[2] ?? '').trim() };
};

/**
 * Most recent releases, newest first, skipping entries that carry nothing worth
 * showing (empty sections, placeholder-only bodies, infrastructure-only notes).
 * An `Unreleased` section is included when it has content — that is what a user
 * sees right after a deploy, before the section is rotated on the server.
 */
export const getRecentReleaseNotes = (
  locale: Locale,
  limit: number = RECENT_RELEASES_LIMIT,
): ReleaseNotesEntry[] => {
  if (limit <= 0) return [];

  const changelogRaw = locale === 'ru' ? changelogRuRaw : changelogEnRaw;
  const lines = changelogRaw.split('\n');
  const entries: ReleaseNotesEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!VERSION_HEADER_PATTERN.test(line)) continue;

    const sections = parseSectionByStartIndex(lines, index, locale);
    if (sections.length === 0) continue;

    const { version, date } = parseHeadingMeta(line);
    const isUnreleased = UNRELEASED_HEADER_PATTERN.test(line);
    entries.push({
      version: isUnreleased ? version || 'Unreleased' : version,
      date: isUnreleased ? '' : date,
      sections,
    });

    if (entries.length === limit) break;
  }

  return entries;
};

/** Sections of the newest entry that has content — `[]` when there is none. */
export const getLatestReleaseNotes = (locale: Locale): ReleaseNotesSection[] => (
  getRecentReleaseNotes(locale, 1)[0]?.sections ?? []
);
