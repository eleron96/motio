import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectCardSidebar } from '@/features/projects/components/projectCard/ProjectCardSidebar';
import { ProjectsMobileList } from '@/features/projects/components/ProjectsMobileList';
import { buildGroupMarkColorMap, toGroupMarkColor } from '@/shared/domain/groupColor';
import type { MemberGroup, Project } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const SKY = '#6fbfe2';

const groups: MemberGroup[] = [
  { id: 'g1', name: 'Design', color: SKY },
  // Never picked a colour: gets an automatic one.
  { id: 'g2', name: 'Structures', color: null },
];
const memberGroupById = new Map(groups.map((group) => [group.id, group]));
const groupMarkColorById = buildGroupMarkColorMap(groups);

const project = (id: string, name: string, ownerGroupId: string | null): Project => ({
  id,
  name,
  code: null,
  color: '#3b82f6',
  archived: false,
  customerId: null,
  ownerGroupId,
  status: null,
} as Project);

const projects = [
  project('p1', 'Riverside Tower', 'g1'),
  project('p2', 'Harbour Bridge', 'g2'),
  project('p3', 'Old Mill', null),
];

const teamDot = (teamName: string) => {
  const label = screen.getByText(teamName);
  const dot = label.parentElement?.querySelector('[data-color-dot]');
  if (!dot) throw new Error(`No colour dot beside ${teamName}`);
  return dot;
};

describe('team colour in the project list', () => {
  it('draws the owner team\'s dot in the colour the team picked', () => {
    render(
      <ProjectCardSidebar
        projects={projects}
        customerById={new Map()}
        memberGroupById={memberGroupById}
        groupMarkColorById={groupMarkColorById}
        milestones={[]}
        selectedProjectId={null}
        onSelectProject={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        nameSort="asc"
        onToggleNameSort={vi.fn()}
        canEdit
        onOpenProjectSettings={vi.fn()}
        onToggleProjectArchived={vi.fn()}
        onRequestDeleteProject={vi.fn()}
        sortedCustomers={[]}
        customerFilterIds={[]}
        customerFilterLabel="All customers"
        onToggleCustomerFilter={vi.fn()}
        onClearCustomerFilters={vi.fn()}
        groupByCustomer={false}
        onToggleGroupByCustomer={vi.fn()}
        groupedProjects={[]}
        memberGroups={groups}
        ownerGroupFilterIds={[]}
        ownerGroupFilterLabel=""
        onToggleOwnerGroupFilter={vi.fn()}
        onClearOwnerGroupFilters={vi.fn()}
        showArchived={false}
        onToggleShowArchived={vi.fn()}
        trackedProjectIdSet={new Set()}
        onToggleTrackedProject={vi.fn()}
      />,
    );

    expect(teamDot('Design')).toHaveStyle({ backgroundColor: toGroupMarkColor(SKY) });
    // The dot is decoration; the team's name is what gets read.
    expect(teamDot('Design')).toHaveAttribute('aria-hidden', 'true');

    // A team on automatic still gets a colour of its own, different from the
    // picked one.
    const automatic = groupMarkColorById.get('g2');
    expect(automatic).toBeTruthy();
    expect(automatic).not.toBe(toGroupMarkColor(SKY));
    expect(teamDot('Structures')).toHaveStyle({ backgroundColor: automatic });

    // No owner team, no dot.
    const orphan = screen.getByText('Old Mill').closest('li');
    expect(orphan?.querySelector('[data-color-dot]')).toBeNull();
  });

  it('shows the same team and colour in a phone row', () => {
    render(
      <ProjectsMobileList
        projects={projects}
        customerById={new Map()}
        memberGroupById={memberGroupById}
        groupMarkColorById={groupMarkColorById}
        milestones={[]}
        trackedProjectIdSet={new Set()}
        canEdit
        search=""
        onSearchChange={vi.fn()}
        activeFilterCount={0}
        onOpenFilters={vi.fn()}
        onOpenProject={vi.fn()}
        onToggleTracked={vi.fn()}
        onOpenSettings={vi.fn()}
        onToggleArchived={vi.fn()}
        onRequestDelete={vi.fn()}
        showArchived={false}
      />,
    );

    const row = screen.getByText('Riverside Tower').closest('button');
    // The team leads the line, so the dots form a column down the list.
    expect(row).toHaveTextContent('Riverside TowerDesign · No customer');
    expect(row?.querySelector('[data-color-dot]')).toHaveStyle({
      backgroundColor: toGroupMarkColor(SKY),
    });

    // A project without an owner team keeps its old one-line subtitle. The
    // project's own colour swatch is not a team dot.
    const orphanRow = screen.getByText('Old Mill').closest('button');
    expect(orphanRow).toHaveTextContent('No customer');
    expect(orphanRow?.querySelector('[data-color-dot]')).toBeNull();
  });
});
