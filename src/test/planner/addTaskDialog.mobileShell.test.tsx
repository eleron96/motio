import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const mocks = vi.hoisted(() => ({
  isMobile: true,
  addTask: vi.fn(async () => ({ error: undefined })),
  projects: [
    { id: 'p1', name: 'Brand Refresh', code: 'BR', color: '#aabbcc', archived: false },
    { id: 'p2', name: 'Data Migration', code: 'DM', color: '#ccbbaa', archived: false },
    { id: 'p3', name: 'DevOps Pipeline', code: 'DP', color: '#123456', archived: false },
    { id: 'p4', name: 'Analytics Dashboard', code: 'AD', color: '#654321', archived: false },
    { id: 'p5', name: 'Customer Onboarding', code: 'CO', color: '#222222', archived: false },
    { id: 'p6', name: 'Mobile App', code: 'MA', color: '#333333', archived: false },
    { id: 'p7', name: 'Website Redesign', code: 'WR', color: '#444444', archived: false },
  ],
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => mocks.isMobile,
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      projects: mocks.projects,
      trackedProjectIds: [],
      assignees: [],
      statuses: [{ id: 's1', name: 'To do', isFinal: false, isCancelled: false }],
      taskTypes: [{ id: 't1', name: 'Task' }],
      tags: [],
      groupMode: 'assignee',
      addTask: mocks.addTask,
      createRepeats: vi.fn(),
      createTaskSubtasks: vi.fn(),
      timeOff: [],
      addTimeOff: vi.fn(),
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      currentWorkspaceId: 'w1',
      user: { id: 'u1', email: 'me@example.com' },
      currentWorkspaceRole: 'admin',
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/features/planner/hooks/useFilteredAssignees', () => ({
  useFilteredAssignees: (assignees: unknown[]) => assignees,
}));

vi.mock('@/features/planner/components/RichTextEditor', () => ({
  RichTextEditor: () => <div>editor</div>,
}));

import { AddTaskDialog } from '@/features/planner/components/AddTaskDialog';

describe('AddTaskDialog on mobile', () => {
  beforeEach(() => {
    mocks.isMobile = true;
    mocks.addTask.mockClear();
  });

  it('renders as a full-screen screen with a back affordance instead of a centred card', () => {
    render(<AddTaskDialog open onOpenChange={vi.fn()} />);

    const screenEl = screen.getByRole('dialog');
    // Bottom-anchored to the visual viewport — a centred card would drift under
    // the keyboard, and a top anchor would still lose the header to an iOS
    // visual-viewport shift.
    expect(screenEl.className).toContain('inset-x-0');
    expect(screenEl.className).not.toContain('translate-y-[-50%]');
    expect(screenEl.style.bottom).toBeTruthy();
    expect(screenEl.style.height).toBeTruthy();
    expect(within(screenEl).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(within(screenEl).getByRole('button', { name: /Create task/ })).toBeInTheDocument();
  });

  it('picks a project through a scrollable full-screen list', async () => {
    const user = userEvent.setup();
    render(<AddTaskDialog open onOpenChange={vi.fn()} />);

    // The trigger shows the current value; tapping it opens a screen, not a popup.
    await user.click(screen.getByRole('button', { name: /No project/ }));

    const picker = await screen.findByRole('dialog', { name: 'Project' });
    expect(within(picker).getByRole('button', { name: /Data Migration/ })).toBeInTheDocument();

    await user.click(within(picker).getByRole('button', { name: /Data Migration/ }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Project' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Data Migration/ })).toBeInTheDocument();
  });

  it('submits from the pinned footer even though the button sits outside the form', async () => {
    const user = userEvent.setup();
    render(<AddTaskDialog open onOpenChange={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Enter task title/), 'Ship it');
    await user.click(screen.getByRole('button', { name: /Create task/ }));

    await waitFor(() => {
      expect(mocks.addTask).toHaveBeenCalledTimes(1);
    });
  });

  it('guards an edited draft when Back is tapped', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddTaskDialog open onOpenChange={onOpenChange} />);

    await user.type(screen.getByPlaceholderText(/Enter task title/), 'Half-written');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    // The draft is not dropped silently — the discard confirmation appears.
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('keeps the desktop dialog on wide screens', () => {
    mocks.isMobile = false;
    render(<AddTaskDialog open onOpenChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    // Desktop keeps the Radix Select triggers (project, status, type, priority).
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });
});
