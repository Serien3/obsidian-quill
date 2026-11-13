import { expect, test, vi } from 'vitest';
import type { App, Editor } from 'obsidian';
import { executeNativeFormatting } from '../src/host/native-formatting';

function fixture() {
  const editor = { focus: vi.fn() } as unknown as Editor;
  const executeCommandById = vi.fn(() => true);
  const app = { workspace: { activeEditor: { editor } }, commands: { executeCommandById } };
  return { editor, app, executeCommandById };
}

test('native formatting focuses the originating editor and executes the exact host command once', () => {
  const { app, editor, executeCommandById } = fixture();
  executeCommandById.mockImplementation(() => {
    expect(editor.focus).toHaveBeenCalledOnce();
    return true;
  });
  expect(executeNativeFormatting(app as unknown as App, editor, 'bold')).toBe(true);
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:toggle-bold');
});

test('native formatting never targets a different active editor', () => {
  const { app, editor, executeCommandById } = fixture();
  app.workspace.activeEditor.editor = {} as Editor;
  expect(executeNativeFormatting(app as unknown as App, editor, 'bold')).toBe(false);
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('unavailable or rejected native commands report failure without an alternative formatter', () => {
  const { app, editor, executeCommandById } = fixture();
  executeCommandById.mockReturnValue(false);
  expect(executeNativeFormatting(app as unknown as App, editor, 'bold')).toBe(false);
  expect(executeNativeFormatting({ workspace: app.workspace } as unknown as App, editor, 'bold')).toBe(false);
});

// Expected host protocol is independent of the adapter's private command table.
for (const [format, command] of [
  ['bold', 'editor:toggle-bold'], ['italic', 'editor:toggle-italics'],
  ['strikethrough', 'editor:toggle-strikethrough'], ['clear', 'editor:clear-formatting'],
  ['code', 'editor:toggle-code'], ['math', 'editor:toggle-inline-math'],
  ['internalLink', 'editor:insert-wikilink'], ['externalLink', 'editor:insert-link']
] as const) {
  test(`${format} executes its native command exactly once`, () => {
    const { app, editor, executeCommandById } = fixture();
    expect(executeNativeFormatting(app as unknown as App, editor, format)).toBe(true);
    expect(executeCommandById).toHaveBeenCalledExactlyOnceWith(command);
  });
}
