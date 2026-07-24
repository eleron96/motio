import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { invokeAdminFunctionMock, adminState } = vi.hoisted(() => ({
  invokeAdminFunctionMock: vi.fn(),
  adminState: {
    adminWorkspaces: [{ id: 'w1', name: 'Team A' }],
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

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

import AdminBroadcastPage from '@/features/admin/pages/AdminBroadcastPage';

const findCall = (action: string) =>
  invokeAdminFunctionMock.mock.calls.map((c) => c[0]).filter((p) => p.action === action);

describe('AdminBroadcastPage', () => {
  beforeEach(() => {
    invokeAdminFunctionMock.mockReset();
    invokeAdminFunctionMock.mockImplementation(async (payload: { action: string }) => {
      if (payload.action === 'broadcasts.audience') return { data: { count: 7 } };
      if (payload.action === 'broadcasts.list') return { data: { broadcasts: [] } };
      if (payload.action === 'broadcasts.send') return { data: { broadcastId: 'b1', total: 7 } };
      if (payload.action === 'broadcasts.process') return { data: { sentCount: 7, failedCount: 0, remaining: 0, done: true } };
      return { data: {} };
    });
  });

  it('previews the audience for the default announcement/subscribers segment', async () => {
    render(<AdminBroadcastPage />);
    await waitFor(() => {
      expect(findCall('broadcasts.audience')[0]).toMatchObject({
        messageType: 'announcement',
        audienceKind: 'subscribers',
      });
    });
    expect(await screen.findByText('Recipients: 7')).toBeInTheDocument();
  });

  it('switching to service notice re-queries the audience as all_active', async () => {
    render(<AdminBroadcastPage />);
    await screen.findByText('Recipients: 7');

    fireEvent.click(screen.getByText('Service notice'));

    await waitFor(() => {
      const calls = findCall('broadcasts.audience');
      expect(calls.some((c) => c.messageType === 'service' && c.audienceKind === 'all_active')).toBe(true);
    });
  });

  it('drives the process loop to completion for an immediate send', async () => {
    render(<AdminBroadcastPage />);
    await screen.findByText('Recipients: 7');

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Body text' } });

    // Send button opens confirm; confirm action fires the send.
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(findCall('broadcasts.send')[0]).toMatchObject({
        messageType: 'announcement',
        audienceKind: 'subscribers',
        subject: 'Hello',
      });
      expect(findCall('broadcasts.process').length).toBeGreaterThanOrEqual(1);
    });
  });
});
