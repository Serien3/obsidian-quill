import '../styles.css';
import { userEvent } from 'vitest/browser';
import { afterEach, expect, test, vi } from 'vitest';
import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, isolateHistory, redo, undo } from '@codemirror/commands';
import type { App, Editor, MarkdownFileInfo } from 'obsidian';
import { lineInsertMenu } from '../src/insertion/insert-menu';
import { createNativeInsertion } from '../src/host/native-insertion';
import { hostLanguage } from './helpers/host-language';
import { hostWorkspace } from './helpers/host-workspace';

const views: EditorView[] = [];
afterEach(() => { views.splice(0).forEach(view => view.destroy()); document.body.replaceChildren(); });
const menu = () => document.querySelector<HTMLElement>('.line-insert-menu');
const action = (id: string) => menu()!.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;

function fixture(doc = '', scopes: readonly (readonly string[])[] = [], keys = true) {
  let view: EditorView;
  const editor = { focus: () => view.focus() } as Editor;
  const info = StateField.define<MarkdownFileInfo>({ create: () => ({ editor } as MarkdownFileInfo), update: value => value });
  const context = hostWorkspace(editor);
  const execute = vi.fn((_id: string) => {
    view.dispatch({ changes: { from: 0, insert: '## ' }, selection: { anchor: view.state.selection.main.head + 3 },
      annotations: isolateHistory.of('full'), userEvent: 'input' });
    return true;
  });
  const commands = Object.fromEntries(['set-heading-0', 'set-heading-1', 'set-heading-2', 'set-heading-3',
    'set-heading-4', 'set-heading-5', 'set-heading-6', 'toggle-bullet-list', 'toggle-numbered-list',
    'toggle-checklist-status', 'insert-codeblock', 'toggle-blockquote', 'insert-callout', 'insert-mathblock',
    'insert-table', 'insert-horizontal-rule'].map(id => [`editor:${id}`, {}]));
  const app = { workspace: context.workspace, commands: { commands, executeCommandById: execute } };
  const host = createNativeInsertion(app as unknown as App, info);
  const entry = lineInsertMenu(host, () => {});
  const parent = document.body.appendChild(document.createElement('div'));
  parent.style.cssText = 'width:500px;height:300px;margin:50px';
  view = new EditorView({ parent, state: EditorState.create({ doc, selection: { anchor: doc.length },
    extensions: [info, hostLanguage(scopes), history(), keys ? keymap.of([...defaultKeymap, ...historyKeymap]) : [], entry.extension] }) });
  views.push(view);
  view.focus();
  return { view, execute, app, editor, entry, ...context };
}

async function type(text: string) { await userEvent.keyboard(text); }

test('inline slash searches without moving focus and consumes only its query', async () => {
  const { view, execute } = fixture('今天 ');
  await type('/heading 2');
  expect(menu()).not.toBeNull();
  expect(menu()!.querySelector('input')).toBeNull();
  expect(view.hasFocus).toBe(true);
  expect(action('heading2').getAttribute('aria-current')).toBe('true');
  expect(view.contentDOM.getAttribute('aria-activedescendant')).toBe(action('heading2').id);
  await type('{Enter}');
  expect(execute).toHaveBeenCalledExactlyOnceWith('editor:set-heading-2');
  expect(view.state.doc.toString()).toBe('## 今天 ');
  expect(menu()).toBeNull();
  expect(view.contentDOM.hasAttribute('aria-activedescendant')).toBe(false);
});

test('query removal and non-adjacent native edits undo together, isolated from later typing', async () => {
  const { view } = fixture('正文 ');
  await type('/h2');
  const before = view.state;
  await type('{Enter}');
  const result = view.state;
  await type('后');
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(result.doc.toString());
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(before.doc.toString());
  expect(view.state.selection.eq(before.selection)).toBe(true);
  expect(menu()).toBeNull();
  expect(redo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(result.doc.toString());
  expect(menu()).toBeNull();
});

test.each(['https:', '目录', 'word'])('does not trigger after non-whitespace: %s', async prefix => {
  fixture(prefix);
  await type('/');
  expect(menu()).toBeNull();
});

test.each(['HyperMD-codeblock', 'HyperMD-math', 'HyperMD-table-row', 'hmd-frontmatter'])('does not trigger in %s', async scope => {
  fixture('', [[scope]]);
  await type('/');
  expect(menu()).toBeNull();
});

test.each([
  ['# ', ['header-1']], ['- ', ['formatting-list-ul']], ['> ', ['quote']], ['>', ['quote']],
  ['- [ ] ', ['formatting-list-ul', 'formatting-task']]
] as const)('triggers at structured body start: %s', async (prefix, scopes) => {
  fixture(prefix, [scopes]);
  await type('/');
  expect(menu()).not.toBeNull();
});

test('Escape preserves the query and only a newly typed slash can reopen', async () => {
  const { view, execute } = fixture();
  await type('/h2{Escape}');
  expect(menu()).toBeNull();
  expect(view.state.doc.toString()).toBe('/h2');
  await type('x');
  expect(menu()).toBeNull();
  await type(' /');
  expect(menu()).not.toBeNull();
  expect(execute).not.toHaveBeenCalled();
});

test('deletion filters the query, then deleting slash closes it', async () => {
  const { view } = fixture();
  await type('/h2{Backspace}');
  expect(action('heading1')).not.toBeNull();
  await type('{Backspace}{Backspace}');
  expect(view.state.doc.toString()).toBe('');
  expect(menu()).toBeNull();
});

test('no results and Tab return control to normal editing', async () => {
  const { view, execute } = fixture();
  await type('/zzzz');
  expect(menu()!.textContent).toContain('没有匹配的操作');
  await type('{Enter}');
  expect(view.state.doc.toString()).toBe('/zzzz\n');
  expect(menu()).toBeNull();
  await type('/h2{Tab}');
  expect(menu()).toBeNull();
  expect(view.state.doc.toString()).toContain('/h2');
  expect(execute).not.toHaveBeenCalled();
});

test('arrows select and mouse confirmation does not need an input focus', async () => {
  const { view, execute } = fixture();
  await type('/heading{ArrowDown}');
  expect(action('heading2').getAttribute('aria-current')).toBe('true');
  await userEvent.click(action('heading2'));
  expect(view.hasFocus).toBe(true);
  expect(view.state.doc.toString()).toBe('## ');
  expect(execute).toHaveBeenCalledTimes(1);
});

test('paste and programmatic changes do not create sessions', () => {
  const { view } = fixture();
  view.dispatch({ changes: { from: 0, insert: '/' }, selection: { anchor: 1 }, userEvent: 'input.paste' });
  expect(menu()).toBeNull();
  view.dispatch({ changes: { from: 0, to: 1, insert: '/' } });
  expect(menu()).toBeNull();
});

test('cursor motion and external edits invalidate stale menu callbacks', async () => {
  const { view, execute } = fixture();
  await type('/h2');
  const old = action('heading2');
  await type('{ArrowLeft}');
  expect(menu()).toBeNull();
  old.click();
  expect(execute).not.toHaveBeenCalled();
  await type(' /');
  expect(menu()).not.toBeNull();
  view.dispatch({ changes: { from: 0, insert: 'other' }, userEvent: 'input.type' });
  expect(menu()).toBeNull();
});

test('composition keys are not consumed and committed query updates normally', async () => {
  // Omit editor keybindings: assert our handler leaves IME keys alone, not how
  // Chromium's EditContext handles synthetic DOM composition events.
  const { view, execute } = fixture('', [], false);
  await type('/');
  view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  view.dispatch({ changes: { from: 1, insert: '标题' }, selection: { anchor: 3 }, userEvent: 'input.type.compose' });
  expect(action('heading2')).not.toBeNull();
});

test('focus reentrancy stops execution before removing query', async () => {
  const { view, editor, execute } = fixture();
  await type('/h2');
  editor.focus = () => view.dispatch({ selection: { anchor: 0 } });
  action('heading2').click();
  expect(view.state.doc.toString()).toBe('/h2');
  expect(execute).not.toHaveBeenCalled();
});

test('command refusal restores query, but never overwrites partial native edits', async () => {
  const { view, execute } = fixture();
  await type('/h2');
  execute.mockImplementationOnce(() => false);
  action('heading2').click();
  expect(view.state.doc.toString()).toBe('/h2');
  await type(' /h2');
  execute.mockImplementationOnce(() => {
    view.dispatch({ changes: { from: 0, insert: 'native' } });
    return false;
  });
  action('heading2').click();
  expect(view.state.doc.toString()).toBe('native/h2 ');
});

test('disabled actions, source exit and destruction retain input', async () => {
  const { view, app, emit } = fixture();
  delete app.commands.commands['editor:set-heading-2'];
  await type('/h2');
  expect(action('heading2').disabled).toBe(true);
  await type('{Enter}');
  expect(view.state.doc.toString()).toBe('/h2\n');
  await type('/');
  emit('file-open');
  expect(menu()).toBeNull();
  await type(' /');
  view.destroy();
  views.splice(views.indexOf(view), 1);
  expect(menu()).toBeNull();
});

test('previous search results cannot execute after a new query or a new session', async () => {
  const { execute } = fixture();
  await type('/h');
  const old = action('heading1');
  await type('2');
  old.click();
  expect(execute).not.toHaveBeenCalled();
  const oldSession = action('heading2');
  await type('{Escape} /h1');
  oldSession.click();
  expect(execute).not.toHaveBeenCalled();
  action('heading1').click();
  expect(execute).toHaveBeenCalledOnce();
});

test('native commands with multiple edits and intervening selection still undo as one event', async () => {
  const { view, execute } = fixture('正文 ');
  execute.mockImplementationOnce(() => {
    view.dispatch({ changes: { from: 0, insert: '> ' }, userEvent: 'input' });
    view.dispatch({ selection: { anchor: 0 } });
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\nend' }, userEvent: 'input' });
    return true;
  });
  await type('/h2');
  const before = view.state;
  await type('{Enter}');
  const result = view.state.doc.toString();
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(before.doc.toString());
  expect(view.state.selection.eq(before.selection)).toBe(true);
  expect(redo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(result);
});

test('native no-op still consumes query as an independently undoable change', async () => {
  const { view, execute } = fixture('正文 ');
  execute.mockImplementationOnce(() => true);
  await type('/text');
  const before = view.state;
  await type('{Enter}');
  expect(view.state.doc.toString()).toBe('正文 ');
  undo(view);
  expect(view.state.doc.toString()).toBe(before.doc.toString());
  expect(view.state.selection.eq(before.selection)).toBe(true);
});

test('command availability is checked again after query preparation', async () => {
  const { view, app, execute } = fixture();
  await type('/h2');
  Object.assign(app.commands.commands['editor:set-heading-2'], {
    checkCallback: () => view.state.doc.toString().includes('/h2')
  });
  action('heading2').click();
  expect(execute).not.toHaveBeenCalled();
  expect(view.state.doc.toString()).toBe('/h2');
});

test('outside click closes without deleting query or restoring old focus', async () => {
  const { view } = fixture();
  await type('/h2');
  const input = document.body.appendChild(document.createElement('input'));
  await userEvent.click(input);
  expect(menu()).toBeNull();
  expect(view.state.doc.toString()).toBe('/h2');
  expect(document.activeElement).toBe(input);
});

test('button and slash share actions but not their focus or query input', async () => {
  const { view, entry } = fixture();
  entry.open(view);
  expect(menu()!.querySelector('input')).not.toBeNull();
  const buttonActions = [...menu()!.querySelectorAll<HTMLButtonElement>('[data-action]')].map(item => item.dataset.action);
  await type('{Escape}/');
  expect(menu()!.querySelector('input')).toBeNull();
  expect(view.hasFocus).toBe(true);
  expect([...menu()!.querySelectorAll<HTMLButtonElement>('[data-action]')].map(item => item.dataset.action)).toEqual(buttonActions);
  const stale = action('heading2');
  entry.open(view);
  expect(menu()).toBeNull();
  entry.open(view);
  stale.click();
  expect(menu()!.querySelector('input')).not.toBeNull();
});

test('slash popup follows the trigger instead of the line-side button', async () => {
  const { view } = fixture('正文内容正文内容正文内容 ');
  await type('/');
  await vi.waitFor(() => expect(menu()!.style.opacity).toBe('1'));
  const trigger = view.coordsAtPos(view.state.doc.length - 1)!;
  const rect = menu()!.getBoundingClientRect();
  expect(Math.abs(rect.left - Math.max(8, Math.min(trigger.left, innerWidth - rect.width - 8)))).toBeLessThan(2);
});


test('read-only changes and non-empty or multiple selections invalidate the session', async () => {
  const { view, execute } = fixture();
  await type('/h2');
  view.dispatch({ selection: { anchor: 0, head: 2 } });
  expect(menu()).toBeNull();
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  await type(' /h2');
  view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)) });
  view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(view.state.doc.length)]) });
  expect(menu()).toBeNull();
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  await type(' /h2');
  view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });
  expect(menu()).toBeNull();
  expect(view.state.doc.toString()).toBe('/h2 /h2 /h2');
  expect(execute).not.toHaveBeenCalled();
});

test('inline code and inline math do not trigger slash menus', async () => {
  for (const scope of ['inline-code', 'math']) {
    const { view } = fixture(' ', [[scope]]);
    await type('/');
    expect(menu()).toBeNull();
    view.destroy();
    views.splice(views.indexOf(view), 1);
  }
});
