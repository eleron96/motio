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

  it('floats pinned notes to the top, then sorts the rest oldest-first', () => {
    const entries = [
      mkEntry({ id: 'a', content: 'newest', createdAt: '2026-05-08T12:00:00Z' }),
      mkEntry({ id: 'b', content: 'pinned', createdAt: '2026-05-01T09:00:00Z', pinned: true }),
      mkEntry({ id: 'c', content: 'middle', createdAt: '2026-05-05T09:00:00Z' }),
      mkEntry({ id: 'd', content: 'oldest', createdAt: '2026-04-30T09:00:00Z' }),
    ];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('pinned');
    expect(items[1]).toHaveTextContent('oldest');
    expect(items[2]).toHaveTextContent('middle');
    expect(items[3]).toHaveTextContent('newest');
  });

  it('shows an Unpin button on already-pinned entries (editor view)', () => {
    const entries = [mkEntry({ id: 'a', pinned: true })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    // Editor sees an interactive Pin/Unpin button; the inline + modal
    // versions share the same aria-label so getAllByRole returns ≥1.
    expect(screen.getAllByRole('button', { name: 'Unpin' }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows a non-interactive "Pinned" indicator for read-only viewers', () => {
    const entries = [mkEntry({ id: 'a', pinned: true })];

    render(<ActivityBlock {...baseProps} canEdit={false} entries={entries} />);

    expect(screen.getByLabelText('Pinned')).toBeInTheDocument();
    // Read-only viewers don't see the toggle button.
    expect(screen.queryByRole('button', { name: 'Unpin' })).toBeNull();
  });

  it('exposes a kebab "More actions" trigger inside the desktop modal', () => {
    // Pin / Delete moved to a kebab DropdownMenu on desktop. Radix's menu
    // opens on pointer-events that jsdom doesn't dispatch via fireEvent —
    // we assert the trigger renders and rely on integration testing on the
    // test server for the full menu interaction. The inline pin button on
    // each row already has its own assertion above.
    const entries = [mkEntry({ id: 'a', content: 'hello', pinned: false })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    fireEvent.click(screen.getByRole('listitem'));
    const dialog = screen.getByRole('dialog');
    const kebab = dialog.querySelector('button[aria-label="More actions"]');
    expect(kebab).not.toBeNull();
  });

  it('inline pin button on the row toggles without opening the modal', () => {
    const entries = [mkEntry({ id: 'a', content: 'hello', pinned: false })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    // Two buttons may share the "Pin to top" label (inline + modal); but the
    // modal hasn't been opened yet, so the inline one is the only candidate.
    fireEvent.click(screen.getByRole('button', { name: 'Pin to top' }));

    expect(baseProps.onSetPinned).toHaveBeenCalledWith('a', true);
    // Click should NOT have bubbled to the row — modal stays closed.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a search snippet with the matched word highlighted', () => {
    const longContent = 'lorem ipsum dolor sit amet, consectetur adipiscing elit, '
      + 'sed do eiusmod tempor incididunt ut labore et dolore MAGNA aliqua. '
      + 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.';
    const entries = [mkEntry({ id: 'a', content: longContent })];

    const { container } = render(
      <ActivityBlock {...baseProps} entries={entries} />,
    );

    // Type a search query and let the filter render the snippet.
    const searchInput = screen.getByPlaceholderText('Search notes...');
    fireEvent.change(searchInput, { target: { value: 'magna' } });

    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('MAGNA');
    // Snippet should clip with an ellipsis on at least one edge for long text.
    expect(container.textContent).toContain('…');
  });

  it('inline row button label flips to Unpin when entry is pinned', () => {
    // The kebab Pin/Unpin label flips too (covered by integration on the
    // test server). Here we assert the inline row variant of the same flip,
    // which is the path users see most often in the feed itself.
    const entries = [mkEntry({ id: 'a', content: 'hello', pinned: true })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    expect(screen.getByRole('button', { name: 'Unpin' })).toBeInTheDocument();
  });
});
