import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupColorScreen } from '@/features/members/components/GroupColorScreen';
import { GROUP_PRESET_COLORS, toGroupMarkColor } from '@/shared/domain/groupColor';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const SKY = '#6fbfe2';

const renderScreen = (overrides: Partial<React.ComponentProps<typeof GroupColorScreen>> = {}) => {
  const props: React.ComponentProps<typeof GroupColorScreen> = {
    open: true,
    onOpenChange: vi.fn(),
    groupName: 'Backend',
    color: SKY,
    hasOwnColor: true,
    onSelect: vi.fn(),
    ...overrides,
  };
  return { ...render(<GroupColorScreen {...props} />), props };
};

describe('GroupColorScreen', () => {
  it('offers every palette colour, drawn in the tone the dot will have', () => {
    renderScreen();

    const swatches = GROUP_PRESET_COLORS.map((color) => screen.getByTestId(`group-color-${color}`));
    expect(swatches).toHaveLength(20);
    expect(swatches[0].firstElementChild).toHaveStyle({
      backgroundColor: toGroupMarkColor(GROUP_PRESET_COLORS[0]),
    });
    // Every swatch is a button a screen reader can name.
    expect(screen.getByRole('button', { name: 'Colour 1' })).toBe(swatches[0]);
  });

  it('marks the picked colour and nothing else', () => {
    renderScreen();

    expect(screen.getByTestId(`group-color-${SKY}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Automatic colour' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves the stored colour, not the drawn tone, and closes', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen();
    const amber = '#deb373';

    await user.click(screen.getByTestId(`group-color-${amber}`));

    expect(props.onSelect).toHaveBeenCalledWith(amber);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('hands the group back to the automatic colour', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Automatic colour' }));

    expect(props.onSelect).toHaveBeenCalledWith(null);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ticks "Automatic colour" for a group that never picked a colour', () => {
    // `color` is still set: it is the automatic colour in effect.
    renderScreen({ hasOwnColor: false });

    expect(screen.getByRole('button', { name: 'Automatic colour' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(`group-color-${SKY}`)).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores taps while a change is being saved', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen({ loading: true });

    await user.click(screen.getByTestId(`group-color-${GROUP_PRESET_COLORS[3]}`));

    expect(props.onSelect).not.toHaveBeenCalled();
  });
});
