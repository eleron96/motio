import { describe, expect, it } from 'vitest';

import { resolveAnnouncementTexts } from '../../../infra/supabase/functions/_shared/announcementTexts';

describe('resolveAnnouncementTexts', () => {
  it('keeps the old result when the Russian title is filled', () => {
    expect(resolveAnnouncementTexts({ titleRu: 'Привет', bodyRu: 'Текст' })).toEqual({
      title_ru: 'Привет',
      title_en: 'Привет',
      title_de: null,
      body_ru: 'Текст',
      body_en: 'Текст',
      body_de: null,
    });

    expect(resolveAnnouncementTexts({ titleRu: 'Привет', titleEn: 'Hello', bodyEn: 'Body' })).toEqual({
      title_ru: 'Привет',
      title_en: 'Hello',
      title_de: null,
      body_ru: null,
      body_en: 'Body',
      body_de: null,
    });
  });

  it('stores German beside the other languages', () => {
    expect(resolveAnnouncementTexts({
      titleRu: 'Привет', titleEn: 'Hello', titleDe: 'Hallo', bodyDe: 'Text auf Deutsch',
    })).toMatchObject({ title_de: 'Hallo', body_de: 'Text auf Deutsch' });
  });

  it('needs no Russian: an English announcement fills the Russian columns', () => {
    expect(resolveAnnouncementTexts({ titleEn: 'Maintenance', bodyEn: 'Tonight', titleDe: 'Wartung' })).toEqual({
      title_ru: 'Maintenance',
      title_en: 'Maintenance',
      title_de: 'Wartung',
      body_ru: 'Tonight',
      body_en: 'Tonight',
      body_de: null,
    });
  });

  it('accepts German alone', () => {
    expect(resolveAnnouncementTexts({ titleDe: 'Wartung', bodyDe: 'Heute Abend' })).toEqual({
      title_ru: 'Wartung',
      title_en: 'Wartung',
      title_de: 'Wartung',
      body_ru: 'Heute Abend',
      body_en: 'Heute Abend',
      body_de: 'Heute Abend',
    });
  });

  it('refuses an announcement without any title', () => {
    expect(resolveAnnouncementTexts({ titleRu: '  ', bodyEn: 'Body' })).toEqual({ error: 'A title is required.' });
  });
});
