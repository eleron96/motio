import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAnnouncementForm } from '@/features/admin/components/AdminAnnouncementForm';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';

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

type Row = {
  id: string;
  title: string;
  titleEn: string | null;
  bodyRu: string | null;
  bodyEn: string | null;
  level: 'info' | 'critical';
  audienceKind: 'all_active' | 'domain' | 'workspace';
  audienceValue: string | null;
  published: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  dismissedCount: number;
};

const row = (overrides: Partial<Row> = {}): Row => ({
  id: 'a1',
  title: 'Мобильная версия',
  titleEn: 'Mobile version',
  bodyRu: 'Свайпайте между разделами.',
  bodyEn: 'Swipe between sections.',
  level: 'info',
  audienceKind: 'all_active',
  audienceValue: null,
  published: true,
  startsAt: '2026-08-01T00:00:00.000Z',
  endsAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  dismissedCount: 4,
  ...overrides,
});

/** Every call answers "no error"; the list call answers with these rows. */
const serveRows = (rows: Row[]) => {
  invoke.mockImplementation(async (payload: { action: string }) => (
    payload.action === ADMIN_ACTIONS.ANNOUNCEMENTS_LIST
      ? { data: { announcements: rows }, error: null }
      : { data: {}, error: null }
  ));
};

const callsFor = (action: string) => invoke.mock.calls
  .map(([payload]) => payload as Record<string, unknown>)
  .filter((payload) => payload.action === action);

const openRowMenu = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  const cell = await screen.findByText(title);
  const tableRow = cell.closest('tr');
  if (!tableRow) throw new Error('row not found');
  await user.click(within(tableRow as HTMLElement).getByRole('button', { name: 'Actions' }));
};

describe('AdminAnnouncementForm history actions', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('labels where each announcement stands', async () => {
    serveRows([
      row({ id: 'live', title: 'Идёт' }),
      row({ id: 'draft', title: 'Черновик', published: false }),
      row({ id: 'later', title: 'Позже', startsAt: '2099-01-01T00:00:00.000Z' }),
      row({ id: 'done', title: 'Закончилось', endsAt: '2020-01-01T00:00:00.000Z' }),
    ]);

    render(<AdminAnnouncementForm workspaces={[]} />);

    const statusOf = async (title: string) => {
      const tableRow = (await screen.findByText(title)).closest('tr') as HTMLElement;
      return tableRow.children[1].textContent;
    };
    expect(await statusOf('Идёт')).toBe('Live');
    expect(await statusOf('Черновик')).toBe('Draft');
    expect(await statusOf('Позже')).toBe('Scheduled');
    expect(await statusOf('Закончилось')).toBe('Finished');
  });

  it('loads an announcement into the form for editing and saves it back', async () => {
    const user = userEvent.setup();
    serveRows([row({ audienceKind: 'domain', audienceValue: 'example.com' })]);

    render(<AdminAnnouncementForm workspaces={[]} />);
    await openRowMenu(user, 'Мобильная версия');
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(screen.getByText('Edit announcement')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Мобильная версия')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Swipe between sections.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('example.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE)).toEqual([{
      action: ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE,
      announcementId: 'a1',
      titleRu: 'Мобильная версия',
      titleEn: 'Mobile version',
      bodyRu: 'Свайпайте между разделами.',
      bodyEn: 'Swipe between sections.',
      level: 'info',
      audienceKind: 'domain',
      audienceValue: 'example.com',
      endsAt: null,
    }]);
    // Editing must not create a second announcement.
    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_PUBLISH)).toHaveLength(0);
  });

  it('duplicates the wording into a new announcement instead of editing the old one', async () => {
    const user = userEvent.setup();
    serveRows([row()]);

    render(<AdminAnnouncementForm workspaces={[]} />);
    await openRowMenu(user, 'Мобильная версия');
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

    expect(screen.getByText('New announcement')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE)).toHaveLength(0);
    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_PUBLISH)[0]).toMatchObject({
      titleRu: 'Мобильная версия',
      published: true,
    });
  });

  it('publishes again over a chosen window and clears the dismissals', async () => {
    const user = userEvent.setup();
    serveRows([row()]);

    render(<AdminAnnouncementForm workspaces={[]} />);
    await openRowMenu(user, 'Мобильная версия');
    await user.click(screen.getByRole('menuitem', { name: 'Publish again…' }));

    const dialog = screen.getByRole('dialog');
    const dates = within(dialog).getAllByDisplayValue(/^$|^\d{4}-\d{2}-\d{2}$/);
    await user.clear(dates[0]);
    await user.type(dates[0], '2026-09-01');
    await user.type(dates[1], '2026-09-10');
    await user.click(within(dialog).getByRole('button', { name: 'Publish again' }));

    // The window is expressed in the admin's own day, so the expected instants
    // are derived the same way rather than hard-coded to one timezone.
    const [update] = callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE);
    expect(update).toMatchObject({
      announcementId: 'a1',
      published: true,
      startsAt: new Date('2026-09-01T00:00:00').toISOString(),
      endsAt: new Date('2026-09-10T23:59:59').toISOString(),
    });
    // The box is on by default: otherwise the people who closed it never see it.
    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_RESET_READS)).toEqual([
      { action: ADMIN_ACTIONS.ANNOUNCEMENTS_RESET_READS, announcementId: 'a1' },
    ]);
  });

  it('leaves the dismissals alone when re-publishing with the box off', async () => {
    const user = userEvent.setup();
    serveRows([row()]);

    render(<AdminAnnouncementForm workspaces={[]} />);
    await openRowMenu(user, 'Мобильная версия');
    await user.click(screen.getByRole('menuitem', { name: 'Publish again…' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Publish again' }));

    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE)).toHaveLength(1);
    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_RESET_READS)).toHaveLength(0);
  });

  it('asks before deleting an announcement', async () => {
    const user = userEvent.setup();
    serveRows([row()]);

    render(<AdminAnnouncementForm workspaces={[]} />);
    await openRowMenu(user, 'Мобильная версия');
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_DELETE)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_DELETE)).toEqual([
      { action: ADMIN_ACTIONS.ANNOUNCEMENTS_DELETE, announcementId: 'a1' },
    ]);
  });

  it('offers to bring an announcement back only when someone has closed it', async () => {
    const user = userEvent.setup();
    serveRows([row({ dismissedCount: 0 })]);

    render(<AdminAnnouncementForm workspaces={[]} />);
    await openRowMenu(user, 'Мобильная версия');

    expect(screen.getByRole('menuitem', { name: 'Show again to everyone' }))
      .toHaveAttribute('aria-disabled', 'true');
  });

  it('publishes a draft straight from the row menu', async () => {
    const user = userEvent.setup();
    serveRows([row({ published: false })]);

    render(<AdminAnnouncementForm workspaces={[]} />);
    await openRowMenu(user, 'Мобильная версия');
    await user.click(screen.getByRole('menuitem', { name: 'Publish' }));

    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE)).toEqual([
      { action: ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE, announcementId: 'a1', published: true },
    ]);
  });

  it('saves a new announcement as a draft without showing it to anyone', async () => {
    const user = userEvent.setup();
    serveRows([]);

    render(<AdminAnnouncementForm workspaces={[]} />);
    await user.type(screen.getAllByRole('textbox')[0], 'Тихий черновик');
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));

    expect(callsFor(ADMIN_ACTIONS.ANNOUNCEMENTS_PUBLISH)[0]).toMatchObject({
      titleRu: 'Тихий черновик',
      published: false,
    });
  });
});
