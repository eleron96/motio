import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  resolveLocaleFromLanguages,
} from '@/shared/lib/locale';

/**
 * The browser's language list is the only signal we have before a user ever
 * says anything, so it decides the first screen, the Keycloak login page
 * (through ui_locales) and the welcome email.
 */

describe('resolveLocaleFromLanguages', () => {
  it('maps every Russian region variant to ru', () => {
    expect(resolveLocaleFromLanguages(['ru'])).toBe('ru');
    expect(resolveLocaleFromLanguages(['ru-RU'])).toBe('ru');
    expect(resolveLocaleFromLanguages(['ru-BY'])).toBe('ru');
    expect(resolveLocaleFromLanguages(['RU-ru'])).toBe('ru');
    expect(resolveLocaleFromLanguages(['ru_RU'])).toBe('ru');
  });

  it('maps English variants to en', () => {
    expect(resolveLocaleFromLanguages(['en-GB'])).toBe('en');
    expect(resolveLocaleFromLanguages(['en-US'])).toBe('en');
  });

  it('honours the order of preference — the first language we know wins', () => {
    expect(resolveLocaleFromLanguages(['ru-RU', 'en-US'])).toBe('ru');
    expect(resolveLocaleFromLanguages(['en-US', 'ru-RU'])).toBe('en');
  });

  it('skips languages we do not speak and takes the next known one', () => {
    expect(resolveLocaleFromLanguages(['de-DE', 'fr', 'ru-RU'])).toBe('ru');
  });

  it('falls back to English for an unknown, empty or malformed list', () => {
    expect(resolveLocaleFromLanguages(['de-DE', 'zh-CN'])).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleFromLanguages([])).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleFromLanguages(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleFromLanguages(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleFromLanguages([' ', ''])).toBe(DEFAULT_LOCALE);
  });

  it('ignores non-string entries instead of throwing', () => {
    expect(resolveLocaleFromLanguages([null as unknown as string, 'ru'])).toBe('ru');
  });
});
