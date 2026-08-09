import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { invokeAdminFunctionMock, adminState } = vi.hoisted(() => ({
  invokeAdminFunctionMock: vi.fn(),
  // Stable object: a fresh state per selector call would defeat useShallow
  // and put the page into an endless re-render loop.
  adminState: {
    adminUsers: [
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'bob@example.com' },
    ],
    fetchAdminUsers: vi.fn(),
    adminWorkspaces: [{ id: 'w1', name: 'Studio' }],
    fetchAdminWorkspaces: vi.fn(),
  },
}));

vi.mock('@/infrastructure/auth/functionsGateway', () => ({
  invokeAdminFunction: invokeAdminFunctionMock,
}));

vi.mock('@/features/admin/store/adminStore', () => ({
  useAdminStore: (selector?: (s: typeof adminState) => unknown) =>
    (typeof selector === 'function' ? selector(adminState) : adminState),
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector?: (s: { locale: string }) => unknown) => {
    const state = { locale: 'en' };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), ''),
}));

// Radix Select needs these in jsdom.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

import AdminEasterEggsPage from '@/features/admin/pages/AdminEasterEggsPage';

const target = {
  id: '11111111-1111-1111-1111-111111111111',
  eggKey: 'shabbat',
  audienceKind: 'user' as const,
  audienceValue: null,
  audienceLabel: null,
  userId: 'u1',
  userEmail: 'alice@example.com',
  userDisplayName: 'Alice',
  enabled: true,
  note: null,
  startsAt: null,
  endsAt: null,
  createdAt: '2026-07-01T00:00:00Z',
};

describe('AdminEasterEggsPage', () => {
  beforeEach(() => {
    invokeAdminFunctionMock.mockReset();
    invokeAdminFunctionMock.mockImplementation(async (payload: { action: string }) => {
      if (payload.action === 'easterEggs.list') {
        return { data: { targets: [target] } };
      }
      if (payload.action === 'users.list') {
        return {
          data: {
            users: [
              { id: 'u1', email: 'alice@example.com', displayName: 'Alice' },
              { id: 'admin', email: 'owner@example.com', displayName: 'Нико' },
            ],
          },
        };
      }
      return { data: { success: true } };
    });
  });

  it('lists assignments and saves an in-row egg change', async () => {
    render(<AdminEasterEggsPage />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();

    // The row select shows the current egg; switching it saves immediately.
    const rowSelect = screen.getByRole('combobox', { name: 'Change easter egg' });
    fireEvent.click(rowSelect);
    const option = await screen.findByRole('option', { name: 'six-seven' });
    fireEvent.click(option);

    await waitFor(() => {
      expect(invokeAdminFunctionMock).toHaveBeenCalledWith(expect.objectContaining({
        action: 'easterEggs.save',
        id: target.id,
        eggKey: 'six-seven',
        audienceKind: 'user',
        userId: 'u1',
        enabled: true,
      }));
    });
  });

  it('asks for the roster with super admins, so an admin can pick themselves', async () => {
    render(<AdminEasterEggsPage />);
    await screen.findByText('Alice');

    await waitFor(() => {
      expect(invokeAdminFunctionMock).toHaveBeenCalledWith(expect.objectContaining({
        action: 'users.list',
        includeSuperAdmins: true,
      }));
    });
  });

  it('finds a person by typing instead of scrolling a long list', async () => {
    render(<AdminEasterEggsPage />);
    await screen.findByText('Alice');

    // Third combobox in the form: egg, audience, then the person picker.
    fireEvent.click(screen.getAllByRole('combobox')[2]!);
    const search = await screen.findByPlaceholderText('Search by name or email');

    // Look at the picker's own options: the table below mentions the same
    // people, so a page-wide text query would prove nothing.
    const options = () => screen.getAllByRole('option').map((option) => option.textContent ?? '');

    fireEvent.change(search, { target: { value: 'owner@' } });
    await waitFor(() => {
      expect(options().join(' ')).toContain('owner@example.com');
    });
    expect(options().join(' ')).not.toContain('alice@example.com');

    // Matching runs over display names too.
    fireEvent.change(search, { target: { value: 'Alice' } });
    await waitFor(() => {
      expect(options().join(' ')).toContain('alice@example.com');
    });
  });

  it('assigns an egg to a whole mail domain in one row', async () => {
    render(<AdminEasterEggsPage />);
    await screen.findByText('Alice');

    // Audience: email domain.
    fireEvent.click(screen.getAllByRole('combobox')[1]!);
    fireEvent.click(await screen.findByRole('option', { name: 'Email domain' }));
    fireEvent.change(screen.getByPlaceholderText('example.com'), { target: { value: 'speech.ru' } });

    // The window is optional; set an end date to prove it travels.
    fireEvent.change(document.getElementById('egg-ends-at') as HTMLInputElement, {
      target: { value: '2026-08-31' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => {
      expect(invokeAdminFunctionMock).toHaveBeenCalledWith(expect.objectContaining({
        action: 'easterEggs.save',
        audienceKind: 'domain',
        audienceValue: 'speech.ru',
        enabled: true,
        endsAt: new Date('2026-08-31T23:59:59').toISOString(),
      }));
    });
    // A domain row addresses nobody in particular.
    const call = invokeAdminFunctionMock.mock.calls
      .map(([payload]) => payload as Record<string, unknown>)
      .find((payload) => payload.audienceKind === 'domain')!;
    expect(call.userId).toBeUndefined();
  });

  it('asks how many people an audience covers before it is saved', async () => {
    render(<AdminEasterEggsPage />);
    await screen.findByText('Alice');

    fireEvent.click(screen.getAllByRole('combobox')[1]!);
    fireEvent.click(await screen.findByRole('option', { name: 'Everyone' }));

    await waitFor(() => {
      expect(invokeAdminFunctionMock).toHaveBeenCalledWith(expect.objectContaining({
        action: 'easterEggs.audience',
        audienceKind: 'all_active',
      }));
    });
  });

  it('toggles activity without changing the key', async () => {
    render(<AdminEasterEggsPage />);
    await screen.findByText('Alice');

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle easter egg' }));

    await waitFor(() => {
      expect(invokeAdminFunctionMock).toHaveBeenCalledWith(expect.objectContaining({
        action: 'easterEggs.save',
        id: target.id,
        eggKey: 'shabbat',
        enabled: false,
      }));
    });
  });
});
