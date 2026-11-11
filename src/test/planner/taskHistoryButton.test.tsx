import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskHistoryPage } from '@/infrastructure/tasks/taskHistoryRepository';
import type { TaskHistoryRow } from '@/shared/domain/taskHistory';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const mocks = vi.hoisted(() => ({ fetchTaskHistory: vi.fn(), isDemo: false }));
vi.mock('@/infrastructure/tasks/taskHistoryRepository', () => ({ fetchTaskHistory: mocks.fetchTaskHistory }));
vi.mock('@/features/demo/hooks/useIsDemo', () => ({ useIsDemo: () => mocks.isDemo }));

import { TaskHistoryButton } from '@/features/planner/components/TaskHistoryButton';

const at = (hour: number) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const moved: TaskHistoryRow = {
  id: 'h-dates',
  actor_id: 'boris',
  kind: 'dates',
  old_value: { start: '2026-03-02', end: '2026-03-04' },
  new_value: { start: '2026-03-09', end: '2026-03-09' },
  created_at: at(10),
};

const reassigned: TaskHistoryRow = {
  id: 'h-status',
  actor_id: null,
  kind: 'status',
  old_value: { v: 'open' },
  new_value: { v: 'gone' },
  created_at: at(9),
};

const page = (rows: TaskHistoryRow[], total = rows.length): TaskHistoryPage => ({
  rows,
  total,
  actorNames: { boris: 'Boris' },
});

const renderButton = (isMobile = false) => render(
  <TaskHistoryButton
    taskId="task-1"
    updatedAt="2026-03-10T10:00:00.000Z"
    label="Updated by Boris · today"
    isMobile={isMobile}
    statuses={[{ id: 'open', name: 'In progress' }]}
    projects={[]}
    assignees={[]}
  />,
);

describe('TaskHistoryButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemo = false;
  });

  it('loads nothing until the line is opened', () => {
    mocks.fetchTaskHistory.mockResolvedValue(page([moved]));
    renderButton();

    expect(screen.getByRole('button', { name: /Updated by Boris · today/ })).toBeInTheDocument();
    expect(mocks.fetchTaskHistory).not.toHaveBeenCalled();
  });

  it('shows who changed what in plain words', async () => {
    mocks.fetchTaskHistory.mockResolvedValue(page([moved, reassigned]));
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: /Updated by Boris/ }));

    expect(await screen.findByText('Boris moved the dates')).toBeInTheDocument();
    expect(screen.getByText(/2 Mar 2026 – 4 Mar 2026 → 9 Mar 2026 · 10:00|2 Mar – 4 Mar → 9 Mar · 10:00/)).toBeInTheDocument();
    // A removed account and a deleted status still read as a sentence.
    expect(screen.getByText('Someone changed the status')).toBeInTheDocument();
    expect(screen.getByText(/In progress → — · 09:00/)).toBeInTheDocument();
    expect(mocks.fetchTaskHistory).toHaveBeenCalledWith('task-1', 5);
  });

  it('offers the rest of a long history and loads it on request', async () => {
    mocks.fetchTaskHistory.mockResolvedValueOnce(page([moved], 8));
    mocks.fetchTaskHistory.mockResolvedValueOnce(page([moved, reassigned], 8));
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: /Updated by Boris/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Show 7 more' }));

    await waitFor(() => expect(mocks.fetchTaskHistory).toHaveBeenLastCalledWith('task-1', 50));
    expect(await screen.findByText('Someone changed the status')).toBeInTheDocument();
  });

  it('says so when there is nothing recorded or the list cannot be loaded', async () => {
    mocks.fetchTaskHistory.mockResolvedValueOnce(page([]));
    const first = renderButton();
    await userEvent.click(screen.getByRole('button', { name: /Updated by Boris/ }));
    expect(await screen.findByText('No changes recorded yet')).toBeInTheDocument();
    first.unmount();

    mocks.fetchTaskHistory.mockRejectedValueOnce(new Error('offline'));
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: /Updated by Boris/ }));
    expect(await screen.findByText("Couldn't load the history")).toBeInTheDocument();
  });

  it('opens as a sheet on a phone', async () => {
    mocks.fetchTaskHistory.mockResolvedValue(page([moved]));
    renderButton(true);

    await userEvent.click(screen.getByRole('button', { name: /Updated by Boris/ }));

    expect(await screen.findByRole('dialog', { name: 'Change history' })).toBeInTheDocument();
    expect(await screen.findByText('Boris moved the dates')).toBeInTheDocument();
  });

  it('stays plain text in the sandbox', () => {
    mocks.isDemo = true;
    renderButton();

    expect(screen.getByText('Updated by Boris · today')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
