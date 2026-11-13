import { expect, test, vi } from 'vitest';
import type { App, Editor } from 'obsidian';
import { executeNativeHighlight } from '../src/host/native-highlight';

function fixture() {
  const toggleHighlight = vi.fn();
  const editor = { focus: vi.fn(), toggleHighlight } as unknown as Editor;
  const app = { workspace: { activeEditor: { editor } } } as unknown as App;
  return { app, editor, toggleHighlight };
}

test('default highlight delegates an explicit empty color to the originating native editor', () => {
  const { app, editor, toggleHighlight } = fixture();
  expect(executeNativeHighlight(app, editor, '')).toBe(true);
  expect(editor.focus).toHaveBeenCalledOnce();
  expect(toggleHighlight).toHaveBeenCalledExactlyOnceWith('');
});

test('highlight never writes into a different active pane', () => {
  const { app, editor, toggleHighlight } = fixture();
  app.workspace.activeEditor!.editor = {} as Editor;
  expect(executeNativeHighlight(app, editor, 'red')).toBe(false);
  expect(toggleHighlight).not.toHaveBeenCalled();
});

test('unavailable or throwing native highlight methods fail without a replacement formatter', () => {
  const { app, editor, toggleHighlight } = fixture();
  toggleHighlight.mockImplementation(() => { throw new Error('host failed'); });
  expect(executeNativeHighlight(app, editor, 'blue')).toBe(false);
  delete (editor as unknown as { toggleHighlight?: unknown }).toggleHighlight;
  expect(executeNativeHighlight(app, editor, '')).toBe(false);
});

for (const color of ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const) {
  test(`${color} delegates once without a plugin-side content writer`, () => {
    const { app, editor, toggleHighlight } = fixture();
    expect(executeNativeHighlight(app, editor, color)).toBe(true);
    expect(toggleHighlight).toHaveBeenCalledExactlyOnceWith(color);
  });
}
