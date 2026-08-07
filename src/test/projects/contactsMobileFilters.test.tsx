import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsMobileFiltersScreen } from '@/features/projects/components/ContactsMobileFiltersScreen';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const companies = [
  { key: 'acme', label: 'Acme', count: 4 },
  { key: 'blue-orbit', label: 'Blue Orbit', count: 2 },
  { key: '', label: null, count: 1 },
];
const tags = [{ key: 'partner', label: 'Partner', count: 3 }];
const roles = [{ key: 'bim', label: 'BIM manager', count: 1 }];

const renderScreen = (
  overrides: Partial<React.ComponentProps<typeof ContactsMobileFiltersScreen>> = {},
) => {
  const props: React.ComponentProps<typeof ContactsMobileFiltersScreen> = {
    open: true,
    onOpenChange: vi.fn(),
    companies,
    companyKeys: [],
    onCompanyKeysChange: vi.fn(),
    tags,
    tagKeys: [],
    onTagKeysChange: vi.fn(),
    roles,
    roleKeys: [],
    onRoleKeysChange: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  };
  return { ...render(<ContactsMobileFiltersScreen {...props} />), props };
};

describe('ContactsMobileFiltersScreen', () => {
  it('lists the three categories rather than every value at once', () => {
    renderScreen();

    const menu = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(menu).getByRole('button', { name: /Company/ })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: /Tag/ })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: /Role/ })).toBeInTheDocument();
    // Values live behind their category, not stacked on this screen.
    expect(within(menu).queryByText('Acme')).not.toBeInTheDocument();
  });

  it('opens a category with a search box and reports the pick', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen();

    await user.click(screen.getByRole('button', { name: /Company/ }));

    const picker = await screen.findByRole('dialog', { name: 'Company' });
    await user.type(within(picker).getByPlaceholderText('Search companies...'), 'blue');
    expect(within(picker).queryByRole('checkbox', { name: /Acme/ })).not.toBeInTheDocument();

    await user.click(within(picker).getByRole('checkbox', { name: /Blue Orbit/ }));

    expect(props.onCompanyKeysChange).toHaveBeenCalledWith(['blue-orbit']);
  });

  it('summarises what is chosen in each category', () => {
    renderScreen({ companyKeys: ['acme'], tagKeys: ['partner'], roleKeys: [] });

    const menu = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(menu).getByRole('button', { name: /Company/ })).toHaveTextContent('Acme');
    expect(within(menu).getByRole('button', { name: /Role/ })).toHaveTextContent('All');
  });
});
