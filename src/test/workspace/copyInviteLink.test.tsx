import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/shared/ui/sonner', () => ({ toast: toastMock }));

import { useCopyInviteLink } from '@/features/workspace/hooks/useCopyInviteLink';
import { WorkspaceInvitesMobileScreen } from '@/features/workspace/components/WorkspaceInvitesMobileScreen';

const link = `${window.location.origin}/invite/tok-1`;
const setClipboard = (writeText?: (text: string) => Promise<void>) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
};
const setExecCommand = (result: boolean | Error) => {
  Object.defineProperty(document, 'execCommand', {
    value: vi.fn(() => {
      if (result instanceof Error) throw result;
      return result;
    }),
    configurable: true,
  });
};

describe('useCopyInviteLink', () => {
  beforeEach(() => {
    toastMock.mockReset();
    toastMock.success.mockReset();
  });
  afterEach(() => {
    setClipboard(undefined);
  });

  it('copies through the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const { result } = renderHook(() => useCopyInviteLink());

    await act(() => result.current('tok-1'));

    expect(writeText).toHaveBeenCalledWith(link);
    expect(toastMock.success).toHaveBeenCalledWith('Invitation link copied');
  });

  it('falls back to copying a selection where the clipboard is refused or missing', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    setExecCommand(true);
    const { result } = renderHook(() => useCopyInviteLink());

    await act(() => result.current('tok-1'));

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(toastMock.success).toHaveBeenCalledWith('Invitation link copied');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('shows the link to copy by hand when nothing can be copied', async () => {
    setClipboard(undefined);
    setExecCommand(new Error('not supported'));
    const { result } = renderHook(() => useCopyInviteLink());

    await act(() => result.current('tok-1'));

    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith('Copy the invitation link', expect.objectContaining({ description: link }));
  });
});

describe('WorkspaceInvitesMobileScreen', () => {
  it('drops the notice of an invitation once it is revoked', async () => {
    const onRevoke = vi.fn();
    const outcome = { email: 'anna@example.com', delivery: 'in_app' as const, token: 'tok-1', alreadyMember: false };
    render(
      <WorkspaceInvitesMobileScreen
        open
        onOpenChange={vi.fn()}
        isAdmin
        groups={[]}
        invites={[{
          token: 'tok-1',
          workspaceId: 'ws-1',
          email: 'anna@example.com',
          status: 'pending',
          isPending: true,
          createdAt: null,
        } as never]}
        invitesLoading={false}
        onInvite={vi.fn().mockResolvedValue({ outcome })}
        onRevoke={onRevoke}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    fireEvent.change(await screen.findByPlaceholderText('name@example.com'), { target: { value: 'anna@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    });
    expect(await screen.findByText('Invitation created')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(onRevoke).toHaveBeenCalledWith('tok-1');
    expect(screen.queryByText('Invitation created')).not.toBeInTheDocument();
  });
});
