import React, { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  buildTaskMediaUrl: (image: { id: string; token: string }) => `https://motio.example/functions/v1/task-media/${image.id}?token=${image.token}`,
  uploadTaskMediaFile: vi.fn(),
}));

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

import { SubtasksSection } from '@/features/planner/components/SubtasksSection';
import { SubtaskImagesController } from '@/features/planner/hooks/useSubtaskImages';
import { TaskSubtask } from '@/features/planner/types/planner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { resetScreenLayers } from '@/shared/ui/layers';

const subtask: TaskSubtask = {
  id: 'subtask-1',
  taskId: 'task-1',
  title: 'Photo of the crack',
  isDone: false,
  doneAt: null,
  position: 0,
  images: [{ id: 'm1', token: 't1' }],
};

const makeImages = (overrides: Partial<SubtaskImagesController> = {}): SubtaskImagesController => ({
  canAttach: true,
  draftImages: [],
  uploading: {},
  resolveSrc: (image) => `https://motio.example/functions/v1/task-media/${image.id}?token=${image.token}`,
  attach: vi.fn(),
  remove: vi.fn(),
  discardDraftImages: vi.fn(),
  ...overrides,
});

const Harness: React.FC<{
  images: SubtaskImagesController;
  isReadOnly?: boolean;
  onTaskOpenChange?: (open: boolean) => void;
}> = ({ images, isReadOnly = false, onTaskOpenChange = vi.fn() }) => {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <Dialog open onOpenChange={onTaskOpenChange}>
      <DialogContent>
        <DialogTitle>Task</DialogTitle>
        <DialogDescription>Task details</DialogDescription>
        <SubtasksSection
          isReadOnly={isReadOnly}
          subtasksOpen
          subtasksLoading={false}
          subtasksSaving={false}
          subtasksError=""
          subtasks={[subtask]}
          newSubtaskTitle={newSubtaskTitle}
          completedSubtasksCount={0}
          subtaskInputRef={subtaskInputRef}
          onOpen={vi.fn()}
          onNewTitleChange={setNewSubtaskTitle}
          onAdd={vi.fn()}
          onCommitDraft={vi.fn()}
          onEdit={vi.fn(async () => true)}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
          images={images}
        />
      </DialogContent>
    </Dialog>
  );
};

const screenshotClipboard = (file: File) => ({
  getData: () => '',
  items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
  files: [file],
  types: ['Files'],
});

describe('SubtasksSection pictures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetScreenLayers();
  });

  it('shows a subtask picture and opens it in the lightbox; Escape returns to the task', async () => {
    const onTaskOpenChange = vi.fn();
    render(<Harness images={makeImages()} onTaskOpenChange={onTaskOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open image' }));
    const lightbox = await screen.findByTestId('image-lightbox');
    expect((lightbox.querySelector('img') as HTMLImageElement).src).toContain('/task-media/m1?token=t1');

    fireEvent.keyDown(lightbox, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('image-lightbox')).toBeNull());
    expect(onTaskOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Photo of the crack' })).toBeInTheDocument();
  });

  it('takes a picture off a subtask with ×', () => {
    const images = makeImages();
    render(<Harness images={images} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(images.remove).toHaveBeenCalledWith('subtask-1', 'm1');
  });

  it('a read-only viewer sees and opens pictures but cannot add or remove them', async () => {
    render(<Harness images={makeImages()} isReadOnly />);
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add image' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open image' }));
    expect(await screen.findByTestId('image-lightbox')).toBeInTheDocument();
  });

  it('a screenshot pasted into the new-subtask field goes to the draft', () => {
    const images = makeImages();
    render(<Harness images={images} />);
    const shot = new File(['x'], 'shot.png', { type: 'image/png' });
    fireEvent.paste(screen.getByPlaceholderText('Subtask title'), { clipboardData: screenshotClipboard(shot) });
    expect(images.attach).toHaveBeenCalledWith(null, [shot]);
  });

  it('a screenshot pasted while editing a subtask goes onto that subtask', async () => {
    const user = userEvent.setup();
    const images = makeImages();
    render(<Harness images={images} />);
    await user.click(screen.getByRole('button', { name: 'Photo of the crack' }));
    const shot = new File(['x'], 'shot.png', { type: 'image/png' });
    fireEvent.paste(screen.getByDisplayValue('Photo of the crack'), { clipboardData: screenshotClipboard(shot) });
    expect(images.attach).toHaveBeenCalledWith('subtask-1', [shot]);
  });

  it('the picture button attaches picked files to the draft', () => {
    const images = makeImages();
    render(<Harness images={images} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
    const shot = new File(['x'], 'shot.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('subtask-image-input'), { target: { files: [shot] } });
    expect(images.attach).toHaveBeenCalledWith(null, [shot]);
  });

  it('Escape in the composer drops the draft pictures with the text, and keeps the task', () => {
    const onTaskOpenChange = vi.fn();
    const images = makeImages({ draftImages: [{ id: 'd1', token: 't' }] });
    render(<Harness images={images} onTaskOpenChange={onTaskOpenChange} />);
    expect(screen.getAllByRole('button', { name: 'Open image' })).toHaveLength(2);
    fireEvent.keyDown(screen.getByPlaceholderText('Subtask title'), { key: 'Escape' });
    expect(images.discardDraftImages).toHaveBeenCalledTimes(1);
  });

  it('shows a placeholder while a picture uploads', () => {
    render(<Harness images={makeImages({ uploading: { 'subtask-1': 1 } })} />);
    expect(screen.getByRole('status', { name: 'Uploading image...' })).toBeInTheDocument();
  });
});
