import { afterEach, describe, expect, it } from 'vitest';
import { preloadLandingHero } from '@/features/marketing/lib/preloadLandingHero';

const heroPreloads = () =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')]
    .filter((link) => link.href.includes('motio-clip-poster'));

describe('preloadLandingHero', () => {
  afterEach(() => {
    heroPreloads().forEach((link) => link.remove());
  });

  it('starts fetching the hero poster early on the landing page', () => {
    preloadLandingHero('/');

    const [link] = heroPreloads();
    expect(link).toBeDefined();
    expect(link.getAttribute('fetchpriority')).toBe('high');
  });

  it.each(['/app', '/demo', '/privacy', '/app/dashboard'])('leaves %s alone', (pathname) => {
    preloadLandingHero(pathname);

    expect(heroPreloads()).toHaveLength(0);
  });
});
