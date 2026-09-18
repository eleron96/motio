import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { HeroClip } from '@/features/marketing/components/HeroClip';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

const originalMatchMedia = window.matchMedia;

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};

describe('HeroClip', () => {
  let observed: IntersectionObserverCallback | null;

  beforeEach(() => {
    observed = null;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { observed = callback; }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const video = () => document.querySelector('video') as HTMLVideoElement;

  it('links to the live demo with a hard navigation and paints the poster first', () => {
    setReducedMotion(false);
    render(<HeroClip />);

    expect(screen.getByRole('link', { name: 'Open the live demo' })).toHaveAttribute('href', '/demo');
    expect(video()).toHaveAttribute('poster');
    expect(video()).toHaveAttribute('width', '1280');
    expect(video()).toHaveAttribute('height', '880');
  });

  it('attaches the clip once the page has loaded and plays it only while on screen', () => {
    setReducedMotion(false);
    render(<HeroClip />);
    // jsdom reports the document as already loaded, so the clip is attached on mount.
    expect(video().getAttribute('src')).toBeTruthy();
    expect(video().muted).toBe(true);

    act(() => observed?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);

    act(() => observed?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
  });

  it('keeps only the still poster when the visitor asked for reduced motion', () => {
    setReducedMotion(true);
    render(<HeroClip />);

    expect(video().getAttribute('src')).toBeNull();
    expect(observed).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
