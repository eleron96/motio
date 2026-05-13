import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectCardHeader } from '@/features/projects/components/projectCard/ProjectCardHeader';
import { useIsMobile } from '@/shared/hooks/use-mobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

const baseProject = {
  id: 'p1',
  name: 'Helsinki tower',
  code: 'HEL',
  color: '#3b82f6',
  customerId: 'c1',
  archived: false,
  status: 'IN PROGRESS',
  ownerGroupId: null,
} as never;

describe('ProjectCardHeader — mobile status edit (M2)', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('opens the bottom sheet when the chip is tapped on mobile', () => {
    useIsMobileMock.mockReturnValue(true);

    render(
      <ProjectCardHeader
        project={baseProject}
        customer={null}
        canEdit
        onSaveStatus={vi.fn(async () => true)}
      />,
    );

    const chip = screen.getByRole('button', { name: 'Edit project status: IN PROGRESS' });
    fireEvent.click(chip);

    // The MobileTextSheet renders a Sheet with role="dialog" and the title
    // "Edit project status".
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Edit project status');
  });

  it('opens the inline form on desktop, not the sheet', () => {
    useIsMobileMock.mockReturnValue(false);

    render(
      <ProjectCardHeader
        project={baseProject}
        customer={null}
        canEdit
        onSaveStatus={vi.fn(async () => true)}
      />,
    );

    const chip = screen.getByRole('button', { name: 'Edit project status: IN PROGRESS' });
    fireEvent.click(chip);

    // Inline editor surfaces the placeholder; bottom sheet does not.
    expect(screen.getByPlaceholderText('Project status')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('non-editors do not see an interactive chip on mobile', () => {
    useIsMobileMock.mockReturnValue(true);

    render(
      <ProjectCardHeader
        project={baseProject}
        customer={null}
        canEdit={false}
        onSaveStatus={vi.fn(async () => true)}
      />,
    );

    const chip = screen.getByRole('button', { name: 'Project status: IN PROGRESS' });
    expect(chip).toBeDisabled();
  });
});
