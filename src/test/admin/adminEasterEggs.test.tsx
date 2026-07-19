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
  userId: 'u1',
  userEmail: 'alice@example.com',
  userDisplayName: 'Alice',
  enabled: true,
  note: null,
  createdAt: '2026-07-01T00:00:00Z',
};

describe('AdminEasterEggsPage', () => {
  beforeEach(() => {
    invokeAdminFunctionMock.mockReset();
    invokeAdminFunctionMock.mockImplementation(async (payload: { action: string }) => {
      if (payload.action === 'easterEggs.list') {
        return { data: { targets: [target] } };
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
        enabled: true,
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
