import { describe, expect, it } from 'vitest';
import { announcementText } from '@/features/announcements/lib/announcementText';
import type { AnnouncementRow } from '@/infrastructure/announcements/announcementsRepository';

const row: AnnouncementRow = {
  id: 'a1',
  title_ru: 'Привет',
  title_en: 'Hello',
  title_de: 'Hallo',
  body_ru: 'Текст',
  body_en: 'Body',
  body_de: 'Text',
  level: 'info',
};

describe('announcementText', () => {
  it('picks the reader language', () => {
    expect(announcementText(row, 'ru')).toEqual({ title: 'Привет', body: 'Текст' });
    expect(announcementText(row, 'en')).toEqual({ title: 'Hello', body: 'Body' });
    expect(announcementText(row, 'de')).toEqual({ title: 'Hallo', body: 'Text' });
  });

  it('shows German readers the English pair without a German title', () => {
    expect(announcementText({ ...row, title_de: null, body_de: 'Text' }, 'de')).toEqual({ title: 'Hello', body: 'Body' });
    const { title_de: _title, body_de: _body, ...oldServerRow } = row;
    expect(announcementText(oldServerRow, 'de')).toEqual({ title: 'Hello', body: 'Body' });
  });

  it('treats an empty body as none', () => {
    expect(announcementText({ ...row, body_de: '' }, 'de')).toEqual({ title: 'Hallo', body: null });
  });
});
