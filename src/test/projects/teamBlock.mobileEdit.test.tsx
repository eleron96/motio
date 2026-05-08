import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamBlock } from '@/features/projects/components/projectCard/TeamBlock';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import type { Assignee, ProjectMember } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

const member: ProjectMember = {
  id: 'm1',
  projectId: 'p1',
  assigneeId: 'a1',
  role: 'Designer',
  position: 0,
  tag: null,
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

describe('TeamBlock — mobile add/edit/remove (M3)', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('opens the bottom-sheet add form when + is tapped on mobile', () => {
    useIsMobileMock.mockReturnValue(true);

    render(<TeamBlock {...baseProps} />);

    fireEvent.click(screen.getByLabelText('Add team member'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Add team member');
    // The mobile add sheet renders the Motio | External tabs.
    expect(screen.getByText('Motio')).toBeInTheDocument();
    expect(screen.getByText('External')).toBeInTheDocument();
  });

  it('uses the desktop dropdown on desktop, no bottom sheet', () => {
    useIsMobileMock.mockReturnValue(false);

    render(<TeamBlock {...baseProps} />);

    fireEvent.click(screen.getByLabelText('Add team member'));

    // Desktop opens a `DropdownMenu` (role=menu), not a sheet (role=dialog).
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the remove-confirm sheet instead of firing delete directly', () => {
    useIsMobileMock.mockReturnValue(true);
    const onRemove = vi.fn(async () => true);

    render(<TeamBlock {...baseProps} onRemoveMember={onRemove} />);

    fireEvent.click(screen.getByLabelText('Remove from team'));

    expect(onRemove).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Remove from team');
    expect(dialog).toHaveTextContent('Alexandra Robertson');
  });
});
