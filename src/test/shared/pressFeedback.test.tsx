import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/shared/ui/button';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';

const repoRoot = process.cwd();
const css = readFileSync(resolve(repoRoot, 'src/app/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tailwindConfig = readFileSync(resolve(repoRoot, 'tailwind.config.ts'), 'utf8');

/**
 * Every block `selector` appears in, with the chain of at-rules around it —
 * enough to tell a rule inside a media query from one at the top level.
 */
const blocksOf = (selector: string) => {
  const found: { preludes: string[]; body: string }[] = [];
  const stack: string[] = [];
  let prelude = '';
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (char === '{') {
      stack.push(prelude.trim());
      prelude = '';
      if (stack[stack.length - 1].split(',').map((part) => part.trim()).includes(selector)) {
        const end = css.indexOf('}', i);
        found.push({ preludes: stack.slice(0, -1), body: css.slice(i + 1, end) });
      }
    } else if (char === '}') {
      stack.pop();
      prelude = '';
    } else if (char === ';') {
      prelude = '';
    } else {
      prelude += char;
    }
  }
  return found;
};

const TOUCH_ONLY = /\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/;

describe('press feedback', () => {
  it('only ever dips a control on a touch screen, never under a mouse', () => {
    const pressed = blocksOf('.press:active');
    expect(pressed.length).toBeGreaterThan(0);
    for (const block of pressed) {
      expect(block.preludes.some((prelude) => TOUCH_ONLY.test(prelude))).toBe(true);
    }
    expect(pressed.some((block) => /scale:\s*var\(--press-scale\)/.test(block.body))).toBe(true);
  });

  it('keeps still for people who asked the system for less motion', () => {
    const still = blocksOf('.press:active').filter((block) => (
      block.preludes.some((prelude) => /prefers-reduced-motion:\s*reduce/.test(prelude))
    ));
    expect(still).toHaveLength(1);
    expect(still[0].body).toMatch(/scale:\s*none/);
  });

  it('stops hover colours from sticking after a tap', () => {
    expect(tailwindConfig).toMatch(/hoverOnlyWhenSupported:\s*true/);
  });

  it('is on every button and every segment', () => {
    render(
      <>
        <Button>Save</Button>
        <SegmentedControl>
          <SegmentedControlItem active>Day</SegmentedControlItem>
        </SegmentedControl>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('press');
    expect(screen.getByRole('button', { name: 'Day' })).toHaveClass('press');
  });
});
