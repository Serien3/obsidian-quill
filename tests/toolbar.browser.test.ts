import '../styles.css';
import { afterEach, expect, test, vi } from 'vitest';
import { EditorState, EditorSelection, StateField, type Extension } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { nativeFormatLabels, type NativeFormat, type HighlightColor } from '../src/formatting/contracts';
import { nativeSelection } from '../src/host/native-selection';
import { quillToolbar } from '../src/formatting/toolbar';

const views: EditorView[] = [];
afterEach(() => { views.splice(0).forEach(view => view.destroy()); document.body.replaceChildren(); });

function editor(doc = 'hello world', live = true, execute = vi.fn<(state: EditorState, format: NativeFormat) => void>(), extensions: Extension[] = []) {
  const openHighlightMenu = vi.fn<(position: { x: number; y: number }, doc: Document, onChoose: (color: HighlightColor) => void, onHide: () => void) => () => void>(() => vi.fn());
  const executeNativeHighlight = vi.fn<(state: EditorState, color: HighlightColor) => void>();
  const host = document.createElement('div');
  host.style.cssText = 'width:500px;height:200px;margin:100px;overflow:auto';
  document.body.append(host);
  const view = new EditorView({ parent: host, state: EditorState.create({ doc, extensions: [
    ...extensions, history(), quillToolbar({ selection: nativeSelection, isLivePreview: () => live, executeNativeFormat: execute, openHighlightMenu, executeNativeHighlight })
  ] }) });
  view.dom.style.height = '100%';
  views.push(view);
  return { view, execute, openHighlightMenu, executeNativeHighlight };
}
// These tests exercise CM/DOM interaction and injected command routing, not
// Obsidian formatting semantics. Actual commands are tested in tests/obsidian/.
async function select(view: EditorView, anchor = 6, head = 11) {
  view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  view.dispatch({ selection: { anchor, head } });
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await Promise.resolve();
}

const toolbar = () => document.querySelector<HTMLElement>('[role=toolbar]');

test('ten actions remain: underline toggles selected text without invoking a native command', async () => {
  const { view, execute } = editor();
  await select(view);
  expect([...toolbar()!.querySelectorAll('button')].map(button => button.getAttribute('aria-label'))).toEqual([
    '高亮', '加粗', '斜体', '下划线', '清除格式', '新增链接', '新增外部链接', '删除线', '行内代码', '行内公式'
  ]);
  const underline = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
  expect(underline.disabled).toBe(false);
  expect(underline.dataset.nativeFormat).toBeUndefined();
  underline.click();
  expect(execute).not.toHaveBeenCalled();
  expect(view.state.doc.toString()).toBe('hello <u>world</u>');
  expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('world');
  expect(underline.getAttribute('aria-pressed')).toBe('true');
  expect(toolbar()).not.toBeNull();
  underline.click();
  expect(view.state.doc.toString()).toBe('hello world');
  expect(underline.getAttribute('aria-pressed')).toBe('false');
  expect(document.querySelector('[aria-label="文字颜色"]')).toBeNull();
  expect(document.querySelector('[role=group]')).toBeNull();
});

for (const [format, label] of Object.entries(nativeFormatLabels)) {
  test(`${format} forwards the current reverse selection once without any local formatter`, async () => {
    const { view, execute } = editor('# **word**');
    await select(view, 8, 4);
    const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    expect(button.disabled).toBe(false);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    button.click();
    expect(execute).toHaveBeenCalledOnce();
    const [state, action] = execute.mock.calls[0];
    expect(action).toBe(format);
    expect(state.selection.main.anchor).toBe(8);
    expect(state.selection.main.head).toBe(4);
    expect(view.hasFocus).toBe(true);
    expect(view.state.doc.toString()).toBe('# **word**');
    if (format === 'internalLink' || format === 'externalLink') expect(toolbar()).toBeNull();
    else expect(toolbar()).not.toBeNull();
  });
}

test('a host-injected edit owns the entire change and selection, without extra transactions', async () => {
  const { view, execute } = editor('word');
  execute.mockImplementation(() => view.dispatch({ changes: { from: 0, to: 4, insert: '**word**' }, selection: { anchor: 2, head: 6 } }));
  await select(view, 0, 4);
  document.querySelector<HTMLButtonElement>('[aria-label="加粗"]')!.click();
  expect(view.state.doc.toString()).toBe('**word**');
  expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('word');
  expect(toolbar()).not.toBeNull();
});

test('native link commands take over before execution and subsequent editing never reopens the toolbar', async () => {
  const { view, execute } = editor();
  execute.mockImplementation(() => { expect(toolbar()).toBeNull(); });
  await select(view);
  document.querySelector<HTMLButtonElement>('[aria-label="新增链接"]')!.click();
  view.dispatch({ changes: { from: 0, insert: '[[' } });
  expect(toolbar()).toBeNull();
});

test('only completed, nonempty, single mouse selections in live preview open the toolbar', async () => {
  const { view } = editor();
  view.dispatch({ selection: { anchor: 6, head: 11 } });
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await Promise.resolve();
  expect(toolbar()).toBeNull();
  view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  view.dispatch({ selection: { anchor: 0, head: 5 } });
  await Promise.resolve();
  expect(toolbar()).toBeNull();
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await Promise.resolve();
  expect(toolbar()).not.toBeNull();
  await select(view, 0, 0);
  expect(toolbar()).toBeNull();
  view.destroy();
  const inactive = editor('hello world', false);
  await select(inactive.view);
  expect(toolbar()).toBeNull();
});

test('multiple selections never expose a native action on only one range', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: 'one two', extensions: [EditorState.allowMultipleSelections.of(true), quillToolbar({ selection: nativeSelection, executeNativeFormat: vi.fn(), executeNativeHighlight: vi.fn(), openHighlightMenu: () => () => {}, isLivePreview: () => true })] }) });
  views.push(view);
  view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(4, 7)]) });
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await Promise.resolve();
  expect(toolbar()).toBeNull();
});

test('outside click, Escape, typing and a different native selection dismiss the toolbar', async () => {
  const { view } = editor();
  for (const dismiss of [
    () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
    () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    () => view.contentDOM.dispatchEvent(new InputEvent('beforeinput', { bubbles: true })),
    () => view.dispatch({ selection: { anchor: 0, head: 5 } })
  ]) {
    await select(view);
    expect(toolbar()).not.toBeNull();
    dismiss();
    expect(toolbar()).toBeNull();
  }
  await select(view);
  view.dispatch({ changes: { from: 0, insert: 'x' } });
  expect(toolbar()).toBeNull();
});

test('scroll events without movement keep the toolbar, actual scrolling dismisses it', async () => {
  const { view } = editor('hello world\n' + 'line\n'.repeat(100));
  await select(view);
  view.scrollDOM.dispatchEvent(new Event('scroll'));
  expect(toolbar()).not.toBeNull();
  view.scrollDOM.scrollTop = 30;
  view.scrollDOM.dispatchEvent(new Event('scroll'));
  expect(toolbar()).toBeNull();
});

test('destroy and Escape cancel a queued mouseup without recreating the toolbar', async () => {
  for (const destroy of [false, true]) {
    const { view } = editor();
    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    view.dispatch({ selection: { anchor: 6, head: 11 } });
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    if (destroy) view.destroy();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
    expect(toolbar()).toBeNull();
  }
});

test('rendered noneditable widgets never reuse a previous text selection or bridge HTML source', async () => {
  const { view, execute } = editor();
  view.dispatch({ selection: { anchor: 6, head: 11 } });
  const widget = document.createElement('span'); widget.contentEditable = 'false'; widget.textContent = 'old HTML';
  view.contentDOM.append(widget);
  widget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await Promise.resolve();
  expect(toolbar()).toBeNull();
  expect(execute).not.toHaveBeenCalled();
});

test('the visible toolbar is bounded by a narrow editor and the viewport', async () => {
  const { view } = editor();
  view.dom.parentElement!.style.width = '90px';
  await select(view);
  await expect.poll(() => toolbar()?.style.visibility).toBe('visible');
  const bounds = view.dom.getBoundingClientRect(), rect = toolbar()!.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(bounds.left - 1);
  expect(rect.right).toBeLessThanOrEqual(bounds.right + 1);
  expect(rect.top).toBeGreaterThanOrEqual(bounds.top - 1);
  expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
});

test('cancelling only the middle of an underline preserves both sides and reverse selection', async () => {
  const { view } = editor('<u>甲乙丙丁</u>');
  await select(view, 6, 4);
  const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
  expect(button.getAttribute('aria-pressed')).toBe('true');
  button.click();
  expect(view.state.doc.toString()).toBe('<u>甲</u>乙丙<u>丁</u>');
  expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('乙丙');
  expect(view.state.selection.main.anchor).toBeGreaterThan(view.state.selection.main.head);
  expect(button.getAttribute('aria-pressed')).toBe('false');
});


test('mixed Unicode formatting is unified and each consecutive click is one independent undo step', async () => {
  const { view } = editor('前 <u>甲😀</u>**乙** 后 <u>不变</u>');
  await select(view, 2, 17);
  const before = view.state.doc.toString();
  const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
  button.click();
  expect(view.state.doc.toString()).toBe('前 <u>甲😀**乙**</u> 后 <u>不变</u>');
  const first = view.state.doc.toString();
  button.click();
  expect(view.state.doc.toString()).toBe('前 甲😀**乙** 后 <u>不变</u>');
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(first);
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(before);
  expect(redo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(first);
});

test('cross-paragraph and task-list selections underline each body without changing structure', async () => {
  const { view } = editor('甲乙\n\n- 丙丁\n- [ ] 戊己');
  await select(view, 0, view.state.doc.length);
  const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
  button.click();
  expect(view.state.doc.toString()).toBe('<u>甲乙</u>\n\n- <u>丙丁</u>\n- [ ] <u>戊己</u>');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  button.click();
  expect(view.state.doc.toString()).toBe('甲乙\n\n- 丙丁\n- [ ] 戊己');
});

test('unsafe structures disable the entire underline action without partial edits', async () => {
  for (const [source, from, to] of [
    ['正文\n\n```js\ncode\n```\n\n末尾', 0, 25],
    ['正文 `code` 末尾', 5, 7],
    ['正文 [label](target) 末尾', 6, 15],
    ['正文\n\n| A | B |\n| --- | --- |\n| C | D |', 0, 36],
    ['正文 <u>文字</u> 末尾', 5, 8]
  ] as const) {
    const { view } = editor(source);
    await select(view, from, Math.min(to, source.length));
    const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
    expect(button.disabled, source).toBe(true);
    expect(button.title).not.toBe('下划线');
    button.click();
    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  }
});

test('code and math remain atomic, and literal underline tags inside them never become formatting', async () => {
  for (const [source, from, to, disabled, expected] of [
    ['正文 `<u>code</u>` 末尾', 3, 16, false, '正文 <u>`<u>code</u>`</u> 末尾'],
    ['正文 $x+y$ 末尾', 5, 6, true, '正文 $x+y$ 末尾'],
    ['正文 $x+y$ 末尾', 3, 8, false, '正文 <u>$x+y$</u> 末尾'],
    ['正文 $<u>x</u>$ 末尾', 3, 13, false, '正文 <u>$<u>x</u>$</u> 末尾'],
    ['正文 [[note|label]] 末尾', 11, 14, true, '正文 [[note|label]] 末尾']
  ] as const) {
    const { view } = editor(source);
    await select(view, from, to);
    const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
    expect(button.disabled, source).toBe(disabled);
    expect(button.getAttribute('aria-pressed'), source).toBe('false');
    button.click();
    expect(view.state.doc.toString()).toBe(expected);
    view.destroy();
  }
});


// Real CM replacement widgets, matching the host's HTML source-position contract.
// The actual host's gesture/expansion is covered separately in tests/obsidian.
function renderedUnderlines() {
  class UnderlineWidget extends WidgetType {
    constructor(readonly text: string) { super(); }
    toDOM(view: EditorView) {
      const widget = view.dom.ownerDocument.createElement('span');
      widget.className = 'cm-html-embed'; widget.contentEditable = 'false';
      widget.innerHTML = this.text;
      return widget;
    }
    ignoreEvent() { return true; }
  }
  const decorations = (state: EditorState) => Decoration.set([...state.doc.toString().matchAll(/<u>.*?<\/u>/g)].filter(match => {
    const selection = state.selection.main;
    return selection.to <= match.index! || selection.from >= match.index! + match[0].length;
  }).map(match => Decoration.replace({ widget: new UnderlineWidget(match[0]) }).range(match.index!, match.index! + match[0].length)));
  return StateField.define({ create: decorations, update: (_, transaction) => decorations(transaction.state), provide: field => EditorView.decorations.from(field) });
}

test('dragging in the second rendered underline maps entities and Unicode to that exact source range', async () => {
  const source = '<u>甲&amp;😀乙</u> 间隔 <u>甲&amp;😀乙</u>';
  const { view, execute } = editor(source, true, undefined, [renderedUnderlines()]);
  const widget = view.contentDOM.querySelectorAll('u')[1];
  widget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  const text = widget.firstChild!;
  document.getSelection()!.setBaseAndExtent(text, 1, text, 4);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await Promise.resolve();
  expect(toolbar()).not.toBeNull();
  const selection = view.state.selection.main;
  expect(selection.from).toBe(source.lastIndexOf('&amp;'));
  expect(view.state.sliceDoc(selection.from, selection.to)).toBe('&amp;😀');
  document.querySelector<HTMLButtonElement>('[aria-label="加粗"]')!.click();
  expect(execute).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0][0].selection.main.eq(selection)).toBe(true);
});

test('HTML structures and YAML metadata are never cut or reformatted as ordinary text', async () => {
  for (const [source, from, to] of [
    ['<u><strong>甲乙丙</strong></u>', 12, 13],
    ['---\nname: value\n---\n\n正文', 4, 15]
  ] as const) {
    const { view } = editor(source);
    await select(view, from, to);
    const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
    expect(button.disabled, source).toBe(true);
    button.click();
    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  }
});

test('rendered reverse selection cancels locally, and Escape cancels its queued toolbar', async () => {
  const { view } = editor('正文 <u>甲乙丙丁</u> 结束', true, undefined, [renderedUnderlines()]);
  const u = view.contentDOM.querySelector('u')!;
  u.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  document.getSelection()!.setBaseAndExtent(u.firstChild!, 3, u.firstChild!, 1);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await Promise.resolve();
  expect(view.state.selection.main.anchor).toBeGreaterThan(view.state.selection.main.head);
  document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!.click();
  expect(view.state.doc.toString()).toBe('正文 <u>甲</u>乙丙<u>丁</u> 结束');
  await select(view, view.state.doc.length, view.state.doc.length);
  const next = view.contentDOM.querySelector('u')!;
  next.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  document.getSelection()!.setBaseAndExtent(next.firstChild!, 0, next.firstChild!, 1);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await Promise.resolve();
  expect(toolbar()).toBeNull();
});

test('starting a rendered selection in another pane dismisses the old toolbar', async () => {
  const first = editor('old selection');
  const second = editor('正文 <u>甲乙</u>', true, undefined, [renderedUnderlines()]);
  await select(first.view, 0, 3);
  expect(toolbar()).not.toBeNull();
  const u = second.view.contentDOM.querySelector('u')!;
  u.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  expect(toolbar()).toBeNull();
});

test('a selection starting in ordinary text and ending inside rendered underline keeps both endpoints', async () => {
  const { view } = editor('前文 <u>甲乙丙</u> 后文', true, undefined, [renderedUnderlines()]);
  const plain = view.contentDOM.querySelector('.cm-line')!.firstChild!;
  view.contentDOM.addEventListener('mousedown', event => event.preventDefault(), { capture: true });
  plain.parentElement!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  const text = view.contentDOM.querySelector('u')!.firstChild!;
  document.getSelection()!.setBaseAndExtent(plain, 1, text, 2);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await Promise.resolve();
  expect(toolbar()).not.toBeNull();
  expect(view.state.selection.main.from).toBe(1);
  expect(view.state.selection.main.to).toBe(8);
  document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!.click();
  expect(view.state.doc.toString()).toBe('前<u>文 甲乙丙</u> 后文');
});

test('underlining a styled link label preserves its emphasis and destination', async () => {
  const { view } = editor('前 [**链接**](https://example.test/a_(b)) 后');
  await select(view, 5, 7);
  const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
  expect(button.disabled).toBe(false);
  button.click();
  expect(view.state.doc.toString()).toBe('前 [**<u>链接</u>**](https://example.test/a_(b)) 后');
  button.click();
  expect(view.state.doc.toString()).toBe('前 [**链接**](https://example.test/a_(b)) 后');
});

test('heading edge markers, quotes and list continuation indentation remain outside underline tags', async () => {
  const { view } = editor('## 标题 ##\n\n> 引用\n\n1. 正文\n   续行');
  await select(view, 0, view.state.doc.length);
  document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!.click();
  expect(view.state.doc.toString()).toBe('## <u>标题</u> ##\n\n> <u>引用</u>\n\n1. <u>正文</u>\n   <u>续行</u>');
});

test('display math spanning blank lines is an unsupported block, even when only its body is selected', async () => {
  const source = '前文\n\n$$\na+b\n\nc+d\n$$\n\n后文';
  const { view } = editor(source);
  await select(view, source.indexOf('c+d'), source.indexOf('c+d') + 3);
  const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
  expect(button.disabled).toBe(true);
  button.click();
  expect(view.state.doc.toString()).toBe(source);
});

test('Markdown hard breaks keep their spaces or backslash outside the underline', async () => {
  const { view } = editor('甲  \n乙\\\n丙');
  await select(view, 0, view.state.doc.length);
  document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!.click();
  expect(view.state.doc.toString()).toBe('<u>甲</u>  \n<u>乙</u>\\\n<u>丙</u>');
});

test('revealing or hiding complete underline edge tags keeps the same body toolbar open', async () => {
  const { view } = editor('正文 <u>甲乙丙</u> 结束');
  await select(view, 6, 9);
  const element = toolbar();
  view.dispatch({ selection: { anchor: 3, head: 13 } });
  expect(toolbar()).toBe(element);
  view.dispatch({ selection: { anchor: 6, head: 9 } });
  expect(toolbar()).toBe(element);
  view.dispatch({ selection: { anchor: 7, head: 9 } });
  expect(toolbar()).toBeNull();
});

test('underline never writes through a read-only editor', async () => {
  const { view } = editor('受保护正文', true, undefined, [EditorState.readOnly.of(true)]);
  await select(view, 0, 5);
  const button = document.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
  expect(button.disabled).toBe(true);
  button.click();
  expect(view.state.doc.toString()).toBe('受保护正文');
});


test('highlight opens a host menu without editing, then delegates the chosen color on the reverse selection', async () => {
  const { view, execute, openHighlightMenu, executeNativeHighlight } = editor();
  await select(view, 11, 6);
  const button = document.querySelector<HTMLButtonElement>('[aria-label="高亮"]')!;
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  button.dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  button.click();
  expect(toolbar()).toBeNull();
  expect(openHighlightMenu).toHaveBeenCalledOnce();
  expect(openHighlightMenu.mock.calls[0][1]).toBe(view.dom.ownerDocument);
  expect(view.state.doc.toString()).toBe('hello world');
  expect(execute).not.toHaveBeenCalled();
  expect(executeNativeHighlight).not.toHaveBeenCalled();
  openHighlightMenu.mock.calls[0][2]('red');
  expect(executeNativeHighlight).toHaveBeenCalledExactlyOnceWith(view.state, 'red');
  expect(view.state.selection.main.anchor).toBe(11);
  expect(view.state.selection.main.head).toBe(6);
});

test('an external document change closes the highlight menu and invalidates its old callback', async () => {
  const { view, openHighlightMenu, executeNativeHighlight } = editor();
  await select(view);
  document.querySelector<HTMLButtonElement>('[aria-label="高亮"]')!.click();
  const choose = openHighlightMenu.mock.calls[0][2], close = openHighlightMenu.mock.results[0].value;
  view.dispatch({ changes: { from: 0, insert: 'x' } });
  expect(close).toHaveBeenCalledOnce();
  choose('blue');
  expect(executeNativeHighlight).not.toHaveBeenCalled();
  expect(view.state.doc.toString()).toBe('xhello world');
});

for (const cause of ['selection', 'Escape', 'scroll', 'destroy', 'new gesture', 'native hide', 'input'] as const) {
  test(`highlight choice cannot run after ${cause}`, async () => {
    const { view, openHighlightMenu, executeNativeHighlight } = editor(cause === 'scroll' ? 'hello world\n' + 'line\n'.repeat(100) : 'hello world');
    await select(view);
    document.querySelector<HTMLButtonElement>('[aria-label="高亮"]')!.click();
    const [, , choose, onHide] = openHighlightMenu.mock.calls[0], close = openHighlightMenu.mock.results[0].value;
    switch (cause) {
      case 'selection': view.dispatch({ selection: { anchor: 0, head: 5 } }); break;
      case 'Escape': document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); break;
      case 'scroll': view.scrollDOM.scrollTop = 30; view.scrollDOM.dispatchEvent(new Event('scroll')); break;
      case 'destroy': view.destroy(); break;
      case 'new gesture': view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); break;
      case 'native hide': onHide(); break;
      case 'input': view.contentDOM.dispatchEvent(new InputEvent('beforeinput', { bubbles: true })); break;
    }
    if (cause !== 'native hide') expect(close).toHaveBeenCalledOnce();
    choose('purple');
    expect(executeNativeHighlight).not.toHaveBeenCalled();
  });
}

test('highlight menu survives complete formatting-marker expansion for the same selected body', async () => {
  const { view, openHighlightMenu, executeNativeHighlight } = editor('<u>hello</u>');
  await select(view, 3, 8);
  document.querySelector<HTMLButtonElement>('[aria-label="高亮"]')!.click();
  const choose = openHighlightMenu.mock.calls[0][2], close = openHighlightMenu.mock.results[0].value;
  view.dispatch({ selection: { anchor: 0, head: 12 } });
  expect(close).not.toHaveBeenCalled();
  choose('');
  expect(executeNativeHighlight).toHaveBeenCalledExactlyOnceWith(view.state, '');
});

test('read-only editors cannot open a highlight color menu', async () => {
  const { view, openHighlightMenu } = editor('hello world', true, undefined, [EditorState.readOnly.of(true)]);
  await select(view);
  const button = document.querySelector<HTMLButtonElement>('[aria-label="高亮"]')!;
  expect(button.disabled).toBe(true);
  button.click();
  expect(openHighlightMenu).not.toHaveBeenCalled();
});

test('a delayed old menu hide cannot cancel a newer menu, and a choice executes at most once', async () => {
  const { view, openHighlightMenu, executeNativeHighlight } = editor();
  await select(view);
  document.querySelector<HTMLButtonElement>('[aria-label="高亮"]')!.click();
  const oldChoose = openHighlightMenu.mock.calls[0][2], oldHide = openHighlightMenu.mock.calls[0][3];
  await select(view);
  document.querySelector<HTMLButtonElement>('[aria-label="高亮"]')!.click();
  oldHide(); oldChoose('red');
  const choose = openHighlightMenu.mock.calls[1][2];
  choose('green'); choose('purple');
  expect(executeNativeHighlight).toHaveBeenCalledExactlyOnceWith(view.state, 'green');
});

test('format display state comes from the injected host selection query, not host token names in the toolbar', async () => {
  const inspect = vi.fn(() => ({ active: new Set(['bold'] as const), markers: [] }));
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: 'plain', extensions: [quillToolbar({
    executeNativeFormat: vi.fn(), executeNativeHighlight: vi.fn(), openHighlightMenu: () => () => {},
    isLivePreview: () => true,
    selection: { inspect, same: () => false, underlineWidget: () => null }
  })] }) });
  views.push(view);
  await select(view, 0, 5);
  expect(inspect).toHaveBeenCalledWith(view.state, 0, 5);
  expect(toolbar()!.querySelector('[aria-label="加粗"]')!.getAttribute('aria-pressed')).toBe('true');
});
