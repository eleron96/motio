import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));
vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));
vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  uploadTaskMedia: vi.fn(),
}));

import { CommentEditor } from '@/features/planner/components/CommentEditor';

/**
 * The new-comment box empties the moment Send is pressed (the comment is
 * already shown in the list) and gets the text back if the save fails.
 */

// jsdom has no innerText; the editor reads the typed text through it.
beforeAll(() => {
  if (!('innerText' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get(this: HTMLElement) { return this.textContent ?? ''; },
    });
  }
});

const renderEditor = (onSave: (html: string) => Promise<void>, emptyWhileSaving = true) => {
  const onDraftDirtyChange = vi.fn();
  const utils = render(
    <CommentEditor
      workspaceId="ws-1"
      mentionCandidates={[]}
      onSave={onSave}
      saveLabel="Send"
      emptyWhileSaving={emptyWhileSaving}
      onDraftDirtyChange={onDraftDirtyChange}
    />,
  );
  const editor = utils.container.querySelector('[contenteditable]') as HTMLElement;
  const typeText = (text: string) => {
    editor.textContent = text;
    fireEvent.input(editor);
  };
  return { ...utils, editor, typeText, onDraftDirtyChange };
};

const deferred = () => {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('CommentEditor emptyWhileSaving', () => {
  it('empties at once while the save is on its way', async () => {
    const save = deferred();
    const { editor, typeText, onDraftDirtyChange } = renderEditor(() => save.promise);
    typeText('Shipped to the client');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(editor.textContent).toBe('');
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);
    await act(async () => { save.resolve(); await save.promise; });
    expect(editor.textContent).toBe('');
  });

  it('puts the text back when the save fails', async () => {
    const save = deferred();
    const { editor, typeText, onDraftDirtyChange } = renderEditor(() => save.promise);
    typeText('Shipped to the client');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await act(async () => { save.reject(new Error('offline')); await save.promise.catch(() => undefined); });

    expect(editor.textContent).toBe('Shipped to the client');
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('keeps a comment typed meanwhile when the earlier one fails', async () => {
    const save = deferred();
    const { editor, typeText } = renderEditor(() => save.promise);
    typeText('First');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    typeText('Second');

    await act(async () => { save.reject(new Error('offline')); await save.promise.catch(() => undefined); });

    expect(editor.textContent).toBe('Second');
  });

  it('without the option keeps the text until the save succeeds (editing a comment)', async () => {
    const save = deferred();
    const { editor, typeText } = renderEditor(() => save.promise, false);
    typeText('Edited text');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(editor.textContent).toBe('Edited text');

    await act(async () => { save.resolve(); await save.promise; });
    expect(editor.textContent).toBe('');
  });
});
