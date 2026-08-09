import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactDetailsMobileScreen } from '@/features/projects/components/ContactDetailsMobileScreen';
import type { ContactEntry } from '@/features/projects/lib/contactList';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const entry = {
  key: 'c1',
  name: 'Anna Petrova',
  role: 'BIM manager',
  company: 'Acme',
  tag: 'Partner',
  email: 'anna@example.com',
  phone: '+7 900 000-00-00',
  source: { kind: 'contact', id: 'c1' },
} as ContactEntry;

const renderScreen = (
  overrides: Partial<React.ComponentProps<typeof ContactDetailsMobileScreen>> = {},
) => {
  const props: React.ComponentProps<typeof ContactDetailsMobileScreen> = {
    entry,
    onOpenChange: vi.fn(),
    projects: [],
    canEdit: true,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<ContactDetailsMobileScreen {...props} />), props };
};

describe('ContactDetailsMobileScreen', () => {
  // userEvent installs its own clipboard stub, so the assertions read the
  // clipboard back rather than spying on a mock that gets replaced.
  it('copies the name, the email and the phone on tap', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Copy name' }));
    expect(await navigator.clipboard.readText()).toBe('Anna Petrova');

    await user.click(screen.getByRole('button', { name: 'Copy email' }));
    expect(await navigator.clipboard.readText()).toBe('anna@example.com');

    await user.click(screen.getByRole('button', { name: 'Copy phone' }));
    expect(await navigator.clipboard.readText()).toBe('+7 900 000-00-00');
  });

  it('says what happened after copying', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Copy email' }));

    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('still offers mail and call beside the copy rows', () => {
    renderScreen();

    // Links, not buttons inside buttons: the row itself already copies.
    expect(screen.getByRole('link', { name: 'Write an email' })).toHaveAttribute(
      'href',
      'mailto:anna@example.com',
    );
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute(
      'href',
      'tel:+7 900 000-00-00',
    );
  });

  it('keeps editing and deleting behind the header menu', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Contact actions' }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit' }));

    expect(props.onEdit).toHaveBeenCalledWith(entry);
  });
});
