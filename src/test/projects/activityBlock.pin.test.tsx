import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBlock } from '@/features/projects/components/projectCard/ActivityBlock';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import type { ProjectActivity } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

vi.mock('@/shared/hooks/useKeyboardOffset', () => ({
  useKeyboardOffset: () => ({ offset: 0, height: 800 }),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

const mkEntry = (overrides: Partial<ProjectActivity>): ProjectActivity => ({
  id: overrides.id ?? 'e1',
  projectId: 'p1',
  authorId: 'u1',
  authorDisplayName: overrides.authorDisplayName ?? 'Niko G.',
  kind: 'comment',
  content: overrides.content ?? 'plain note',
  createdAt: overrides.createdAt ?? '2026-05-08T10:00:00Z',
  updatedAt: overrides.updatedAt ?? '2026-05-08T10:00:00Z',
  isEdited: false,
  pinned: overrides.pinned ?? false,
});

const baseProps = {
  canEdit: true,
  formatDate: (iso: string) => iso,
  onAdd: vi.fn(async () => true),
  onUpdate: vi.fn(async () => true),
  onDelete: vi.fn(async () => true),
  onSetPinned: vi.fn(async () => true),
};

describe('ActivityBlock — pin/unpin notes', () => {
  beforeEach(() => {
    useIsMobileMock.mockReturnValue(false);
    baseProps.onSetPinned.mockClear();
  });

  it('floats pinned notes to the top regardless of created_at order', () => {
    const entries = [
      mkEntry({ id: 'a', content: 'newest', createdAt: '2026-05-08T12:00:00Z' }),
      mkEntry({ id: 'b', content: 'pinned', createdAt: '2026-05-01T09:00:00Z', pinned: true }),
      mkEntry({ id: 'c', content: 'middle', createdAt: '2026-05-05T09:00:00Z' }),
    ];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('pinned');
    expect(items[1]).toHaveTextContent('newest');
    expect(items[2]).toHaveTextContent('middle');
  });

  it('shows the pinned indicator next to the date for pinned entries', () => {
    const entries = [mkEntry({ id: 'a', pinned: true })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    expect(screen.getByLabelText('Pinned')).toBeInTheDocument();
  });

  it('toggles pinned via the desktop modal Pin button', async () => {
    const entries = [mkEntry({ id: 'a', content: 'hello', pinned: false })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    fireEvent.click(screen.getByRole('listitem'));
    fireEvent.click(screen.getByRole('button', { name: 'Pin to top' }));

    expect(baseProps.onSetPinned).toHaveBeenCalledWith('a', true);
  });

  it('shows Unpin label when the entry is already pinned', () => {
    const entries = [mkEntry({ id: 'a', content: 'hello', pinned: true })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    fireEvent.click(screen.getAllByRole('listitem')[0]);

    expect(screen.getByRole('button', { name: 'Unpin' })).toBeInTheDocument();
  });
});
