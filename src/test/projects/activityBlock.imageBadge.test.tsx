import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('ActivityBlock — image attachment badge', () => {
  beforeEach(() => {
    useIsMobileMock.mockReturnValue(false);
  });

  it('marks notes containing an <img> with the image badge', () => {
    const entries = [
      mkEntry({ id: 'a', content: '<p>Report</p><img src="https://x/y.png">' }),
      mkEntry({ id: 'b', content: 'text only note' }),
    ];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    // Exactly one of the two rows carries the badge — the one with the <img>.
    expect(screen.getAllByLabelText('Contains an image')).toHaveLength(1);
  });

  it('badges an image-only note whose clamped preview is empty', () => {
    const entries = [mkEntry({ id: 'a', content: '<img src="https://x/y.png">' })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    expect(screen.getByLabelText('Contains an image')).toBeInTheDocument();
  });

  it('shows no badge when no note has an image', () => {
    const entries = [mkEntry({ id: 'a' }), mkEntry({ id: 'b', content: '<b>bold</b> text' })];

    render(<ActivityBlock {...baseProps} entries={entries} />);

    expect(screen.queryByLabelText('Contains an image')).not.toBeInTheDocument();
  });
});
