import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TIME_OFF_MOTIF_IDS } from '@/features/planner/lib/timeOffMotifs';

// The motif art lives in CSS, so neither typecheck nor jsdom can see it. These
// are the invariants whose breakage is silent — the pattern simply stops being
// drawn, or is drawn as a solid grey rectangle over the row.
const css = readFileSync(resolve(process.cwd(), 'src/app/index.css'), 'utf8');

const motifUris = css.match(/url\("data:image\/svg\+xml,[^"]*"\)/g) ?? [];

describe('time-off motif assets', () => {
  // Three per motif: the scattered day tile, the single-stamp week tile, and a
  // glyph for the settings swatch (the tile is unreadable at 16px).
  it('ships a day tile, a week tile and a glyph for every registered motif', () => {
    for (const id of TIME_OFF_MOTIF_IDS) {
      expect(css).toContain(`[data-time-off-motif='${id}']`);
    }
    expect(motifUris.length).toBe(TIME_OFF_MOTIF_IDS.length * 3);
    for (const variable of ['--time-off-motif:', '--time-off-motif-week:', '--time-off-glyph:']) {
      expect((css.match(new RegExp(variable, 'g')) ?? []).length).toBe(TIME_OFF_MOTIF_IDS.length);
    }
  });

  // Each cell paints its own mask, so a tile that does not divide the day width
  // restarts mid-stamp and leaves clipped stumps along every day boundary.
  it('sizes the tile to divide both day widths exactly', () => {
    const dayTile = Number(/\n\s+mask-size: (\d+)px \1px;/.exec(
      css.slice(css.indexOf('[data-time-off-motif] .time-off-band::after')),
    )?.[1]);
    const weekTile = Number(/mask-size: (\d+)px \1px;/.exec(
      css.slice(css.indexOf("[data-timeline-view='week'] .time-off-band::after")),
    )?.[1]);

    expect(120 % dayTile).toBe(0);
    expect(48 % weekTile).toBe(0);
  });

  it('keeps every data URI free of a raw "#"', () => {
    // An unescaped '#' terminates the URI and the mask silently resolves to
    // nothing — which, with a background-color set, paints a solid block.
    for (const uri of motifUris) {
      expect(uri).not.toContain('#');
    }
  });

  it('pairs every mask declaration with its -webkit- prefix', () => {
    // iOS Safari still needs the prefixed properties; the app is installed as a
    // PWA on iPhone, so an unprefixed-only rule drops the motif there.
    const maskImage = (css.match(/(?<!-webkit-)\bmask-image:/g) ?? []).length;
    const webkitMaskImage = (css.match(/-webkit-mask-image:/g) ?? []).length;
    expect(webkitMaskImage).toBe(maskImage);
  });

  it('lets clicks through the motif layer', () => {
    // Without this the row loses double-click "create task", the context menu
    // and the bar's resize handles.
    const rule = css.slice(css.indexOf('[data-time-off-motif] .time-off-band::after'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('pointer-events: none');
  });
});
