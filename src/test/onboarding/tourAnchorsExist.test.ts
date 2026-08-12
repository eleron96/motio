import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tour points at elements by `data-tour` attributes. When a redesign drops
 * one, driver.js does NOT fail and does NOT skip the step — it parks the
 * popover in the middle of a dimmed empty screen, so the breakage reaches users
 * silently. Three steps had rotted away exactly like that before this test
 * existed. It compares the selectors the tour asks for against the attributes
 * the app actually renders.
 */

const SRC_ROOT = join(process.cwd(), 'src');
const TOUR_FILE = join(SRC_ROOT, 'features/onboarding/lib/onboardingTour.ts');

const collectFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    // Файлы-дубликаты вида "Component 2.tsx" — мусор синхронизации, в сборку
    // не попадают и якорями считаться не должны.
    if (/ \d+\.[jt]sx?$/.test(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
};

/**
 * Anchors reach the DOM two ways: written inline (`data-tour="timeline-grid"`)
 * or returned from a helper as a bare string (WorkspaceNav maps a route to
 * 'nav-dashboard'). So the check is "does this anchor name still appear as a
 * string literal anywhere in the app" — that dies together with the element it
 * belongs to, which is exactly what we want to catch.
 */
const appSources = (): string => {
  const chunks: string[] = [];
  for (const file of collectFiles(SRC_ROOT)) {
    if (file === TOUR_FILE || file.includes(join('src', 'test'))) continue;
    chunks.push(readFileSync(file, 'utf8'));
  }
  return chunks.join('\n');
};

const requestedAnchors = (): string[] => {
  const source = readFileSync(TOUR_FILE, 'utf8');
  return [...source.matchAll(/\[data-tour="([\w-]+)"\]/g)].map((match) => match[1]);
};

describe('onboarding tour anchors', () => {
  it('every step points at an anchor the app still defines', () => {
    const sources = appSources();
    const missing = requestedAnchors().filter((anchor) => (
      !sources.includes(`"${anchor}"`) && !sources.includes(`'${anchor}'`)
    ));

    expect(missing, `Шаги тура ссылаются на несуществующие якоря: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('guards itself: both sides of the comparison are non-empty', () => {
    expect(requestedAnchors().length).toBeGreaterThan(0);
    expect(appSources().length).toBeGreaterThan(1000);
  });

  it('does not aim at the assignee filter — the project card hides it on production', () => {
    // Разметка ещё существует в старой панели (её показывает выключенный флаг
    // VITE_FEATURE_PROJECT_CARD), поэтому проверка наличия якоря этот шаг не
    // ловила: он был мёртв ровно в том состоянии, ради которого писался.
    expect(requestedAnchors()).not.toContain('projects-assignee-filter');
  });
});
