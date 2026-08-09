import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const OPTIONS: MobilePickerOption[] = [
  { value: 'none', label: 'No project' },
  { value: 'a', label: 'Brand Refresh', searchText: 'Brand Refresh BR' },
  { value: 'b', label: 'Data Migration', searchText: 'Data Migration DM' },
  { value: 'c', label: 'Archived one', note: '(Archived)', searchText: 'Archived one' },
];

const Harness: React.FC<{ searchable?: boolean; onPick?: (value: string) => void }> = ({
  searchable,
  onPick,
}) => {
  const [open, setOpen] = React.useState(true);
  const [value, setValue] = React.useState('none');
  return (
    <MobilePickerScreen
      open={open}
      onOpenChange={setOpen}
      title="Project"
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onPick?.(next);
      }}
      searchable={searchable}
    />
  );
};

describe('MobilePickerScreen', () => {
  it('lists every option in a plain scrollable list', () => {
    render(<Harness />);

    OPTIONS.forEach((option) => {
      expect(screen.getByRole('button', { name: new RegExp(String(option.label)) })).toBeInTheDocument();
    });
    // The list is a real scroller, not a Radix Select viewport with arrow buttons.
    const list = screen.getByText('Brand Refresh').closest('div.overflow-y-auto');
    expect(list).not.toBeNull();
  });

  it('picks an option and closes', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    await user.click(screen.getByRole('button', { name: /Data Migration/ }));

    expect(onPick).toHaveBeenCalledWith('b');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('filters by the search box when searchable', async () => {
    const user = userEvent.setup();
    render(<Harness searchable />);

    await user.type(screen.getByRole('textbox'), 'migra');

    expect(screen.getByRole('button', { name: /Data Migration/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Brand Refresh/ })).not.toBeInTheDocument();
  });

  it('closes with the back button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
