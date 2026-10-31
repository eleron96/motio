import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

const media = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  uploadTaskMediaFile: media.upload,
  buildTaskMediaUrl: (image: { id: string }) => `https://app.example/functions/v1/task-media/${image.id}`,
}));
vi.mock('@/shared/ui/sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { useDraftSubtaskImages } from '@/features/planner/hooks/useDraftSubtaskImages';

const png = () => new File(['x'], 'shot.png', { type: 'image/png' });

const setup = () => {
  const releaseTaskMedia = vi.fn();
  const hook = renderHook(() => useDraftSubtaskImages({ workspaceId: 'workspace-1', enabled: true, releaseTaskMedia }));
  return { ...hook, releaseTaskMedia };
};

describe('useDraftSubtaskImages', () => {
  it('"Create task" waits for a picture still uploading, then sees it', async () => {
    let finish: (value: { id: string; token: string }) => void = () => {};
    media.upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result, releaseTaskMedia } = setup();

    act(() => { result.current.attach('draft-1', [png()]); });
    expect(result.current.uploadingFor('draft-1')).toBe(1);

    await act(async () => {
      const waiting = result.current.waitForUploads();
      finish({ id: 'm1', token: 't1' });
      await waiting;
    });

    expect(result.current.snapshot()).toEqual({ 'draft-1': [{ id: 'm1', token: 't1' }] });
    // Written with the subtasks: let go without releasing.
    act(() => { result.current.forget(); });
    expect(result.current.snapshot()).toEqual({});
    expect(releaseTaskMedia).not.toHaveBeenCalled();
  });

  it('stops offering more pictures at the cap, uploads in flight included', async () => {
    media.upload.mockImplementation(() => new Promise(() => {}));
    const { result } = setup();
    act(() => { result.current.attach('draft-1', Array.from({ length: 10 }, png)); });
    expect(result.current.canAttachTo('draft-1')).toBe(false);
    expect(result.current.canAttachTo('draft-2')).toBe(true);
    media.upload.mockReset();
  });

  it('unmounting the form hands its pictures back', async () => {
    media.upload.mockResolvedValueOnce({ id: 'm3', token: 't3' });
    const { result, unmount, releaseTaskMedia } = setup();
    await act(async () => { result.current.attach('draft-1', [png()]); await Promise.resolve(); await Promise.resolve(); });
    unmount();
    expect(releaseTaskMedia).toHaveBeenCalledWith(['m3']);
  });

  it('a picture that lands after the form closed is handed back', async () => {
    let finish: (value: { id: string; token: string }) => void = () => {};
    media.upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result, releaseTaskMedia } = setup();

    act(() => { result.current.attach('draft-1', [png()]); });
    act(() => { result.current.discardAll(); });
    await act(async () => { finish({ id: 'm1', token: 't1' }); await Promise.resolve(); await Promise.resolve(); });

    expect(releaseTaskMedia).toHaveBeenCalledWith(['m1']);
    expect(result.current.imagesFor('draft-1')).toEqual([]);
  });

  it('removing a draft releases its pictures', async () => {
    media.upload.mockResolvedValueOnce({ id: 'm2', token: 't2' });
    const { result, releaseTaskMedia } = setup();

    await act(async () => { result.current.attach('draft-1', [png()]); await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.imagesFor('draft-1')).toEqual([{ id: 'm2', token: 't2' }]);

    act(() => { result.current.discardDraft('draft-1'); });
    expect(releaseTaskMedia).toHaveBeenCalledWith(['m2']);
  });
});
