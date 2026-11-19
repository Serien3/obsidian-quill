import '../styles.css';
import { userEvent } from 'vitest/browser';
import { afterEach, expect, test, vi } from 'vitest';
import { Compartment, EditorSelection, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { foldGutter, foldService } from '@codemirror/language';
import { Decoration, EditorView, lineNumbers } from '@codemirror/view';
import type { App, Editor, MarkdownFileInfo } from 'obsidian';
import { createNativeInsertion } from '../src/host/native-insertion';
import { lineInsertMenu } from '../src/insertion/insert-menu';
import { hostWorkspace } from './helpers/host-workspace';
import { hostLanguage } from './helpers/host-language';
import { nativeSelection } from '../src/host/native-selection';
import { quillToolbar } from '../src/formatting/toolbar';

const views: EditorView[] = [];
afterEach(() => { views.splice(0).forEach(view => view.destroy()); document.body.replaceChildren(); });

function fixture(doc = '正文内容', scopes: readonly (readonly string[])[] = [], extensions: Extension[] = [], ownerDocument = document) {
  let view: EditorView;
  const editor = { focus: () => view.focus() } as Editor;
  const info = StateField.define<MarkdownFileInfo>({ create: () => ({ editor } as MarkdownFileInfo), update: value => value });
  const source = new Compartment();
  const insertion = new Compartment();
  const executeCommandById = vi.fn(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '## 正文内容' }, selection: { anchor: 5 } });
    return true;
  });
  const { workspace, emit, setMode } = hostWorkspace(editor);
  const app = { workspace, commands: { executeCommandById, commands: Object.fromEntries([
    'set-heading-0', 'set-heading-1', 'set-heading-2', 'set-heading-3', 'set-heading-4', 'set-heading-5', 'set-heading-6',
    'toggle-bullet-list', 'toggle-numbered-list', 'toggle-checklist-status', 'insert-codeblock',
    'toggle-blockquote', 'insert-callout', 'insert-mathblock', 'insert-table', 'insert-horizontal-rule'
  ].map(id => [`editor:${id}`, {}])) } };
  const parent = ownerDocument.createElement('div');
  parent.style.cssText = 'width:500px;height:220px;margin:60px;';
  ownerDocument.body.append(parent);
  const entry = lineInsertMenu(createNativeInsertion(app as unknown as App, info), element => { element.append(document.createElementNS("http://www.w3.org/2000/svg", "svg")); });
  view = new EditorView({ parent, state: EditorState.create({ doc, selection: { anchor: Math.min(2, doc.length) }, extensions: [...extensions, source.of(info), hostLanguage(scopes), insertion.of(entry.extension)] }) });
  // Existing host whitespace, independent of the insertion extension and its document.
  view.contentDOM.style.padding = '12px 0 12px 40px';
  views.push(view);
  view.focus();
  return { view, editor, app, executeCommandById, source, insertion, entry, emit, setMode };
}

const plus = () => document.querySelector<HTMLButtonElement>('[aria-label="打开插入菜单"]');
const menu = () => document.querySelector<HTMLElement>('[role="menu"][aria-label="插入"]');

const heading2 = () => menu()!.querySelector<HTMLButtonElement>('[data-action="heading2"]')!;

async function open() {
  await vi.waitFor(() => expect(plus()?.style.visibility).toBe('visible'));
  plus()!.click();
  await vi.waitFor(() => expect(menu()).not.toBeNull());
}

test('user opens the line menu without moving the caret and applies the native heading result', async () => {
  const { view, executeCommandById } = fixture();
  await open();
  expect(view.state.selection.main.anchor).toBe(2);
  expect(view.state.selection.main.empty).toBe(true);
  heading2().click();
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:set-heading-2');
  expect(view.state.doc.toString()).toBe('## 正文内容');
  expect(view.state.selection.main.anchor).toBe(5);
  expect(menu()).toBeNull();
  expect(view.hasFocus).toBe(true);
});

async function measured() {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

test('moving from prose to a code fence hides the line entry', async () => {
  const { view } = fixture('正文\n```js', [[], ['HyperMD-codeblock_HyperMD-codeblock-begin']]);
  await vi.waitFor(() => expect(plus()?.style.visibility).toBe('visible'));
  view.dispatch({ selection: { anchor: 5 } });
  await measured();
  expect(plus()?.style.visibility).toBe('hidden');
});

test('editing the source cancels the open menu and its stale item cannot change the document', async () => {
  const { view, executeCommandById } = fixture();
  await open();
  const item = heading2();
  view.dispatch({ changes: { from: 0, insert: '新' } });
  expect(menu()).toBeNull();
  item.click();
  expect(executeCommandById).not.toHaveBeenCalled();
  expect(view.state.doc.toString()).toBe('新正文内容');
});

test('moving the caret or creating a text selection cancels the old menu', async () => {
  const { view, executeCommandById } = fixture();
  await open();
  view.dispatch({ selection: { anchor: 0, head: 3 } });
  await measured();
  expect(menu()).toBeNull();
  expect(plus()?.style.visibility).toBe('hidden');
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('Escape cancels without editing and returns focus to the original caret', async () => {
  const { view, executeCommandById } = fixture();
  await open();
  expect(view.hasFocus).toBe(false);
  menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(menu()).toBeNull();
  expect(view.hasFocus).toBe(true);
  expect(view.state.selection.main.anchor).toBe(2);
  expect(view.state.doc.toString()).toBe('正文内容');
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('outside interaction closes without stealing the new focus', async () => {
  fixture();
  await open();
  const input = document.createElement('input');
  document.body.append(input);
  input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  input.focus();
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(input);
});

test('the open menu marks only the source line without creating a text selection and clears it on close', async () => {
  const { view } = fixture('当前行\n另一行');
  await open();
  const marked = document.querySelectorAll('.cm-line.line-insert-target');
  expect(marked).toHaveLength(1);
  expect(marked[0].textContent).toBe('当前行');
  expect(view.state.selection.main.empty).toBe(true);
  menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.line-insert-target')).toBeNull();
});

test('clicking the plus again closes the menu instead of leaving duplicate menus', async () => {
  fixture();
  await open();
  plus()!.click();
  expect(menu()).toBeNull();
  expect(document.querySelectorAll('[role="menu"][aria-label="插入"]')).toHaveLength(0);
});

test('destroying the source removes its menu and a retained button cannot reopen it', async () => {
  const { view, executeCommandById } = fixture();
  await open();
  const retained = plus()!;
  const item = heading2();
  view.destroy();
  expect(plus()).toBeNull();
  expect(menu()).toBeNull();
  expect(document.querySelector('.line-insert-target')).toBeNull();
  retained.click();
  item.click();
  expect(menu()).toBeNull();
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('losing the source identity closes the menu before an old action can run', async () => {
  const { view, source, executeCommandById } = fixture();
  await open();
  const item = heading2();
  view.dispatch({ effects: source.reconfigure([]) });
  expect(menu()).toBeNull();
  item.click();
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('the entry has its own left space and the menu visibly marks the source line', async () => {
  fixture();
  await open();
  const buttonRect = plus()!.getBoundingClientRect();
  const line = document.querySelector<HTMLElement>('.cm-line.line-insert-target')!;
  expect(buttonRect.right).toBeLessThanOrEqual(line.getBoundingClientRect().left);
  expect(getComputedStyle(line).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
});

test('a document change while restoring editor focus aborts the pending native edit', async () => {
  const { view, editor, executeCommandById } = fixture();
  await open();
  vi.spyOn(editor, 'focus').mockImplementationOnce(() => {
    view.dispatch({ changes: { from: 0, insert: '外部变化' } });
    view.focus();
  });
  heading2().click();
  expect(executeCommandById).not.toHaveBeenCalled();
  expect(view.state.doc.toString()).toBe('外部变化正文内容');
  expect(menu()).toBeNull();
});

test('events retained from an old menu cannot cancel a newly opened interaction', async () => {
  fixture();
  await open();
  const oldMenu = menu()!;
  oldMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await open();
  const currentMenu = menu();
  oldMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(menu()).toBe(currentMenu);
});

// Additional seam regressions for behavior established by the red/green cycles above.
test.each([
  ['数学围栏', 'math-block_formatting-math'],
  ['数学正文', 'HyperMD-math'],
  ['表格', 'HyperMD-table-row_HyperMD-table-row-0'],
  ['属性', 'hmd-frontmatter'],
  ['代码正文', 'HyperMD-codeblock'],
  ['代码结束围栏', 'HyperMD-codeblock_HyperMD-codeblock-end']
])('%s does not expose the line menu', async (_label, scope) => {
  const { view } = fixture('正文\n受限行', [[], [scope]]);
  await vi.waitFor(() => expect(plus()?.style.visibility).toBe('visible'));
  view.dispatch({ selection: { anchor: 5 } });
  await measured();
  expect(plus()?.style.visibility).toBe('hidden');
  plus()!.click();
  expect(menu()).toBeNull();
});

test('an empty source line remains eligible for the menu', async () => {
  const { view } = fixture('');
  await open();
  expect(view.state.selection.main.anchor).toBe(0);
  expect(view.state.doc.toString()).toBe('');
});

test('wrapped source text keeps one entry at the first visual line without expanding selection', async () => {
  const doc = '这是一段会自动换行的文字。'.repeat(30);
  const { view } = fixture(doc, [], [EditorView.lineWrapping]);
  view.dispatch({ selection: { anchor: doc.length - 2 } });
  await measured();
  const first = view.coordsAtPos(0)!;
  const last = view.coordsAtPos(doc.length - 2)!;
  expect(last.top).toBeGreaterThan(first.top);
  const button = plus()!.getBoundingClientRect();
  expect(Math.abs((button.top + button.bottom) / 2 - (first.top + first.bottom) / 2)).toBeLessThan(1);
  await open();
  expect(view.state.selection.main.anchor).toBe(doc.length - 2);
  expect(view.state.selection.main.empty).toBe(true);
  expect(document.querySelectorAll('.cm-line.line-insert-target')).toHaveLength(1);
});

test.each(['reject', 'throw'])('native %s closes the menu without modifying or retrying', async kind => {
  const { view, executeCommandById } = fixture();
  executeCommandById.mockImplementation(() => {
    if (kind === 'throw') throw new Error('native unavailable');
    return false;
  });
  await open();
  const item = heading2();
  item.click();
  item.click();
  expect(menu()).toBeNull();
  expect(view.state.doc.toString()).toBe('正文内容');
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:set-heading-2');
  expect(document.querySelector('.notice')).toBeNull();
});

test('read-only sources do not expose an editing entry', async () => {
  const { view } = fixture('正文', [], [EditorState.readOnly.of(true)]);
  await measured();
  expect(plus()?.style.visibility).toBe('hidden');
  plus()!.click();
  expect(menu()).toBeNull();
});

test('multiple carets do not expose an ambiguous source entry', async () => {
  const { view } = fixture('正文内容', [], [EditorState.allowMultipleSelections.of(true)]);
  view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(3)]) });
  await measured();
  expect(plus()?.style.visibility).toBe('hidden');
  plus()!.click();
  expect(menu()).toBeNull();
});

test('selecting text hands interaction to the existing toolbar without sharing its state', async () => {
  const executeNativeFormat = vi.fn();
  const { view } = fixture('正文内容', [], [quillToolbar({ selection: nativeSelection,
    isLivePreview: () => true,
    executeNativeFormat,
    executeNativeHighlight: () => {},
    openHighlightMenu: () => () => {}
  })]);
  await open();
  menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  view.dispatch({ selection: { anchor: 1, head: 3 } });
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await measured();
  expect(plus()?.style.visibility).toBe('hidden');
  const toolbar = document.querySelector('[role="toolbar"]');
  expect(toolbar).not.toBeNull();
  toolbar!.querySelector<HTMLButtonElement>('[aria-label="加粗"]')!.click();
  expect(executeNativeFormat).toHaveBeenCalledOnce();
  expect(menu()).toBeNull();
});


test('the insertion menu exposes exactly the specified actions, icons and three visual separators', async () => {
  fixture();
  await open();
  const items = [...menu()!.querySelectorAll('[role="menuitem"]')];
  expect(items.map(item => item.getAttribute('aria-label'))).toEqual([
    '文本', '标题 1', '标题 2', '标题 3', '标题 4', '标题 5', '标题 6',
    '项目符号列表', '有序列表', '待办事项', '代码', '引用', '标注', '公式区块', '表格', '分隔线'
  ]);
  expect(items.every(item => item.querySelector('.line-insert-icon svg') !== null)).toBe(true);
  expect([...menu()!.querySelectorAll('[role="separator"]')].map(el => el.previousElementSibling?.getAttribute('aria-label')))
    .toEqual(['标题 6', '待办事项', '公式区块']);
});

test('format marks are independent of focus and disabled native actions remain visible and inert', async () => {
  const { app, executeCommandById } = fixture('## 正文', [['header-2']]);
  app.commands.commands['editor:set-heading-1'] = { editorCheckCallback: () => false };
  await open();
  expect(heading2().querySelector('.line-insert-check')?.textContent).toBe('✓');
  const disabled = menu()!.querySelector<HTMLButtonElement>('[data-action="heading1"]')!;
  expect(disabled.disabled).toBe(true);
  disabled.click();
  disabled.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(executeCommandById).not.toHaveBeenCalled();
  expect(menu()).not.toBeNull();
  expect(menu()!.querySelector('[data-action="table"] .line-insert-check')).toBeNull();
});

// Regression matrix over the public UI and external command boundary.
test.each([
  ['text', 'editor:set-heading-0'], ['heading1', 'editor:set-heading-1'], ['heading2', 'editor:set-heading-2'],
  ['heading3', 'editor:set-heading-3'], ['heading4', 'editor:set-heading-4'], ['heading5', 'editor:set-heading-5'],
  ['heading6', 'editor:set-heading-6'], ['bulletList', 'editor:toggle-bullet-list'],
  ['orderedList', 'editor:toggle-numbered-list'], ['task', 'editor:toggle-checklist-status'],
  ['code', 'editor:insert-codeblock'], ['quote', 'editor:toggle-blockquote'], ['callout', 'editor:insert-callout'],
  ['math', 'editor:insert-mathblock'], ['table', 'editor:insert-table'], ['divider', 'editor:insert-horizontal-rule']
])('choosing %s routes once and leaves the native result selection intact', async (action, command) => {
  const { view, executeCommandById } = fixture();
  await open();
  const item = menu()!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  item.click();
  item.click();
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith(command);
  expect(menu()).toBeNull();
  expect(view.state.selection.main.anchor).toBe(5);
  expect(view.hasFocus).toBe(true);
});

test('an action that becomes unavailable while the menu is open closes silently without executing', async () => {
  const { app, executeCommandById, view } = fixture();
  await open();
  delete app.commands.commands['editor:set-heading-2'];
  heading2().click();
  expect(menu()).toBeNull();
  expect(executeCommandById).not.toHaveBeenCalled();
  expect(view.state.doc.toString()).toBe('正文内容');
});

test('opening focuses a search field without changing the source document or caret', async () => {
  const { view } = fixture();
  await open();
  const search = menu()!.querySelector<HTMLInputElement>('input[aria-label="搜索操作"]');
  expect(search).not.toBeNull();
  expect(document.activeElement).toBe(search);
  expect(view.state.doc.toString()).toBe('正文内容');
  expect(view.state.selection.main.anchor).toBe(2);
  expect(menu()).not.toBeNull();
});

test('search matches Chinese and English aliases while preserving the original native routing', async () => {
  const { view, executeCommandById } = fixture();
  await open();
  const input = menu()!.querySelector<HTMLInputElement>('input')!;
  for (const [query, expected] of [
    ['普通段落', ['文本']], ['正文', ['文本']], ['todo', ['待办事项']], ['待办', ['待办事项']],
    ['CALLOUT', ['标注']], ['heading', ['标题 1', '标题 2', '标题 3', '标题 4', '标题 5', '标题 6']],
    ['标题 2', ['标题 2']], ['  table  ', ['表格']], ['分隔线', ['分隔线']]
  ] as const) {
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect([...menu()!.querySelectorAll('[role="menuitem"]')].map(el => el.getAttribute('aria-label'))).toEqual(expected);
    expect(view.state.doc.toString()).toBe('正文内容');
    expect(view.state.selection.main.anchor).toBe(2);
  }
  menu()!.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:insert-horizontal-rule');
});


test('keyboard selection starts at the first enabled action, skips disabled items and Enter executes once', async () => {
  const { app, executeCommandById } = fixture();
  app.commands.commands['editor:set-heading-0'] = { editorCheckCallback: () => false };
  app.commands.commands['editor:set-heading-2'] = { editorCheckCallback: () => false };
  await open();
  expect(menu()!.querySelector('[aria-current="true"]')?.getAttribute('aria-label')).toBe('标题 1');
  const retained = menu()!;
  await userEvent.keyboard('{ArrowDown}');
  expect(menu()!.querySelector('[aria-current="true"]')?.getAttribute('aria-label')).toBe('标题 3');
  await userEvent.keyboard('{ArrowUp}');
  expect(menu()!.querySelector('[aria-current="true"]')?.getAttribute('aria-label')).toBe('标题 1');
  await userEvent.keyboard('{Enter}');
  retained.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:set-heading-1');
  expect(menu()).toBeNull();
});

test('unmatched and entirely disabled search results cannot be executed with Enter', async () => {
  const { app, executeCommandById, view } = fixture();
  app.commands.commands['editor:insert-callout'] = { editorCheckCallback: () => false };
  await open();
  await userEvent.type(menu()!.querySelector<HTMLInputElement>('input')!, 'callout');
  expect(menu()!.querySelector('[aria-current="true"]')).toBeNull();
  expect(menu()!.querySelector<HTMLButtonElement>('[role="menuitem"]')!.disabled).toBe(true);
  await userEvent.keyboard('{Enter}');
  const input = menu()!.querySelector<HTMLInputElement>('input')!;
  await userEvent.clear(input);
  await userEvent.type(input, 'no-such-action');
  expect(menu()!.textContent).toContain('没有匹配的操作');
  await userEvent.keyboard('{Enter}');
  expect(executeCommandById).not.toHaveBeenCalled();
  expect(view.state.doc.toString()).toBe('正文内容');
  await userEvent.keyboard('{Escape}');
  expect(view.hasFocus).toBe(true);
  expect(view.state.selection.main.anchor).toBe(2);
});


test('the public open command checks eligibility without opening, then shares the click menu and source', async () => {
  const { entry, view, executeCommandById } = fixture();
  expect(entry.open(view, true)).toBe(true);
  expect(menu()).toBeNull();
  expect(entry.open(view)).toBe(true);
  expect(document.activeElement).toBe(menu()!.querySelector('input'));
  expect(view.state.selection.main.anchor).toBe(2);
  heading2().click();
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:set-heading-2');
});

test('the Obsidian command has no default hotkey and opens only the callback source editor', async () => {
  const { entry, editor, view, executeCommandById } = fixture();
  Object.assign(editor, { cm: view });
  const host = await import('../src/host/native-insertion');
  const command = host.createInsertionMenuCommand(entry.open);
  expect(command.id).toBe('open-insert-menu');
  expect(command.name).toBe('打开插入菜单');
  expect(command.hotkeys).toBeUndefined();
  expect(command.editorCheckCallback!(true, {} as Editor, {} as MarkdownFileInfo)).toBe(false);
  expect(command.editorCheckCallback!(true, editor, { editor } as MarkdownFileInfo)).toBe(true);
  expect(menu()).toBeNull();
  expect(command.editorCheckCallback!(false, editor, { editor } as MarkdownFileInfo)).toBe(true);
  expect(document.activeElement).toBe(menu()!.querySelector('input'));
  heading2().click();
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:set-heading-2');
});

test('search resets the active result and list scroll, and reopening clears all temporary search state', async () => {
  fixture();
  await open();
  const input = menu()!.querySelector<HTMLInputElement>('input')!;
  const list = menu()!.querySelector<HTMLElement>('.line-insert-list')!;
  // Constrain the list here; final viewport fitting belongs to task 04.
  list.style.cssText = 'height:80px;overflow:auto';
  list.scrollTop = 100;
  expect(list.scrollTop).toBeGreaterThan(0);
  await userEvent.type(input, 'heading');
  expect(list.scrollTop).toBe(0);
  expect(menu()!.querySelector('[aria-current="true"]')?.getAttribute('aria-label')).toBe('标题 1');
  await userEvent.keyboard('{ArrowDown}{Escape}');
  await open();
  expect(menu()!.querySelector<HTMLInputElement>('input')!.value).toBe('');
  expect(menu()!.querySelector<HTMLElement>('.line-insert-list')!.scrollTop).toBe(0);
  expect(menu()!.querySelector('[aria-current="true"]')?.getAttribute('aria-label')).toBe('文本');
});

// Qualification and cleanup regressions apply equally to the new command entry.
test.each([
  'HyperMD-codeblock', 'HyperMD-codeblock_HyperMD-codeblock-begin',
  'HyperMD-math', 'math-block', 'HyperMD-table-row', 'hmd-frontmatter'
])('the command cannot open the menu in excluded host scope %s', async scope => {
  const { entry, view } = fixture('受限行', [[scope]]);
  expect(entry.open(view, true)).toBe(false);
  expect(entry.open(view)).toBe(false);
  expect(menu()).toBeNull();
});

test('the command rejects selections, missing sources and read-only views just like the plus entry', async () => {
  const { entry, view, source } = fixture();
  view.dispatch({ selection: { anchor: 0, head: 2 } });
  expect(entry.open(view)).toBe(false);
  view.dispatch({ selection: { anchor: 2 }, effects: source.reconfigure([]) });
  expect(entry.open(view)).toBe(false);
  const readOnly = fixture('正文', [], [EditorState.readOnly.of(true)]);
  expect(readOnly.entry.open(readOnly.view, true)).toBe(false);
  expect(readOnly.entry.open(readOnly.view)).toBe(false);
  expect(menu()).toBeNull();
});

test('destroyed sources reject the command and retained search or Enter events cannot edit', async () => {
  const { entry, view, executeCommandById } = fixture();
  entry.open(view);
  const retained = menu()!;
  const search = retained.querySelector<HTMLInputElement>('input')!;
  view.destroy();
  search.value = 'heading';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  retained.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(entry.open(view)).toBe(false);
  expect(menu()).toBeNull();
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('IME confirmation does not execute an insertion before composition has finished', async () => {
  const { executeCommandById } = fixture();
  await open();
  menu()!.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  expect(executeCommandById).not.toHaveBeenCalled();
  expect(menu()).not.toBeNull();
});

test('native table-cell context rejects both entries even when the editor tree looks like prose', async () => {
  const { entry, view, editor } = fixture();
  Object.assign(editor, { inTableCell: true });
  view.dispatch({});
  await measured();
  expect(entry.open(view, true)).toBe(false);
  expect(entry.open(view)).toBe(false);
  plus()!.click();
  expect(menu()).toBeNull();
  expect(plus()!.style.visibility).toBe('hidden');
});

test('the menu fits the owner window near its bottom-right corner without scrolling the note', async () => {
  const { view, entry } = fixture();
  view.dom.parentElement!.style.cssText = `position:fixed;right:8px;bottom:8px;width:170px;height:80px`;
  await measured();
  const scrollTop = view.scrollDOM.scrollTop;
  entry.open(view);
  await measured();
  const rect = menu()!.getBoundingClientRect();
  const anchor = plus()!.getBoundingClientRect();
  expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
  expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
  expect(rect.top).toBeGreaterThanOrEqual(0);
  expect(rect.left).toBeGreaterThanOrEqual(0);
  expect(rect.bottom).toBeLessThanOrEqual(anchor.top + 1);
  expect(view.scrollDOM.scrollTop).toBe(scrollTop);
});

test('keyboard navigation scrolls only the operation list and keeps the search field fixed', async () => {
  const { view } = fixture();
  await open();
  await measured();
  const list = menu()!.querySelector<HTMLElement>('.line-insert-list')!;
  const search = menu()!.querySelector('input')!;
  const searchTop = search.getBoundingClientRect().top;
  const scrollTop = view.scrollDOM.scrollTop;
  const pageScroll = window.scrollY;
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
  await userEvent.keyboard('{ArrowUp}');
  const selected = menu()!.querySelector<HTMLElement>('[aria-current="true"]')!;
  expect(selected.getAttribute('aria-label')).toBe('分隔线');
  expect(selected.getBoundingClientRect().bottom).toBeLessThanOrEqual(list.getBoundingClientRect().bottom + 1);
  expect(list.scrollTop).toBeGreaterThan(0);
  expect(search.getBoundingClientRect().top).toBe(searchTop);
  expect(view.scrollDOM.scrollTop).toBe(scrollTop);
  expect(window.scrollY).toBe(pageScroll);
});

test('the open menu follows scrolling of the real CodeMirror scroller while the target remains visible', async () => {
  const doc = Array.from({ length: 80 }, (_, index) => `正文第 ${index + 1} 行`).join('\n');
  const { view } = fixture(doc, [], [EditorView.theme({ '&': { height: '200px' }, '.cm-scroller': { overflow: 'auto' } })]);
  view.dispatch({ selection: { anchor: view.state.doc.line(6).from + 1 } });
  await open();
  await measured();
  const top = menu()!.getBoundingClientRect().top;
  const anchorTop = plus()!.getBoundingClientRect().top;
  view.scrollDOM.scrollTop = 20;
  await vi.waitFor(() => expect(plus()!.getBoundingClientRect().top).toBeLessThan(anchorTop - 10));
  expect(menu()).not.toBeNull();
  expect(Math.abs(menu()!.getBoundingClientRect().top - (top - 20))).toBeLessThan(2);
  expect(view.scrollDOM.scrollTop).toBe(20);
});

test('scrolling the source target out of view closes the menu and removes its line hint', async () => {
  const doc = Array.from({ length: 80 }, (_, index) => `正文第 ${index + 1} 行`).join('\n');
  const { view, executeCommandById } = fixture(doc, [], [EditorView.theme({ '&': { height: '200px' }, '.cm-scroller': { overflow: 'auto' } })]);
  await open();
  const retained = heading2();
  view.scrollDOM.scrollTop = 500;
  await vi.waitFor(() => expect(menu()).toBeNull());
  expect(document.querySelector('.line-insert-target')).toBeNull();
  expect(plus()!.style.visibility).toBe('hidden');
  retained.click();
  expect(executeCommandById).not.toHaveBeenCalled();
  expect(view.scrollDOM.scrollTop).toBe(500);
});

test('a partially visible wrapped source line keeps its menu in the window until the whole line leaves', async () => {
  const text = '同一个源码行自动折行，菜单提示只属于这一行。'.repeat(50);
  const { view } = fixture(text + '\n后续正文', [], [EditorView.lineWrapping, EditorView.theme({ '&': { height: '180px' }, '.cm-scroller': { overflow: 'auto' } })]);
  await open();
  view.scrollDOM.scrollTop = 100;
  await measured();
  await measured();
  expect(menu()).not.toBeNull();
  const rect = menu()!.getBoundingClientRect();
  expect(rect.top).toBeGreaterThanOrEqual(0);
  expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
  expect(plus()!.style.visibility).toBe('hidden');
});


test.each([false, true])('enabling and removing insertion preserves the host layout (centered=%s)', async centered => {
  const { view, insertion, entry } = fixture('正文自动换行测试。'.repeat(30), [], [EditorView.lineWrapping]);
  if (centered) {
    view.dom.parentElement!.style.width = '800px';
    Object.assign(view.contentDOM.style, { flex: '0 0 auto', width: '320px', marginInline: 'auto' });
  }
  await measured();
  const snapshot = () => {
    const line = view.contentDOM.querySelector('.cm-line')!.getBoundingClientRect();
    return { left: line.left, width: line.width, height: line.height, editorWidth: view.dom.getBoundingClientRect().width };
  };
  const enabled = snapshot();
  view.dispatch({ effects: insertion.reconfigure([]) });
  await measured();
  expect(snapshot()).toEqual(enabled);
  expect(plus()).toBeNull();
  view.dispatch({ effects: insertion.reconfigure(entry.extension) });
  await vi.waitFor(() => expect(plus()?.style.visibility).toBe('visible'));
  expect(snapshot()).toEqual(enabled);
  expect(plus()!.getBoundingClientRect().right).toBeCloseTo(enabled.left - 8, 0);
});

test.each(['', '# 大标题', '  - 缩进列表', '> 引用'])('entry aligns with the content column and first row for %j', async doc => {
  const { view } = fixture(doc, [], [EditorView.decorations.of(Decoration.set([
    Decoration.line({ attributes: { style: doc.startsWith('#') ? 'font-size:32px;line-height:1.6' : 'padding-left:60px' } }).range(0)
  ]))]);
  await vi.waitFor(() => expect(plus()?.style.visibility).toBe('visible'));
  const button = plus()!.getBoundingClientRect();
  const first = view.coordsAtPos(0)!;
  expect(button.right).toBeCloseTo(view.contentDOM.getBoundingClientRect().left + 40 - 8, 0);
  expect((button.top + button.bottom) / 2).toBeCloseTo((first.top + first.bottom) / 2, 0);
  expect(button.width).toBe(24);
  expect(button.height).toBe(24);
});

test('entry follows centered content when its pane resizes without a window resize', async () => {
  const { view } = fixture();
  view.dom.parentElement!.style.width = '800px';
  Object.assign(view.contentDOM.style, { flex: '0 0 auto', width: '320px', marginInline: 'auto' });
  await vi.waitFor(() => expect(plus()?.style.visibility).toBe('visible'));
  await vi.waitFor(() => expect(plus()!.getBoundingClientRect().right).toBeCloseTo(view.contentDOM.querySelector('.cm-line')!.getBoundingClientRect().left - 8, 0));
  const left = plus()!.getBoundingClientRect().left;
  view.dom.parentElement!.style.width = '600px';
  await vi.waitFor(() => expect(plus()!.getBoundingClientRect().left).toBeCloseTo(left - 100, 0));
  expect(plus()!.getBoundingClientRect().right).toBeCloseTo(view.contentDOM.querySelector('.cm-line')!.getBoundingClientRect().left - 8, 0);
});

test('insufficient space hides only the button while the command and an open menu stay usable', async () => {
  const { view, entry, executeCommandById } = fixture('正文', [], [lineNumbers(), foldGutter()]);
  await open();
  view.contentDOM.style.paddingLeft = '0';
  await vi.waitFor(() => expect(plus()?.style.visibility).toBe('hidden'));
  expect(menu()).not.toBeNull();
  heading2().click();
  expect(executeCommandById).toHaveBeenCalledOnce();
  expect(menu()).toBeNull();
  expect(entry.open(view)).toBe(true);
  await vi.waitFor(() => expect(menu()!.style.opacity).toBe('1'));
  expect(plus()?.style.visibility).toBe('hidden');
});

test('the paragraph entry clears line numbers and folding controls and does not shift when hidden', async () => {
  const { view } = fixture('标题行\n下一行\n  - 列表行', [], [lineNumbers(), foldGutter(), foldService.of((_state, from) => from === 0 ? { from: 3, to: 7 } : null)]);
  await measured();
  const button = plus()!;
  const line = view.contentDOM.querySelector('.cm-line')!;
  const left = line.getBoundingClientRect().left;
  const bandLeft = button.getBoundingClientRect().left;
  expect(button.getBoundingClientRect().left).toBeGreaterThanOrEqual(view.dom.querySelector('.cm-gutters')!.getBoundingClientRect().right);
  expect(button.getBoundingClientRect().right).toBeCloseTo(view.contentDOM.getBoundingClientRect().left + 40 - 8, 0);
  expect(view.dom.querySelector('.cm-foldGutter')).not.toBeNull();
  const rect = button.getBoundingClientRect();
  expect(document.elementFromPoint(rect.left + 12, rect.top + 12)).toBe(button);
  view.dispatch({ selection: { anchor: 0, head: 2 } });
  await measured();
  expect(line.getBoundingClientRect().left).toBe(left);
  view.dispatch({ selection: { anchor: view.state.doc.line(3).from + 3 } });
  await measured();
  expect(button.getBoundingClientRect().left).toBe(bandLeft);
});

test.each(['top-left', 'top-right', 'bottom-left', 'bottom-right'])('menu stays inside the window at %s', async corner => {
  const { view, entry } = fixture();
  const vertical = corner.startsWith('top') ? 'top:8px' : 'bottom:8px';
  const horizontal = corner.endsWith('left') ? 'left:8px' : 'right:8px';
  view.dom.parentElement!.style.cssText = `position:fixed;${vertical};${horizontal};width:170px;height:70px`;
  await measured();
  entry.open(view);
  await measured();
  const rect = menu()!.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0);
  expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
  expect(rect.top).toBeGreaterThanOrEqual(0);
  expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
});

test('menu geometry uses its own document window rather than the main window', async () => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:360px;height:260px';
  document.body.append(frame);
  const owner = frame.contentDocument!;
  const style = owner.createElement('style');
  style.textContent = [...document.querySelectorAll('style')].map(el => el.textContent).join('\n');
  owner.head.append(style);
  const { view, entry } = fixture('独立文档', [], [], owner);
  view.dom.parentElement!.style.cssText = 'position:fixed;right:8px;bottom:8px;width:170px;height:60px';
  entry.open(view);
  const ownMenu = owner.querySelector<HTMLElement>('[role="menu"][aria-label="插入"]')!;
  await vi.waitFor(() => expect(ownMenu.style.opacity).toBe('1'));
  const ownButton = owner.querySelector<HTMLElement>('.line-insert-button')!;
  expect(ownButton.style.visibility).toBe('visible');
  expect(ownButton.getBoundingClientRect().right).toBeCloseTo(view.contentDOM.querySelector('.cm-line')!.getBoundingClientRect().left - 8, 0);
  const rect = ownMenu.getBoundingClientRect();
  expect(rect.right).toBeLessThanOrEqual(owner.defaultView!.innerWidth);
  expect(rect.bottom).toBeLessThanOrEqual(owner.defaultView!.innerHeight);
  expect(document.querySelector('[role="menu"][aria-label="插入"]')).toBeNull();
});

test('losing the source window closes the menu without restoring editor focus or reopening on return', async () => {
  const { view, executeCommandById } = fixture();
  await open();
  const item = heading2();
  window.dispatchEvent(new Event('blur'));
  expect(menu()).toBeNull();
  expect(view.hasFocus).toBe(false);
  expect(document.querySelector('.line-insert-target')).toBeNull();
  window.dispatchEvent(new Event('focus'));
  item.click();
  expect(menu()).toBeNull();
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('focus moving to another control cancels but moving inside the search menu does not', async () => {
  fixture();
  await open();
  heading2().focus({ preventScroll: true });
  expect(menu()).not.toBeNull();
  menu()!.querySelector<HTMLInputElement>('input')!.focus({ preventScroll: true });
  const outside = document.createElement('input');
  document.body.append(outside);
  outside.focus();
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(outside);
});


test.each(['active-leaf-change', 'file-open'])('a host %s cancels the menu even when the document and selection stay identical', async event => {
  const { emit, executeCommandById, view } = fixture();
  await open();
  const retained = heading2();
  emit(event);
  expect(menu()).toBeNull();
  expect(view.hasFocus).toBe(false);
  expect(view.state.selection.main.anchor).toBe(2);
  expect(document.querySelector('.line-insert-target')).toBeNull();
  retained.click();
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('an inactive source cannot be reopened by a stale command or retained plus button', async () => {
  const { app, entry, view, executeCommandById } = fixture();
  const retainedPlus = plus()!;
  app.workspace.activeEditor.editor = {} as Editor;
  expect(entry.open(view, true)).toBe(false);
  retainedPlus.click();
  expect(menu()).toBeNull();
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('unloading the source document releases its menu, entry and late events', async () => {
  const { entry, view, executeCommandById } = fixture();
  await open();
  const retained = menu()!;
  const item = heading2();
  window.dispatchEvent(new Event('pagehide'));
  expect(menu()).toBeNull();
  expect(plus()).toBeNull();
  expect(document.querySelector('.line-insert-target')).toBeNull();
  expect(entry.open(view)).toBe(false);
  retained.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  item.click();
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('a hidden source document cancels without reopening when it becomes visible', async () => {
  fixture();
  await open();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  try {
    document.dispatchEvent(new Event('visibilitychange'));
    expect(menu()).toBeNull();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(menu()).toBeNull();
  } finally { visibility.mockRestore(); }
});

test('resizing the source window re-fits the open menu without scrolling its note', async () => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:360px;height:400px';
  document.body.append(frame);
  const owner = frame.contentDocument!;
  const style = owner.createElement('style');
  style.textContent = [...document.querySelectorAll('style')].map(el => el.textContent).join('\n');
  owner.head.append(style);
  const { view, entry } = fixture('窗口调整', [], [], owner);
  view.dom.parentElement!.style.cssText = 'position:fixed;right:8px;bottom:8px;width:170px;height:60px';
  entry.open(view);
  const ownMenu = owner.querySelector<HTMLElement>('[role="menu"][aria-label="插入"]')!;
  await vi.waitFor(() => expect(ownMenu.style.opacity).toBe('1'));
  const scroll = view.scrollDOM.scrollTop;
  frame.style.cssText = 'width:220px;height:180px';
  await vi.waitFor(() => {
    const rect = ownMenu.getBoundingClientRect();
    expect(rect.bottom).toBeLessThanOrEqual(owner.defaultView!.innerHeight);
    expect(rect.right).toBeLessThanOrEqual(owner.defaultView!.innerWidth);
  });
  expect(view.scrollDOM.scrollTop).toBe(scroll);
});


// Lifecycle regressions: public editor instances and external host events only.
test('opening a second editor menu leaves only its source interaction and cannot edit the first note', async () => {
  const first = fixture('第一篇正文');
  first.entry.open(first.view);
  const staleItem = heading2();
  const second = fixture('第二篇正文');
  second.entry.open(second.view);
  expect(document.querySelectorAll('[role="menu"][aria-label="插入"]')).toHaveLength(1);
  staleItem.click();
  expect(first.executeCommandById).not.toHaveBeenCalled();
  expect(first.view.state.doc.toString()).toBe('第一篇正文');
  heading2().click();
  expect(second.executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:set-heading-2');
  expect(first.view.state.doc.toString()).toBe('第一篇正文');
});

test('extension removal cleans an open menu and pending measurements without retaining a usable command', async () => {
  const { view, entry, emit, executeCommandById } = fixture();
  entry.open(view);
  const retained = menu()!;
  const item = heading2();
  view.dispatch({ effects: StateEffect.reconfigure.of([]) });
  emit('active-leaf-change');
  window.dispatchEvent(new Event('resize'));
  await measured();
  expect(menu()).toBeNull();
  expect(plus()).toBeNull();
  expect(document.querySelector('.line-insert-target')).toBeNull();
  expect(entry.open(view)).toBe(false);
  retained.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  item.click();
  expect(executeCommandById).not.toHaveBeenCalled();
});

test('confirmed native edits may update the document and selection without being cancelled or restored', async () => {
  const { view, emit, executeCommandById } = fixture();
  executeCommandById.mockImplementationOnce(() => {
    emit('file-open');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '原生结果' }, selection: { anchor: 3, head: 1 } });
    return true;
  });
  await open();
  const item = heading2();
  item.click();
  item.click();
  expect(executeCommandById).toHaveBeenCalledExactlyOnceWith('editor:set-heading-2');
  expect(view.state.doc.toString()).toBe('原生结果');
  expect(view.state.selection.main.anchor).toBe(3);
  expect(view.state.selection.main.head).toBe(1);
  expect(view.hasFocus).toBe(true);
  expect(menu()).toBeNull();
});


test('switching to reading mode cancels without a document change, while a source layout resize does not', async () => {
  const { emit, setMode } = fixture();
  await open();
  emit('layout-change');
  expect(menu()).not.toBeNull();
  setMode('preview');
  emit('layout-change');
  expect(menu()).toBeNull();
});

test('a retained editing view cannot open either entry while its host is in reading mode', async () => {
  const { setMode, entry, view } = fixture();
  setMode('preview');
  expect(entry.open(view, true)).toBe(false);
  plus()!.click();
  expect(menu()).toBeNull();
});

test('menu controls inherit the owner document typography instead of browser button defaults', async () => {
  const previous = document.body.style.cssText;
  document.body.style.fontFamily = 'monospace';
  document.body.style.fontSize = '17px';
  try {
    fixture();
    await open();
    expect(getComputedStyle(heading2()).fontFamily).toBe('monospace');
    expect(getComputedStyle(menu()!.querySelector('input')!).fontSize).toBe('17px');
  } finally { document.body.style.cssText = previous; }
});

test('the existing highlight entry remains usable between line-menu interactions without sharing targets', async () => {
  const executeNativeHighlight = vi.fn();
  let choose: ((color: 'yellow') => void) | undefined;
  const { view, executeCommandById } = fixture('正文内容', [], [quillToolbar({ selection: nativeSelection,
    isLivePreview: () => true,
    executeNativeFormat: () => {},
    executeNativeHighlight,
    openHighlightMenu: (_position, _doc, onChoose) => { choose = onChoose; return () => {}; }
  })]);
  await open();
  await userEvent.keyboard('{Escape}');
  view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  view.dispatch({ selection: { anchor: 1, head: 3 } });
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await measured();
  expect(plus()!.style.visibility).toBe('hidden');
  document.querySelector<HTMLButtonElement>('[role="toolbar"] [aria-label="高亮"]')!.click();
  expect(choose).toBeTypeOf('function');
  choose!('yellow');
  expect(executeNativeHighlight).toHaveBeenCalledOnce();
  expect(executeCommandById).not.toHaveBeenCalled();
  view.dispatch({ selection: { anchor: 2 } });
  await open();
  expect(view.state.selection.main.anchor).toBe(2);
});

test('focusing a different document closes the first document menu rather than leaving parallel menus', async () => {
  const first = fixture();
  first.entry.open(first.view);
  const stale = heading2();
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:360px;height:260px';
  document.body.append(frame);
  const owner = frame.contentDocument!;
  const style = owner.createElement('style');
  style.textContent = [...document.querySelectorAll('style')].map(el => el.textContent).join('\n');
  owner.head.append(style);
  const second = fixture('另一文档', [], [], owner);
  second.entry.open(second.view);
  expect(menu()).toBeNull();
  expect(owner.querySelectorAll('[role="menu"][aria-label="插入"]')).toHaveLength(1);
  stale.click();
  expect(first.executeCommandById).not.toHaveBeenCalled();
  expect(second.executeCommandById).not.toHaveBeenCalled();
});

test('menu icons and labels share columns even when host buttons default to centered content', async () => {
  // Obsidian's desktop button rule centers flex content; checked items also have an auto margin.
  const hostStyle = document.createElement('style');
  hostStyle.textContent = 'button { justify-content: center; height: 32px; white-space: nowrap; }';
  document.body.append(hostStyle);
  fixture('## 正文', [['header-2']]);
  await open();
  await measured();
  const items = [...menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  const iconLeft = items[0].querySelector('.line-insert-icon')!.getBoundingClientRect().left;
  const labelLeft = items[0].children[1].getBoundingClientRect().left;
  for (const item of items) {
    expect(Math.abs(item.querySelector('.line-insert-icon')!.getBoundingClientRect().left - iconLeft)).toBeLessThan(1);
    expect(Math.abs(item.children[1].getBoundingClientRect().left - labelLeft)).toBeLessThan(1);
  }
});

test('a narrow menu reserves the icon and format columns without letting long labels push them out', async () => {
  const hostStyle = document.createElement('style');
  hostStyle.textContent = 'button { justify-content: center; height: 32px; white-space: nowrap; }';
  document.body.append(hostStyle);
  fixture('## 正文', [['header-2']]);
  await open();
  menu()!.style.width = '176px';
  await measured();
  const check = heading2().querySelector('.line-insert-check')!.getBoundingClientRect();
  const items = [...menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  for (const item of items) {
    expect(item.querySelector('.line-insert-icon')!.getBoundingClientRect().width).toBe(18);
    expect(item.children[1].getBoundingClientRect().right).toBeLessThanOrEqual(check.left - 7);
    expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth);
  }
  expect(menu()!.querySelector('[data-action="bulletList"]')!.getAttribute('aria-label')).toBe('项目符号列表');
});

test('the search field, rows and group dividers use consistent menu spacing', async () => {
  fixture();
  await open();
  await measured();
  const items = [...menu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const rowHeight = items[0].getBoundingClientRect().height;
  const search = menu()!.querySelector('input')!.getBoundingClientRect();
  expect(search.height).toBe(rowHeight);
  for (const item of items) expect(item.getBoundingClientRect().height).toBe(rowHeight);
  const iconLeft = items[0].querySelector('.line-insert-icon')!.getBoundingClientRect().left;
  for (const divider of menu()!.querySelectorAll('[role="separator"]')) {
    expect(divider.getBoundingClientRect().left).toBe(iconLeft);
  }
});

test('filtering between long and short lists does not move the menu columns sideways', async () => {
  fixture('## 正文', [['header-2']]);
  await open();
  await measured();
  const iconLeft = heading2().querySelector('.line-insert-icon')!.getBoundingClientRect().left;
  const checkRight = heading2().querySelector('.line-insert-check')!.getBoundingClientRect().right;
  const search = menu()!.querySelector<HTMLInputElement>('input')!;
  await userEvent.type(search, 'heading 2');
  await measured();
  expect(heading2().querySelector('.line-insert-icon')!.getBoundingClientRect().left).toBe(iconLeft);
  expect(heading2().querySelector('.line-insert-check')!.getBoundingClientRect().right).toBe(checkRight);
});
