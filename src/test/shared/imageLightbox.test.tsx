import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { RichTextEditor } from '@/features/planner/components/RichTextEditor';
import {
  LAYER_ABOVE_MODAL_CLASS,
  LAYER_BASE,
  LAYER_STEP,
  MODAL_LAYER_VAR,
  resetScreenLayers,
} from '@/shared/ui/layers';
import { MobileFormScreen } from '@/shared/ui/mobile-form-screen';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  uploadTaskMedia: vi.fn(),
}));

const IMAGE_SRC = 'https://motio.example/functions/v1/task-media/m1?token=abc';
const DESCRIPTION = `<p>Steps</p><p><img src="${IMAGE_SRC}" alt="Screenshot" style="width:300px;height:auto;"></p>`;

/**
 * The task card is a dialog; the description editor sits inside it. Every way
 * of closing the picture must leave that card open.
 */
const renderTaskCard = ({ disabled = false } = {}) => {
  const onTaskOpenChange = vi.fn();
  render(
    <Dialog open onOpenChange={onTaskOpenChange}>
      <DialogContent>
        <DialogTitle>Task</DialogTitle>
        <DialogDescription>Task details</DialogDescription>
        <RichTextEditor id="description" value={DESCRIPTION} onChange={vi.fn()} disabled={disabled} />
      </DialogContent>
    </Dialog>,
  );
  const editor = document.getElementById('description') as HTMLDivElement;
  const image = editor.querySelector('img') as HTMLImageElement;
  return { onTaskOpenChange, editor, image };
};

const lightbox = () => screen.queryByTestId('image-lightbox');

const openLightbox = (image: HTMLImageElement) => {
  fireEvent.click(image);
  const node = lightbox();
  expect(node).not.toBeNull();
  return node as HTMLElement;
};

/** The layer overlays open on now: --layer-modal on <body>, 50 by default. */
const currentModalLayer = () => Number(document.body.style.getPropertyValue(MODAL_LAYER_VAR) || LAYER_BASE);

/** The lightbox sits one step above that layer (its class, resolved by hand: jsdom has no CSS). */
const lightboxLayer = (node: HTMLElement) => {
  expect(node.className).toContain(LAYER_ABOVE_MODAL_CLASS);
  return currentModalLayer() + LAYER_STEP;
};

describe('ImageLightbox from the task description', () => {
  afterEach(() => {
    resetScreenLayers();
  });

  it('opens the clicked picture, editable or read-only', () => {
    const { image } = renderTaskCard();
    const node = openLightbox(image);
    const shown = node.querySelector('img') as HTMLImageElement;
    expect(shown.src).toBe(IMAGE_SRC);
    expect(shown.alt).toBe('Screenshot');
  });

  it('opens in a read-only description too', () => {
    const { image } = renderTaskCard({ disabled: true });
    openLightbox(image);
  });

  it('leaves text clicks and shift-clicks to the editor', () => {
    const { editor, image } = renderTaskCard();
    fireEvent.click(editor.querySelector('p') as HTMLElement);
    fireEvent.click(image, { shiftKey: true });
    expect(lightbox()).toBeNull();
  });

  it('Escape closes the picture, not the task', async () => {
    const { onTaskOpenChange, editor, image } = renderTaskCard();
    const node = openLightbox(image);
    fireEvent.keyDown(node, { key: 'Escape' });
    await waitFor(() => expect(lightbox()).toBeNull());
    expect(onTaskOpenChange).not.toHaveBeenCalled();
    expect(editor).toBeInTheDocument();
  });

  it('the close button and a click beside the picture return to the task', async () => {
    const { onTaskOpenChange, image } = renderTaskCard();
    openLightbox(image);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(lightbox()).toBeNull());

    const node = openLightbox(image);
    const stage = (node.querySelector('img') as HTMLImageElement).parentElement as HTMLElement;
    // A press on the picture itself is not a click "beside" it.
    fireEvent.pointerDown(node.querySelector('img') as HTMLImageElement, { pointerId: 1 });
    fireEvent.pointerUp(node.querySelector('img') as HTMLImageElement, { pointerId: 1 });
    fireEvent.click(node.querySelector('img') as HTMLImageElement);
    expect(lightbox()).not.toBeNull();

    fireEvent.pointerDown(stage, { pointerId: 2 });
    fireEvent.pointerUp(stage, { pointerId: 2 });
    fireEvent.click(stage);
    await waitFor(() => expect(lightbox()).toBeNull());
    expect(onTaskOpenChange).not.toHaveBeenCalled();
  });

  it('browser Back closes the picture and keeps the task open', async () => {
    const { onTaskOpenChange, image } = renderTaskCard();
    const lengthBefore = window.history.length;
    openLightbox(image);
    expect(window.history.length).toBe(lengthBefore + 1);

    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(lightbox()).toBeNull());
    expect(onTaskOpenChange).not.toHaveBeenCalled();
  });

  it('closing from inside drops the history entry it added', async () => {
    const { image } = renderTaskCard();
    const stateBefore = window.history.state;
    const node = openLightbox(image);
    expect(window.history.state).not.toEqual(stateBefore);
    fireEvent.keyDown(node, { key: 'Escape' });
    await waitFor(() => expect(window.history.state).toEqual(stateBefore));
  });

  it('zoom buttons step the scale up and back to fitted', async () => {
    const { image } = renderTaskCard();
    const node = openLightbox(image);
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    expect(zoomOut).toBeDisabled();
    fireEvent.click(zoomIn);
    const shown = node.querySelector('img') as HTMLImageElement;
    expect(shown.style.transform).toContain('scale(1.5)');
    expect(zoomOut).not.toBeDisabled();
    fireEvent.click(zoomOut);
    expect(shown.style.transform).toContain('scale(1)');
  });

  it('wheel events that arrive within one frame all count', () => {
    const { image } = renderTaskCard();
    const node = openLightbox(image);
    const shown = node.querySelector('img') as HTMLImageElement;
    const stage = shown.parentElement as HTMLElement;
    act(() => {
      stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    });
    const scale = Number(/scale\(([\d.]+)\)/.exec(shown.style.transform)?.[1]);
    expect(scale).toBeCloseTo(Math.exp(0.8), 3);
  });

  it('on a desktop it opens above the task card without lifting the card', () => {
    const { image } = renderTaskCard();
    const before = currentModalLayer();
    const node = openLightbox(image);

    // The desktop card reads --layer-modal: raising it put the card above the picture.
    expect(currentModalLayer()).toBe(before);
    expect(lightboxLayer(node)).toBeGreaterThan(before);
  });

  it('on a phone it opens above the full-screen task and Back returns to it', async () => {
    const onTaskOpenChange = vi.fn();
    render(
      <MobileFormScreen open onOpenChange={onTaskOpenChange} title="Task details">
        <RichTextEditor id="description" value={DESCRIPTION} onChange={vi.fn()} />
      </MobileFormScreen>,
    );
    const image = (document.getElementById('description') as HTMLDivElement).querySelector('img') as HTMLImageElement;
    const node = openLightbox(image);
    const screenLayer = Number((screen.getByText('Task details').closest('[role="dialog"]') as HTMLElement).style.zIndex);
    expect(lightboxLayer(node)).toBeGreaterThan(screenLayer);

    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(lightbox()).toBeNull());
    expect(onTaskOpenChange).not.toHaveBeenCalled();
  });
});
