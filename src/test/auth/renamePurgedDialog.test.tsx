import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof strings === 'string') return strings;
    return strings.reduce(
      (acc, str, index) => acc + str + (values[index] !== undefined ? String(values[index]) : ''),
      '',
    );
  },
}));

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

// Radix Dialog renders via portal; jsdom has document.body, so that's fine.
// pointer-events are set on body by Radix — reset for userEvent.
beforeEach(() => {
  document.body.style.pointerEvents = '';
});

import { RenamePurgedDialog } from '@/features/workspace/components/RenamePurgedDialog';

const renderDialog = (overrides: Partial<React.ComponentProps<typeof RenamePurgedDialog>> = {}) => {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue({});
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  const props: React.ComponentProps<typeof RenamePurgedDialog> = {
    open: true,
    onOpenChange,
    userId: 'user-1',
    currentDisplayName: 'Offender',
    onSubmit,
    ...overrides,
  };
  const utils = render(<RenamePurgedDialog {...props} />);
  return { ...utils, onSubmit, onOpenChange };
};

describe('RenamePurgedDialog', () => {
  it('prefills the input with current display name', () => {
    renderDialog();
    const input = screen.getByTestId('rename-purged-input') as HTMLInputElement;
    expect(input.value).toBe('Offender');
  });

  it('rejects empty name and does not call onSubmit', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog({ currentDisplayName: '' });

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();

    const input = screen.getByTestId('rename-purged-input');
    await user.type(input, '   ');
    expect(saveButton).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows validation error for name > 40 chars', async () => {
    const user = userEvent.setup();
    renderDialog({ currentDisplayName: '' });

    const input = screen.getByTestId('rename-purged-input');
    await user.type(input, 'A'.repeat(41));
    expect(await screen.findByText(/at most 40 characters/i)).toBeInTheDocument();
  });

  it('shows validation error for name containing URL', async () => {
    const user = userEvent.setup();
    renderDialog({ currentDisplayName: '' });

    const input = screen.getByTestId('rename-purged-input');
    await user.type(input, 'see https://evil.example');
    expect(await screen.findByText(/cannot contain a URL/i)).toBeInTheDocument();
  });

  it('shows validation error for name containing @', async () => {
    const user = userEvent.setup();
    renderDialog({ currentDisplayName: '' });

    const input = screen.getByTestId('rename-purged-input');
    await user.type(input, 'bad@name');
    expect(await screen.findByText(/cannot contain @/i)).toBeInTheDocument();
  });

  it('shows validation error for reserved word', async () => {
    const user = userEvent.setup();
    renderDialog({ currentDisplayName: '' });

    const input = screen.getByTestId('rename-purged-input');
    await user.type(input, 'admin');
    expect(await screen.findByText('This name is reserved.')).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed name and closes on success', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});
    const onOpenChange = vi.fn();
    renderDialog({ onSubmit, onOpenChange, currentDisplayName: '' });

    const input = screen.getByTestId('rename-purged-input');
    await user.type(input, '  Deleted User  ');
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('user-1', 'Deleted User');
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows server error and keeps dialog open when onSubmit returns error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ error: 'target_not_purged' });
    const onOpenChange = vi.fn();
    renderDialog({ onSubmit, onOpenChange, currentDisplayName: '' });

    const input = screen.getByTestId('rename-purged-input');
    await user.type(input, 'New Name');
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    expect(await screen.findByText(/target_not_purged/)).toBeInTheDocument();
    // onOpenChange should NOT have been called with false on server error
    const closeCalls = onOpenChange.mock.calls.filter((call) => call[0] === false);
    expect(closeCalls.length).toBe(0);
  });

  it('does not submit when userId is null', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});
    renderDialog({ onSubmit, userId: null, currentDisplayName: '' });

    const input = screen.getByTestId('rename-purged-input');
    await user.type(input, 'New Name');
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancel button calls onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    const cancel = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancel);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
