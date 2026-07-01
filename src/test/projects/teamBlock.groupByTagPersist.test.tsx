import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TeamBlock } from '@/features/projects/components/projectCard/TeamBlock';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import type { Assignee, ProjectMember } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const member: ProjectMember = {
  id: 'm1',
  projectId: 'p1',
  assigneeId: 'a1',
  role: 'Designer',
  position: 0,
  tag: 'AR',
  externalName: null,
  externalCompany: null,
  externalEmail: null,
  externalPhone: null,
};

const assignee: Assignee = {
  id: 'a1',
  name: 'Alexandra Robertson',
  isActive: true,
  userId: 'u1',
  email: 'ar@example.com',
  phone: null,
};

const baseProps = {
  members: [member],
  taskFallbackMembers: [] as Assignee[],
  assigneesById: new Map([[assignee.id, assignee]]),
  workspaceAssignees: [assignee],
  canEdit: true,
  onAddMember: vi.fn(async () => true),
  onRemoveMember: vi.fn(async () => true),
  onUpdateAssigneeContact: vi.fn(async () => true),
  onUpdateExternalMember: vi.fn(async () => true),
};

const STORAGE_KEY = 'projects-team-group-by-tag';

describe('TeamBlock — group-by-tag toggle persists across remounts', () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    window.localStorage.clear();
  });

  it('survives unmount/remount (simulating a tab switch)', () => {
    const { unmount } = render(<TeamBlock {...baseProps} />);

    const toggle = screen.getByTitle('Group by company/contractor');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');

    // Leaving the Projects tab unmounts the panel; coming back remounts it.
    unmount();
    render(<TeamBlock {...baseProps} />);

    expect(screen.getByTitle('Group by company/contractor')).toHaveAttribute('aria-pressed', 'true');
  });

  it('hydrates the enabled state from storage on first mount', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');

    render(<TeamBlock {...baseProps} />);

    expect(screen.getByTitle('Group by company/contractor')).toHaveAttribute('aria-pressed', 'true');
  });

  it('persists the disabled state too', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    const { unmount } = render(<TeamBlock {...baseProps} />);

    fireEvent.click(screen.getByTitle('Group by company/contractor'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('0');

    unmount();
    cleanup();
    render(<TeamBlock {...baseProps} />);
    expect(screen.getByTitle('Group by company/contractor')).toHaveAttribute('aria-pressed', 'false');
  });
});
