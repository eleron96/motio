import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

const renderEditor = (onSave = vi.fn(async (_html: string) => undefined)) => {
  const utils = render(
    <CommentEditor
      workspaceId="ws-1"
      mentionCandidates={[]}
      onSave={onSave}
      saveLabel="Send"
    />,
  );
  const editor = utils.container.querySelector('[contenteditable]') as HTMLElement;
  return { ...utils, editor, onSave };
};

describe('CommentEditor — screenshot-only comment', () => {
  it('starts with the send button disabled while the draft is empty', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('lets an image with no text be sent', async () => {
    const { editor, onSave } = renderEditor();

    editor.innerHTML = '<img src="https://cdn.example.com/shot.png" alt="Screenshot">';
    fireEvent.input(editor);

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeEnabled();

    fireEvent.click(send);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatch(/<img\b/);
  });

  it('keeps the button disabled for whitespace-only input', () => {
    const { editor } = renderEditor();

    editor.innerHTML = '<div>&nbsp;</div><div><br></div>';
    fireEvent.input(editor);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
