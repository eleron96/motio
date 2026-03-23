import type { Locale } from '@/shared/lib/locale';
import changelogEnRaw from '../../../CHANGELOG.en.md?raw';
import changelogRuRaw from '../../../CHANGELOG.md?raw';
import versionRaw from '../../../VERSION?raw';

export type ReleaseNotesSection = {
  title: string;
  items: string[];
};

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const UNRELEASED_HEADER_PATTERN = /^##\s+\[Unreleased\]/i;
const VERSION_HEADER_PATTERN = /^##\s+\[[^\]]+\]/i;
const RELEASE_HEADER_PATTERN = /^##\s+\[(?!Unreleased\])[^\]]+\]/i;
const SECTION_HEADER_PATTERN = /^###\s+/;
const ITEM_PATTERN = /^\s*-\s+/;
const IGNORED_SECTION_TITLES = new Set(['infrastructure', 'инфраструктура']);
const PLACEHOLDER_ITEMS = new Set(['no documented changes.', 'нет зафиксированных изменений.']);

const normalizeVersion = (raw: string) => {
  const normalized = raw.trim();
  if (!normalized) return '0.0.0';
  if (!VERSION_PATTERN.test(normalized)) return '0.0.0';
  return normalized;
};

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

const parseSectionByHeader = (
  raw: string,
  sectionHeaderPattern: RegExp,
  locale: Locale,
): ReleaseNotesSection[] => {
  const lines = raw.split('\n');
  const startIndex = lines.findIndex((rawLine) => sectionHeaderPattern.test(rawLine.trim()));
  return parseSectionByStartIndex(lines, startIndex, locale);
};

export const APP_VERSION = normalizeVersion(versionRaw);

export const getLatestReleaseNotes = (locale: Locale): ReleaseNotesSection[] => {
  const changelogRaw = locale === 'ru' ? changelogRuRaw : changelogEnRaw;
  const unreleased = parseSectionByHeader(changelogRaw, UNRELEASED_HEADER_PATTERN, locale);
  if (unreleased.length > 0) return unreleased;

  const lines = changelogRaw.split('\n');
  const releaseStartIndexes = lines.flatMap((line, index) => (
    RELEASE_HEADER_PATTERN.test(line.trim()) ? [index] : []
  ));

  for (const startIndex of releaseStartIndexes) {
    const sections = parseSectionByStartIndex(lines, startIndex, locale);
    if (sections.length > 0) {
      return sections;
    }
  }

  return [];
};
