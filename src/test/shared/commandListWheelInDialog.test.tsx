import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Command, CommandGroup, CommandItem, CommandList } from '@/shared/ui/command';

/**
 * A modal Dialog locks page scroll by cancelling every wheel event that lands
 * outside its own content. A Popover list is portalled to <body>, i.e. outside
 * the dialog, so without a guard the mouse wheel cannot scroll it (holiday
 * country picker in workspace settings). The list must keep its wheel events.
 */
const renderListInDialog = () => render(
  <Dialog open>
    <DialogContent>
      <DialogTitle>Settings</DialogTitle>
      <DialogDescription>Workspace settings</DialogDescription>
      <Popover open>
        <PopoverTrigger>Country</PopoverTrigger>
        <PopoverContent>
          <Command>
            <CommandList>
              <CommandGroup>
                {['Austria', 'Belgium', 'Germany'].map((name) => (
                  <CommandItem key={name}>{name}</CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </DialogContent>
  </Dialog>,
);

describe('CommandList inside a modal dialog', () => {
  it('lets the mouse wheel scroll a portalled list', () => {
    renderListInDialog();

    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
    screen.getByText('Germany').dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
  });
});
