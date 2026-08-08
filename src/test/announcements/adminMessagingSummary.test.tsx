import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminMessagingSummary } from '@/features/admin/components/AdminMessagingSummary';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { summarizeAnnouncements, type AnnouncementRow } from '@/features/admin/lib/announcements';
import { summarizeBroadcasts, type BroadcastRow } from '@/features/admin/lib/broadcasts';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: () => 'ru',
}));

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/infrastructure/auth/functionsGateway', () => ({
  invokeAdminFunction: invoke,
}));

const announcement = (overrides: Partial<AnnouncementRow> = {}): AnnouncementRow => ({
  id: 'a1',
  title: 'Мобильная версия',
  titleEn: 'Mobile version',
  bodyRu: null,
  bodyEn: null,
  level: 'info',
  audienceKind: 'all_active',
  audienceValue: null,
  published: true,
  startsAt: '2020-01-01T00:00:00.000Z',
  endsAt: null,
  createdAt: '2020-01-01T00:00:00.000Z',
  dismissedCount: 0,
  ...overrides,
});

const broadcast = (overrides: Partial<BroadcastRow> = {}): BroadcastRow => ({
  id: 'b1',
  subject: 'Обновление',
  status: 'sent',
  messageType: 'announcement',
  audienceKind: 'subscribers',
  audienceValue: null,
  totalRecipients: 40,
  sentCount: 38,
  failedCount: 2,
  scheduledAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  finishedAt: '2026-08-01T10:05:00.000Z',
  ...overrides,
});

const serve = (announcements: AnnouncementRow[], broadcasts: BroadcastRow[]) => {
  invoke.mockImplementation(async (payload: { action: string }) => {
    if (payload.action === ADMIN_ACTIONS.ANNOUNCEMENTS_LIST) {
      return { data: { announcements }, error: null };
    }
    if (payload.action === ADMIN_ACTIONS.BROADCASTS_LIST) {
      return { data: { broadcasts }, error: null };
    }
    return { data: {}, error: null };
  });
};

const renderSummary = () => render(
  <MemoryRouter>
    <AdminMessagingSummary />
  </MemoryRouter>,
);

describe('summarizeAnnouncements', () => {
  const now = Date.parse('2026-08-08T12:00:00.000Z');

  it('counts each announcement once, by where it stands', () => {
    const summary = summarizeAnnouncements([
      announcement({ id: 'live', dismissedCount: 3 }),
      announcement({ id: 'live-2', dismissedCount: 4 }),
      announcement({ id: 'draft', published: false }),
      announcement({ id: 'later', startsAt: '2099-01-01T00:00:00.000Z' }),
      announcement({ id: 'done', endsAt: '2020-06-01T00:00:00.000Z' }),
    ], now);

    expect(summary.live.map((row) => row.id)).toEqual(['live', 'live-2']);
    expect(summary.drafts).toBe(1);
    expect(summary.scheduled).toBe(1);
    expect(summary.finished).toBe(1);
    expect(summary.liveDismissed).toBe(7);
  });

  it('treats an unpublished announcement as a draft even after its window passed', () => {
    const summary = summarizeAnnouncements([
      announcement({ published: false, endsAt: '2020-06-01T00:00:00.000Z' }),
    ], now);

    expect(summary.drafts).toBe(1);
    expect(summary.finished).toBe(0);
  });
});

describe('summarizeBroadcasts', () => {
  it('picks the most recent broadcast and counts what is still moving', () => {
    const summary = summarizeBroadcasts([
      broadcast({ id: 'old', createdAt: '2026-07-01T00:00:00.000Z' }),
      broadcast({ id: 'new', subject: 'Свежая', createdAt: '2026-08-05T00:00:00.000Z' }),
      broadcast({ id: 'queued', status: 'scheduled', sentCount: 0, failedCount: 0 }),
      broadcast({ id: 'now', status: 'sending', sentCount: 5, failedCount: 0 }),
    ]);

    expect(summary.latest?.id).toBe('new');
    expect(summary.scheduled).toBe(1);
    expect(summary.sending).toBe(1);
    expect(summary.delivered).toBe(38 + 38 + 0 + 5);
    expect(summary.failed).toBe(4);
  });
});

describe('AdminMessagingSummary', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('shows what is on screen for users right now and what is queued behind it', async () => {
    serve(
      [
        announcement({ id: 'live', dismissedCount: 12, endsAt: '2099-01-01T00:00:00.000Z' }),
        announcement({ id: 'draft', title: 'Черновик', published: false }),
        announcement({ id: 'later', title: 'Позже', startsAt: '2099-01-01T00:00:00.000Z' }),
      ],
      [broadcast()],
    );

    renderSummary();

    expect(await screen.findByText('Мобильная версия')).toBeInTheDocument();
    expect(screen.getByText(/closed by 12/)).toBeInTheDocument();
    expect(screen.getByText(/scheduled: 1/)).toBeInTheDocument();
    expect(screen.getByText(/drafts: 1/)).toBeInTheDocument();
    // A draft is not "showing", so its title must not read as live.
    expect(screen.queryByText('Черновик')).not.toBeInTheDocument();

    expect(await screen.findByText('Обновление')).toBeInTheDocument();
    expect(screen.getByText(/delivered 38 of 40/)).toBeInTheDocument();
  });

  it('says plainly when nothing is reaching anyone', async () => {
    serve([announcement({ published: false })], []);

    renderSummary();

    expect(await screen.findByText('Nothing is showing right now.')).toBeInTheDocument();
    expect(await screen.findByText('Nothing has been sent yet.')).toBeInTheDocument();
  });
});
