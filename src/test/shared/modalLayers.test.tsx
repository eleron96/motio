import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { LAYER_BASE, resetScreenLayers } from '@/shared/ui/layers';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

/**
 * What the browser would paint this element at. jsdom applies no Tailwind, so
 * the class is read the way the stylesheet would: a literal `z-50`, or the
 * `--layer-modal` custom property the layer stack drives. Resolving it here is
 * what lets the test compare a sheet against the screen it opened from — the
 * exact comparison that was wrong when every «+» on the mobile project card
 * opened its form *behind* the card.
 */
const paintedZIndex = (element: HTMLElement): number => {
  if (element.style.zIndex) return Number(element.style.zIndex);

  const modalLayer = Number(document.body.style.getPropertyValue('--layer-modal') || LAYER_BASE);
  for (const token of element.className.split(/\s+/)) {
    if (token === 'z-[var(--layer-modal)]') return modalLayer;
    if (token === 'z-[calc(var(--layer-modal)_+_10)]') return modalLayer + 10;
    const literal = /^z-(?:\[)?(\d+)\]?$/.exec(token);
    if (literal) return Number(literal[1]);
  }
  throw new Error(`no z-index on ${element.className}`);
};

const currentModalLayer = (): number => (
  Number(document.body.style.getPropertyValue('--layer-modal') || LAYER_BASE)
);

/**
 * The layer under test is the one Radix has just hidden from the a11y tree: a
 * modal marks everything below it `aria-hidden`, so `getByRole` cannot reach
 * the screen a sheet was opened from. Go through the title instead.
 */
const layerNamed = (title: string): HTMLElement => {
  const surface = screen
    .getAllByText(title)
    .map((node) => node.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
    .find((node): node is HTMLElement => node !== null);
  if (!surface) throw new Error(`no dialog titled ${title}`);
  return surface;
};

afterEach(() => {
  resetScreenLayers();
});

describe('modal layering', () => {
  it('an open full-screen screen sits above the plain overlay layer', () => {
    render(
      <MobileScreenShell open onOpenChange={() => {}} title="Project">
        <p>Card</p>
      </MobileScreenShell>,
    );

    expect(paintedZIndex(layerNamed('Project'))).toBeGreaterThan(LAYER_BASE);
    expect(currentModalLayer()).toBeGreaterThan(paintedZIndex(layerNamed('Project')));
  });

  it('a sheet opened from inside that screen paints above it', () => {
    render(
      <MobileScreenShell open onOpenChange={() => {}} title="Project">
        <Sheet open>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Add comment</SheetTitle>
              <SheetDescription>Comment body</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </MobileScreenShell>,
    );

    const project = paintedZIndex(layerNamed('Project'));
    const sheet = paintedZIndex(layerNamed('Add comment'));

    expect(sheet).toBeGreaterThan(project);
  });

  it('an alert dialog clears the sheet that raised it', () => {
    render(
      <MobileScreenShell open onOpenChange={() => {}} title="Project">
        <Sheet open>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Edit member</SheetTitle>
              <SheetDescription>Member form</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Unsaved edits will be lost.</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      </MobileScreenShell>,
    );

    const sheet = paintedZIndex(layerNamed('Edit member'));
    const alert = paintedZIndex(layerNamed('Discard changes?'));

    expect(alert).toBeGreaterThan(sheet);
  });

  it('screens stack: a second screen and its overlays clear the first', () => {
    render(
      <MobileScreenShell open onOpenChange={() => {}} title="Project">
        <MobileScreenShell open onOpenChange={() => {}} title="Filters">
          <p>Filters</p>
        </MobileScreenShell>
      </MobileScreenShell>,
    );

    const project = paintedZIndex(layerNamed('Project'));
    const filters = paintedZIndex(layerNamed('Filters'));

    expect(filters).toBeGreaterThan(project);
    expect(currentModalLayer()).toBeGreaterThan(filters);
  });

  it('closing the last screen hands the base layer back', () => {
    const { rerender } = render(
      <MobileScreenShell open onOpenChange={() => {}} title="Project">
        <p>Card</p>
      </MobileScreenShell>,
    );

    expect(currentModalLayer()).toBeGreaterThan(LAYER_BASE);

    rerender(
      <MobileScreenShell open={false} onOpenChange={() => {}} title="Project">
        <p>Card</p>
      </MobileScreenShell>,
    );

    expect(currentModalLayer()).toBe(LAYER_BASE);
  });
});
