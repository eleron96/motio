import { describe, expect, it } from 'vitest';

import {
  formatPushDate,
  renderNotificationPush,
} from '../../../infra/supabase/functions/_shared/pushPayload';

const link = { taskId: 'task-1', workspaceId: 'ws-1' };

const reminder = (locale: 'ru' | 'en' | 'de', reminderDaysBefore: number | null, taskStartDate: string | null) => (
  renderNotificationPush(
    locale,
    {
      type: 'task_reminder',
      actorName: null,
      taskTitle: 'Site visit',
      commentPreview: null,
      taskStartDate,
      reminderDaysBefore,
    },
    link,
    'https://motio.example',
  )
);

describe('task reminder push', () => {
  it('says "today" for a reminder on the start day', () => {
    expect(reminder('en', 0, '2026-11-25')).toMatchObject({ title: 'Task reminder', body: 'Today: Site visit' });
    expect(reminder('ru', 0, '2026-11-25')).toMatchObject({ title: 'Напоминание о задаче', body: 'Сегодня: Site visit' });
    expect(reminder('de', 0, '2026-11-25')).toMatchObject({ title: 'Erinnerung an eine Aufgabe', body: 'Heute: Site visit' });
  });

  it('says "tomorrow" for a reminder one day before', () => {
    expect(reminder('en', 1, '2026-11-25').body).toBe('Tomorrow: Site visit');
    expect(reminder('ru', 1, '2026-11-25').body).toBe('Завтра: Site visit');
    expect(reminder('de', 1, '2026-11-25').body).toBe('Morgen: Site visit');
  });

  it('names the start date for an earlier reminder', () => {
    expect(reminder('en', 7, '2026-11-25').body).toBe('Site visit — starts November 25');
    expect(reminder('ru', 2, '2026-11-25').body).toBe('Site visit — начало 25 ноября');
    expect(reminder('de', 7, '2026-11-25').body).toBe('Site visit – Beginn am 25. November');
  });

  it('falls back to the bare title when the start date is unknown', () => {
    expect(reminder('en', 7, null).body).toBe('Site visit');
    expect(reminder('en', null, 'not-a-date').body).toBe('Site visit');
  });

  it('opens the task on the timeline and groups with other pushes about it', () => {
    const push = reminder('en', 1, '2026-11-25');
    expect(push.url).toBe('https://motio.example/app?ws=ws-1&task=task-1');
    expect(push.tag).toBe('motio-task-task-1');
  });
});

describe('formatPushDate', () => {
  it('formats a calendar date without shifting it by a time zone', () => {
    expect(formatPushDate('en', '2026-01-01')).toBe('January 1');
    expect(formatPushDate('ru', '2026-12-31')).toBe('31 декабря');
  });

  it('returns an empty string for anything that is not a date', () => {
    expect(formatPushDate('en', null)).toBe('');
    expect(formatPushDate('en', '25.11.2026')).toBe('');
    expect(formatPushDate('en', '2026-13-45')).toBe('');
  });
});
