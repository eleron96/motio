import { describe, expect, it } from 'vitest';
import { Milestone, Project } from '@/features/planner/types/planner';
import {
  buildMilestoneTooltipCells,
  buildVisibleDayIndexMap,
  buildVisibleMilestoneLines,
  calculateMilestoneOffsets,
  filterMilestonesByProjects,
  groupMilestonesByDate,
  sortMilestonesByDateAndTitle,
} from '@/features/planner/lib/timelineMilestoneSelectors';

const makeProject = (overrides: Partial<Project>): Project => ({
  id: 'project-id',
  name: 'Project',
  code: null,
  color: '#000000',
  archived: false,
  customerId: null,
  ...overrides,
});

const makeMilestone = (overrides: Partial<Milestone>): Milestone => ({
  id: 'milestone-id',
  title: 'Milestone',
  projectId: 'project-id',
  date: '2026-02-24',
  ...overrides,
});

describe('timelineMilestoneSelectors', () => {
  it('filters and sorts milestones by date and title', () => {
    const milestones = [
      makeMilestone({ id: 'm1', title: 'B', projectId: 'p1', date: '2026-02-25' }),
      makeMilestone({ id: 'm2', title: 'A', projectId: 'p1', date: '2026-02-25' }),
      makeMilestone({ id: 'm3', title: 'C', projectId: 'p2', date: '2026-02-24' }),
    ];

    const filtered = filterMilestonesByProjects(milestones, ['p1']);
    expect(filtered.map((milestone) => milestone.id)).toEqual(['m1', 'm2']);

    const sorted = sortMilestonesByDateAndTitle(milestones);
    expect(sorted.map((milestone) => milestone.id)).toEqual(['m3', 'm2', 'm1']);
  });

  it('builds grouped milestones and deterministic horizontal offsets', () => {
    const milestones = [
      makeMilestone({ id: 'm1', date: '2026-02-24' }),
      makeMilestone({ id: 'm2', date: '2026-02-24' }),
      makeMilestone({ id: 'm3', date: '2026-02-25' }),
    ];

    const byDate = groupMilestonesByDate(milestones);
    expect(byDate.get('2026-02-24')?.map((milestone) => milestone.id)).toEqual(['m1', 'm2']);

    const offsets = calculateMilestoneOffsets(byDate);
    expect(offsets.get('m1')).toBe(-4);
    expect(offsets.get('m2')).toBe(4);
    expect(offsets.get('m3')).toBe(0);
  });

  it('builds visible day index, milestone lines and tooltip cells', () => {
    const visibleDays = [
      new Date(2026, 1, 24),
      new Date(2026, 1, 25),
    ];
    const visibleDayIndex = buildVisibleDayIndexMap(visibleDays);
    expect(visibleDayIndex.get('2026-02-24')).toBe(0);
    expect(visibleDayIndex.get('2026-02-25')).toBe(1);

    const projects = [
      makeProject({ id: 'p1', color: '#111111' }),
      makeProject({ id: 'p2', color: '#222222' }),
    ];
    const projectById = new Map(projects.map((project) => [project.id, project]));

    const milestones = [
      makeMilestone({ id: 'm1', projectId: 'p1', date: '2026-02-24' }),
      makeMilestone({ id: 'm2', projectId: 'p2', date: '2026-02-24' }),
      makeMilestone({ id: 'm3', projectId: 'missing', date: '2026-02-25' }),
      makeMilestone({ id: 'm4', projectId: 'p1', date: '2026-02-28' }),
    ];

    const lines = buildVisibleMilestoneLines({
      milestones,
      visibleDayIndex,
      projectById,
      defaultColor: '#94a3b8',
    });
    expect(lines).toEqual([
      { date: '2026-02-24', color: '#111111' },
      { date: '2026-02-25', color: '#94a3b8' },
    ]);

    const byDate = groupMilestonesByDate(milestones);
    const cells = buildMilestoneTooltipCells({
      milestonesByDate: byDate,
      visibleDayIndex,
      projectById,
      defaultColor: '#94a3b8',
    });

    expect(cells.map((cell) => cell.date)).toEqual(['2026-02-24', '2026-02-25']);
    expect(cells[0].milestones.map((milestone) => milestone.id)).toEqual(['m1', 'm2']);
    expect(cells[1].color).toBe('#94a3b8');
  });
});
