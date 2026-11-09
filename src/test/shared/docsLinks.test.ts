import { describe, expect, it } from 'vitest';
import { docsHomeUrl, selfHostingGuideUrl, userGuideUrl } from '@/shared/lib/docsLinks';

// The docs site has English and Russian; every other interface language reads English.
describe('documentation links', () => {
  it('open the Russian site for the Russian interface', () => {
    expect(docsHomeUrl('ru')).toBe('https://eleron96.github.io/motio/ru/');
    expect(userGuideUrl('ru')).toBe('https://eleron96.github.io/motio/ru/guide/');
    expect(selfHostingGuideUrl('ru')).toBe('https://eleron96.github.io/motio/ru/self-hosting/');
  });

  it('open the English site for English and German', () => {
    for (const locale of ['en', 'de'] as const) {
      expect(docsHomeUrl(locale)).toBe('https://eleron96.github.io/motio/');
      expect(userGuideUrl(locale)).toBe('https://eleron96.github.io/motio/guide/');
      expect(selfHostingGuideUrl(locale)).toBe('https://eleron96.github.io/motio/self-hosting/');
    }
  });
});
