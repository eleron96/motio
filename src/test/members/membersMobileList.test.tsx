import React from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MembersMobileList } from '@/features/members/components/MembersMobileList';
import type { Assignee } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const ANNA_PHOTO = 'https://cdn.example/avatars/anna.png';

const anna = { id: 'a1', userId: 'u1', name: 'Anna', isActive: true, avatar: ANNA_PHOTO } as Assignee;
const nina = { id: 'a3', userId: 'u3', name: 'Nina', isActive: true } as Assignee;
const external = { id: 'a4', userId: null, name: 'External Ed', isActive: true } as Assignee;
const boris = { id: 'a2', userId: 'u2', name: 'Boris', isActive: false } as Assignee;

const renderScreen = (overrides: Partial<React.ComponentProps<typeof MembersMobileList>> = {}) => {
  const props: React.ComponentProps<typeof MembersMobileList> = {
    mode: 'tasks',
    isAdmin: true,
    groupActionLoading: false,
    tab: 'active',
    onTabChange: vi.fn(),
    memberSearch: '',
    onMemberSearchChange: vi.fn(),
    activeVisibleAssignees: [anna, nina, external],
    disabledVisibleAssignees: [boris],
    onOpenAssignee: vi.fn(),
    memberTaskCounts: { a1: 3 },
    memberTaskCountsDate: '2026-08-07',
    groupIdByUserId: new Map<string, string | null>([['u1', null], ['u3', 'g1']]),
    groupNameById: new Map([['g1', 'Backend']]),
    onAssignAssigneeGroup: vi.fn(),
    onClearAssigneeGroup: vi.fn(),
    groupSearch: '',
    onGroupSearchChange: vi.fn(),
    sortedGroups: [{ id: 'g1', name: 'Backend' }, { id: 'g2', name: 'Frontend' }],
    groupsLoading: false,
    groupsError: '',
    onOpenGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onDeleteGroup: vi.fn(),
    ...overrides,
  };

  return { ...render(<MembersMobileList {...props} />), props };
};

// jsdom never loads an image, and Radix Avatar only swaps the initials for the
// photo once the image reports itself loaded — so every image here says it is.
const imageProto = HTMLImageElement.prototype;
const originalComplete = Object.getOwnPropertyDescriptor(imageProto, 'complete');
const originalNaturalWidth = Object.getOwnPropertyDescriptor(imageProto, 'naturalWidth');

beforeAll(() => {
  Object.defineProperty(imageProto, 'complete', { configurable: true, get: () => true });
  Object.defineProperty(imageProto, 'naturalWidth', { configurable: true, get: () => 64 });
});

afterAll(() => {
  if (originalComplete) Object.defineProperty(imageProto, 'complete', originalComplete);
  if (originalNaturalWidth) Object.defineProperty(imageProto, 'naturalWidth', originalNaturalWidth);
});

const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('button');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
};

describe('MembersMobileList', () => {
  it('walks into a person when their row is tapped', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen();

    await user.click(screen.getByText('Anna'));

    expect(props.onOpenAssignee).toHaveBeenCalledWith('a1');
  });

  it('walks into a group when its row is tapped', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen({ mode: 'groups' });

    await user.click(screen.getByText('Frontend'));

    expect(props.onOpenGroup).toHaveBeenCalledWith('g2');
  });

  it('lists people with their group and offers the row actions', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen();

    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('No group')).toBeInTheDocument();

    // Anna comes first in the list, so hers is the first menu.
    await user.click(screen.getAllByRole('button', { name: 'Member actions' })[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Assign a group' }));

    expect(props.onAssignAssigneeGroup).toHaveBeenCalledWith(anna);
  });

  it('leaves people without an account without a menu', () => {
    renderScreen();

    // Anna and Nina have accounts; Ed does not, so only two menus exist.
    expect(screen.getAllByRole('button', { name: 'Member actions' })).toHaveLength(2);
    expect(screen.getByText('External Ed')).toBeInTheDocument();
  });

  it('shows the disabled list when that tab is chosen', () => {
    renderScreen({ tab: 'disabled' });

    expect(screen.getByText('Boris')).toBeInTheDocument();
    expect(screen.queryByText('Anna')).not.toBeInTheDocument();
  });

  it('leads a person\'s row with their photo, kept out of the spoken name', () => {
    renderScreen();

    const avatar = within(rowOf('Anna')).getByTestId('member-avatar');
    expect(avatar.querySelector('img')).toHaveAttribute('src', ANNA_PHOTO);
    // The name is already in the row; the avatar must not say it a second time.
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).not.toHaveClass('grayscale');
  });

  it('falls back to initials for someone without a photo', () => {
    renderScreen();

    // An external person has no account, so no photo can ever exist for them.
    const avatar = within(rowOf('External Ed')).getByTestId('member-avatar');
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar).toHaveTextContent('EE');
  });

  it('greys out the avatars on the disabled list', () => {
    renderScreen({ tab: 'disabled' });

    expect(within(rowOf('Boris')).getByTestId('member-avatar')).toHaveClass('grayscale');
  });

  it('draws no avatars on the groups list', () => {
    renderScreen({ mode: 'groups' });

    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.queryByTestId('member-avatar')).not.toBeInTheDocument();
  });

  it('reaches renaming and deleting a group, which a phone cannot right-click to', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen({ mode: 'groups' });

    expect(screen.getByText('Frontend')).toBeInTheDocument();

    const menus = screen.getAllByRole('button', { name: 'Group actions' });
    await user.click(menus[0]);

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    expect(props.onDeleteGroup).toHaveBeenCalledWith({ id: 'g1', name: 'Backend' });
  });
});
