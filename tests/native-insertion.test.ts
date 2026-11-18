import { expect, test, vi } from 'vitest';
import { EditorState, StateField } from '@codemirror/state';
import type { App, Editor, MarkdownFileInfo } from 'obsidian';
import { createNativeInsertion } from '../src/host/native-insertion';
import { hostWorkspace } from './helpers/host-workspace';
import { hostLanguage } from './helpers/host-language';

function fixture() {
  const editor = { focus: vi.fn() } as unknown as Editor;
  const info = StateField.define<MarkdownFileInfo>({ create: () => ({ editor } as MarkdownFileInfo), update: value => value });
  const executeCommandById = vi.fn(() => true);
  const app = { workspace: { activeEditor: { editor, getMode: () => 'source' } }, commands: { executeCommandById, commands: Object.fromEntries([
    'set-heading-0', 'set-heading-1', 'set-heading-2', 'set-heading-3', 'set-heading-4', 'set-heading-5', 'set-heading-6',
    'toggle-bullet-list', 'toggle-numbered-list', 'toggle-checklist-status', 'insert-codeblock',
    'toggle-blockquote', 'insert-callout', 'insert-mathblock', 'insert-table', 'insert-horizontal-rule'
  ].map(id => [`editor:${id}`, {}])) } };
  return { editor, app, executeCommandById, info, host: createNativeInsertion(app as unknown as App, info) };
}

test('heading 2 uses the native command in the originating editor without changing its selection', () => {
  const { host, editor, executeCommandById, info } = fixture();
  const state = EditorState.create({ doc: '正文内容', selection: { anchor: 2 }, extensions: [info] });
  expect(host.source(state)).toBe(editor);
  expect(host.execute('heading2', editor, () => true)).toBe(true);
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:set-heading-2');
  expect(editor.focus).toHaveBeenCalledOnce();
  expect(state.selection.main.anchor).toBe(2);
});

test('ordinary source lines are reported as text by the host query', () => {
  const { host } = fixture();
  const state = EditorState.create({ doc: '正文内容', extensions: [hostLanguage()] });
  expect(host.region(state)).toBe('text');
});

test('host codeblock scope is reported as code even when the caret follows the token', () => {
  const { host } = fixture();
  const state = EditorState.create({ doc: '```js', selection: { anchor: 5 }, extensions: [hostLanguage([['HyperMD-codeblock_HyperMD-codeblock-begin']])] });
  expect(host.region(state)).toBe('code');
});

test('host block scopes distinguish math, table and properties without interpreting inline formatting as blocks', () => {
  const { host } = fixture();
  const samples = [
    ['HyperMD-math', 'math'],
    ['math-block_formatting-math', 'math'],
    ['HyperMD-table-row_HyperMD-table-row-0', 'table'],
    ['hmd-frontmatter', 'properties'],
    ['inline-code', 'text'],
    ['math', 'text'],
    ['HyperMD-codeblock_HyperMD-codeblock-end', 'code']
  ] as const;
  for (const [scope, expected] of samples) {
    const state = EditorState.create({ doc: '内容', selection: { anchor: 1 }, extensions: [hostLanguage([[scope]])] });
    expect(host.region(state), scope).toBe(expected);
  }
});

test('a rejected or throwing native operation reports failure without retry or fallback', () => {
  const { host, editor, executeCommandById } = fixture();
  executeCommandById.mockReturnValueOnce(false).mockImplementationOnce(() => { throw new Error('host failure'); });
  expect(host.execute('heading2', editor, () => true)).toBe(false);
  expect(host.execute('heading2', editor, () => true)).toBe(false);
  expect(executeCommandById).toHaveBeenCalledTimes(2);
});

test('a different active editor cannot be replaced by focusing an old source', () => {
  const { host, editor, app, executeCommandById } = fixture();
  app.workspace.activeEditor.editor = {} as Editor;
  vi.mocked(editor.focus).mockImplementation(() => { app.workspace.activeEditor.editor = editor; });
  expect(host.execute('heading2', editor, () => true)).toBe(false);
  expect(editor.focus).not.toHaveBeenCalled();
  expect(executeCommandById).not.toHaveBeenCalled();
});

// Contract regression coverage: artificial syntax snapshots are not host acceptance.
test('empty block lines retain host region identity and adjacent prose stays separate', () => {
  const { host } = fixture();
  for (const [scope, expected] of [['HyperMD-codeblock', 'code'], ['HyperMD-math', 'math'], ['hmd-frontmatter', 'properties']] as const) {
    const state = EditorState.create({ doc: '上文\n\n下文', selection: { anchor: 3 }, extensions: [hostLanguage([[], [scope], []])] });
    expect(host.region(state), scope).toBe(expected);
    expect(host.region(state.update({ selection: { anchor: 4 } }).state)).toBe('text');
  }
});

test('missing syntax or editor identity is reported instead of guessing a usable source', () => {
  const { host } = fixture();
  const state = EditorState.create({ doc: '正文' });
  expect(host.source(state)).toBeNull();
  expect(host.region(state)).toBe('unknown');
});

test('missing command capability and focus that activates a different editor cannot execute', () => {
  const { host, app, editor, executeCommandById, info } = fixture();
  vi.mocked(editor.focus).mockImplementationOnce(() => { app.workspace.activeEditor.editor = {} as Editor; });
  expect(host.execute('heading2', editor, () => true)).toBe(false);
  expect(executeCommandById).not.toHaveBeenCalled();
  app.workspace.activeEditor.editor = editor;
  const unavailable = createNativeInsertion({ workspace: app.workspace } as unknown as App, info);
  expect(unavailable.execute('heading2', editor, () => true)).toBe(false);
});

// Literal routing expectations come from spec §8.1, not the production catalog.
test.each([
  ['text', 'editor:set-heading-0'],
  ['heading1', 'editor:set-heading-1'], ['heading2', 'editor:set-heading-2'],
  ['heading3', 'editor:set-heading-3'], ['heading4', 'editor:set-heading-4'],
  ['heading5', 'editor:set-heading-5'], ['heading6', 'editor:set-heading-6'],
  ['bulletList', 'editor:toggle-bullet-list'], ['orderedList', 'editor:toggle-numbered-list'],
  ['task', 'editor:toggle-checklist-status'], ['code', 'editor:insert-codeblock'],
  ['quote', 'editor:toggle-blockquote'], ['callout', 'editor:insert-callout'],
  ['math', 'editor:insert-mathblock'], ['table', 'editor:insert-table'],
  ['divider', 'editor:insert-horizontal-rule']
] as const)('%s executes exactly its native operation without preprocessing', (action, command) => {
  const { host, editor, executeCommandById } = fixture();
  expect(host.execute(action, editor, () => true)).toBe(true);
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith(command);
});

test('availability combines native menu context and command checks and is rechecked before execution', () => {
  const { host, editor, app, executeCommandById } = fixture();
  const check = vi.fn(() => false);
  Object.assign(app.commands, { commands: { 'editor:set-heading-2': { editorCheckCallback: check } } });
  expect(host.available('heading2', editor)).toBe(false);
  expect(host.execute('heading2', editor, () => true)).toBe(false);
  check.mockReturnValue(true);
  expect(host.available('heading2', editor)).toBe(true);
  Object.assign(editor, { inTableCell: true });
  expect(host.available('heading2', editor)).toBe(false);
  expect(host.execute('heading2', editor, () => true)).toBe(false);
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('format checks follow host syntax without inventing mutually exclusive block types', () => {
  const { host } = fixture();
  const state = (scopes: string[]) => EditorState.create({ doc: '内容', extensions: [hostLanguage([scopes])] });
  expect([...host.checked(state(['header-2']))]).toEqual(['heading2']);
  expect(host.checked(state(['formatting-list-ul_list-1']))).toContain('bulletList');
  expect(host.checked(state(['formatting-list-ol_list-1']))).toContain('orderedList');
  for (const scope of ['formatting-task', 'formatting-task_meta']) {
    const checked = host.checked(state([scope]));
    expect(checked.has('task')).toBe(true);
    expect(checked.has('table')).toBe(false);
    expect(checked.has('divider')).toBe(false);
  }
  expect(host.checked(state(['quote_header-2'])).has('heading2')).toBe(true);
  expect(host.checked(state(['quote_header-2'])).has('quote')).toBe(true);
  expect([...host.checked(state([]))]).toEqual(['text']);
});

test('a command registry without an execution capability is unavailable rather than falsely enabled', () => {
  const { app, info, editor } = fixture();
  const host = createNativeInsertion({ workspace: app.workspace, commands: { commands: app.commands.commands } } as unknown as App, info);
  expect(host.available('heading2', editor)).toBe(false);
  expect(host.execute('heading2', editor, () => true)).toBe(false);
});


test.each(['active-leaf-change', 'file-open'])('the host reports %s and releases its subscription on cancellation', event => {
  const editor = {} as Editor;
  const { workspace, emit } = hostWorkspace(editor);
  const info = StateField.define<MarkdownFileInfo>({ create: () => ({ editor } as MarkdownFileInfo), update: value => value });
  const host = createNativeInsertion({ workspace } as unknown as App, info);
  const onExit = vi.fn();
  const dispose = host.watchContext(onExit);
  emit(event);
  expect(onExit).toHaveBeenCalledOnce();
  dispose();
  emit('active-leaf-change');
  emit('file-open');
  expect(onExit).toHaveBeenCalledOnce();
});

test('layout invalidation compares the original editor identity rather than a mutable host context object', () => {
  const editor = {} as Editor;
  const { workspace, emit } = hostWorkspace(editor);
  const info = StateField.define<MarkdownFileInfo>({ create: () => ({ editor } as MarkdownFileInfo), update: value => value });
  const host = createNativeInsertion({ workspace } as unknown as App, info);
  const onExit = vi.fn();
  const dispose = host.watchContext(onExit);
  workspace.activeEditor.editor = {} as Editor;
  emit('layout-change');
  expect(onExit).toHaveBeenCalledOnce();
  dispose();
});

test('preparation runs only after focus and source checks and is rechecked before the command', () => {
  const { host, editor, app, executeCommandById } = fixture();
  let current = true;
  const prepare = vi.fn(() => {
    expect(editor.focus).toHaveBeenCalledOnce();
    current = false;
    return true;
  });
  expect(host.execute('heading2', editor, () => current, prepare)).toBe(false);
  expect(prepare).toHaveBeenCalledOnce();
  expect(executeCommandById).not.toHaveBeenCalled();
  app.workspace.activeEditor.editor = {} as Editor;
  prepare.mockClear();
  expect(host.execute('heading2', editor, () => true, prepare)).toBe(false);
  expect(prepare).not.toHaveBeenCalled();
});

test('refused preparation or command becoming unavailable during preparation never executes', () => {
  const { host, editor, app, executeCommandById } = fixture();
  expect(host.execute('heading2', editor, () => true, () => false)).toBe(false);
  expect(host.execute('heading2', editor, () => true, () => {
    delete app.commands.commands['editor:set-heading-2'];
    return true;
  })).toBe(false);
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('body start follows host-confirmed prefixes and refuses inline code or math', () => {
  const { host } = fixture();
  for (const [doc, scopes, expected] of [
    ['正文', [], 0], ['  正文', [], 2], ['>正文', ['quote'], 1],
    ['> - [ ] 正文', ['quote', 'formatting-list-ul', 'formatting-task'], 8],
    ['## 正文', ['header-2'], 3], ['1. 正文', ['formatting-list-ol'], 3],
    ['>正文', [], 0], ['内容', ['inline-code'], null], ['内容', ['math'], null]
  ] as const) {
    const state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [hostLanguage([scopes])] });
    expect(host.bodyStart(state), doc).toBe(expected);
  }
  expect(host.bodyStart(EditorState.create({ doc: 'no syntax' }))).toBeNull();
});
