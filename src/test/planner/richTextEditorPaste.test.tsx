import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RichTextEditor } from '@/features/planner/components/RichTextEditor';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  uploadTaskMedia: vi.fn(),
}));

/**
 * Wiring test for the paste path: the pure normalisation rules live in
 * pastedRichText.test.ts, this pins that the editor actually routes clipboard
 * HTML through them instead of letting the browser insert the source markup.
 */
const CHAT_CLIPBOARD_HTML =
  '<div style="font-family: arial; background-color: rgb(255, 255, 255);">'
  + '<div style="position: absolute; right: 32px; top: -26px; background: white;">'
  + '<div style="height: 24px; width: 24px; background-image: url(images/a_bt_reaction.png);"></div></div>'
  + '<div style="color: transparent; position: absolute; height: 1px; width: 1px;">Алина Борисова</div>'
  + '<div style="color: rgb(40, 50, 60); font-size: 15px;">покраска стены не выводится</div></div>';

const makeClipboard = (data: Record<string, string>) => ({
  getData: (type: string) => data[type] ?? '',
  items: [],
  files: [],
  types: Object.keys(data),
});

const renderEditor = (onChange = vi.fn()) => {
  render(
    <RichTextEditor id="description" value="" onChange={onChange} workspaceId="w1" />,
  );
  return document.getElementById('description') as HTMLDivElement;
};

describe('RichTextEditor paste', () => {
  let execCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execCommand = vi.fn().mockReturnValue(true);
    // jsdom has no execCommand at all — the editor's insert path needs one.
    (document as Document & { execCommand: typeof document.execCommand }).execCommand =
      execCommand as unknown as typeof document.execCommand;
  });

  it('inserts a normalised fragment instead of the source markup', () => {
    const editor = renderEditor();

    fireEvent.paste(editor, { clipboardData: makeClipboard({ 'text/html': CHAT_CLIPBOARD_HTML }) });

    expect(execCommand).toHaveBeenCalledTimes(1);
    const [command, , inserted] = execCommand.mock.calls[0] as [string, boolean, string];
    expect(command).toBe('insertHTML');
    expect(inserted).toContain('покраска стены не выводится');
    expect(inserted).not.toContain('position');
    expect(inserted).not.toContain('background');
    expect(inserted).not.toContain('Алина Борисова');
  });

  it('falls back to plain text when the fragment is layout only', () => {
    const editor = renderEditor();

    fireEvent.paste(editor, {
      clipboardData: makeClipboard({
        'text/html': '<div style="display: none;">hidden</div>',
        'text/plain': 'запасной текст',
      }),
    });

    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'запасной текст');
  });

  it('leaves a plain-text paste to the browser', () => {
    const editor = renderEditor();

    fireEvent.paste(editor, { clipboardData: makeClipboard({ 'text/plain': 'просто текст' }) });

    expect(execCommand).not.toHaveBeenCalled();
  });

  it('does not touch the clipboard while disabled', () => {
    render(
      <RichTextEditor id="description" value="" onChange={vi.fn()} workspaceId="w1" disabled />,
    );
    const editor = document.getElementById('description') as HTMLDivElement;

    fireEvent.paste(editor, { clipboardData: makeClipboard({ 'text/html': CHAT_CLIPBOARD_HTML }) });

    expect(execCommand).not.toHaveBeenCalled();
    expect(screen.queryByText('Алина Борисова')).toBeNull();
  });
});
