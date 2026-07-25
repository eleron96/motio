import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `@/shared/lib/releaseNotes` inlines CHANGELOG.md + CHANGELOG.en.md via `?raw`
 * — around 210 KB of markdown that grows with every release. It used to be
 * reachable statically from `AccountSettingsDialog` (via `APP_VERSION`), which
 * put the whole changelog into the shell chunk of every authenticated page for
 * the sake of a version string.
 *
 * The fix is a convention rather than a mechanism, so it needs a guard: the
 * module may only be imported dynamically (`import(...)`) or type-only. Version
 * numbers come from `@/shared/lib/appVersion` instead.
 */
const SRC_ROOT = join(process.cwd(), 'src');
const MODULE_SPECIFIER = '@/shared/lib/releaseNotes';
const RELEASE_NOTES_MODULE = join(SRC_ROOT, 'shared', 'lib', 'releaseNotes.ts');
const CHANGELOG_RAW_PATTERN = /CHANGELOG(?:\.en)?\.md\?raw/;
// Tests are free to import it directly — they never reach the production graph.
const TEST_ROOT = join(SRC_ROOT, 'test');

const collectSourceFiles = (dir: string): string[] => (
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return /\.tsx?$/.test(entry) ? [fullPath] : [];
  })
);

/** Static value import of the module: `import { x } from '...'` / `import '...'`. */
const hasStaticValueImport = (source: string) => {
  const importPattern = new RegExp(
    String.raw`^\s*import\s+(?!type\s)(?:[^;'"]*?\sfrom\s+)?['"]${MODULE_SPECIFIER}['"]`,
    'm',
  );
  if (!importPattern.test(source)) return false;

  // `import { type A, type B } from '...'` is erased too — only flag it when at
  // least one imported binding is a value.
  const clausePattern = new RegExp(
    String.raw`import\s+\{([^}]*)\}\s+from\s+['"]${MODULE_SPECIFIER}['"]`,
    'm',
  );
  const clause = clausePattern.exec(source);
  if (!clause) return true;

  return clause[1]
    .split(',')
    .map((binding) => binding.trim())
    .filter(Boolean)
    .some((binding) => !binding.startsWith('type '));
};

describe('releaseNotes import boundary', () => {
  const sourceFiles = collectSourceFiles(SRC_ROOT)
    .filter((file) => file !== RELEASE_NOTES_MODULE)
    .filter((file) => !file.startsWith(`${TEST_ROOT}/`));

  it('scans a plausible number of source files', () => {
    expect(sourceFiles.length).toBeGreaterThan(100);
  });

  it('is never imported statically for its values', () => {
    const offenders = sourceFiles
      .filter((file) => hasStaticValueImport(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file));

    expect(
      offenders,
      `Import '${MODULE_SPECIFIER}' dynamically (await import(...)) or type-only — a static `
      + 'import pulls both CHANGELOG files into the importer\'s chunk. '
      + `Version numbers live in '@/shared/lib/appVersion'.`,
    ).toEqual([]);
  });

  it('keeps the raw changelog imports confined to that one module', () => {
    const offenders = sourceFiles
      .filter((file) => CHANGELOG_RAW_PATTERN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });

  it('keeps appVersion free of changelog imports', () => {
    const appVersionSource = readFileSync(join(SRC_ROOT, 'shared', 'lib', 'appVersion.ts'), 'utf8');

    expect(CHANGELOG_RAW_PATTERN.test(appVersionSource)).toBe(false);
    expect(appVersionSource).not.toContain(MODULE_SPECIFIER);
  });
});
