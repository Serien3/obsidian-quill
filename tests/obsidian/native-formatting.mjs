// Only run against a separately launched disposable instance. Never a working vault.
// node tests/obsidian/native-formatting.mjs <CDP endpoint> <Windows disposable vault path> [format] [smoke]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [endpoint, expectedVault] = process.argv.slice(2);
const normalize = value => value.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
assert(endpoint && expectedVault);
assert(/\/quill-host-[^/]+\/vault$/.test(normalize(expectedVault)));
const browser = await chromium.connectOverCDP(endpoint);
const results = [];
try {
  const page = browser.contexts()[0].pages().find(page => page.url().startsWith('app://obsidian.md/'));
  assert(page);
  assert.equal(normalize(await page.evaluate(() => app.vault.adapter.getBasePath())), normalize(expectedVault));
  page.setDefaultTimeout(8000);
  await page.bringToFront();
  await page.evaluate(async () => {
    await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath('test.md'));
    await app.workspace.activeLeaf.setViewState({ type: 'markdown', state: { file: 'test.md', mode: 'source', source: false } });
  });
  assert(await page.evaluate(() => Boolean(app.plugins.plugins['quill'])));
  const actions = [
    { format: 'bold', label: '加粗', id: 'editor:toggle-bold' },
    { format: 'italic', label: '斜体', id: 'editor:toggle-italics' },
    { format: 'strikethrough', label: '删除线', id: 'editor:toggle-strikethrough' },
    { format: 'clear', label: '清除格式', id: 'editor:clear-formatting' },
    { format: 'code', label: '行内代码', id: 'editor:toggle-code' },
    { format: 'math', label: '行内公式', id: 'editor:toggle-inline-math' },
    { format: 'internalLink', label: '新增链接', id: 'editor:insert-wikilink' },
    { format: 'externalLink', label: '新增外部链接', id: 'editor:insert-link' }
  ];
  assert(!process.argv[4] || actions.some(action => action.format === process.argv[4]), 'Unknown native format filter.');
  for (const action of actions.filter(action => !process.argv[4] || action.format === process.argv[4])) {
    assert(await page.evaluate(id => Boolean(app.commands.commands[id]), action.id));
    const sources = [
      '正文 选择测试文字 结束。\n\n另一段落。',
      '# 选择测试文字\n\n另一段落。',
      '> 选择测试文字\n\n另一段落。',
      '- 选择测试文字\n\n另一段落。',
      '正文 **选择测试文字** 结束。\n\n另一段落。',
      '正文 `选择测试文字` 结束。\n\n另一段落。',
      '正文 *选择测试文字* 结束。\n\n另一段落。',
      ...(action.format === 'clear' ? ['正文 ==选择测试文字== 结束。\n\n另一段落。'] : []),
      ...(action.format === 'strikethrough' ? ['正文 ~~选择测试文字~~ 结束。\n\n另一段落。'] : [])
    ];
    const smokeIndex = { bold: 4, italic: 6, strikethrough: 7, clear: 7, code: 5, math: 4, internalLink: 1, externalLink: 1 };
    for (const [index, source] of sources.entries()) {
      if (process.argv[5] === 'smoke' && index !== 0 && index !== smokeIndex[action.format]) continue;
      console.log(`Starting ${action.format}:`, source.split('\n')[0]);
      await page.bringToFront();
      await page.evaluate(async ({ source, index }) => {
        const path = `native-formatting-${index}-${Date.now()}.md`;
        const file = await app.vault.create(path, source);
        await app.workspace.getLeaf().openFile(file);
        const editor = app.workspace.activeEditor.editor;
        editor.setCursor({ line: 2, ch: 0 });
        editor.focus();
      }, { source, index: results.length });
      await page.locator('.workspace-leaf.mod-active .cm-line').filter({ hasText: '另一段落。' }).click();
      // Build pointer coordinates from rendered text. The target selection is made
      // with a real drag, never by setting the editor's source selection.
      await page.waitForTimeout(150);
      const points = await page.locator('.workspace-leaf.mod-active .cm-line').filter({ hasText: '选择测试文字' }).first().evaluate(line => {
        const text = '选择测试文字';
        const start = line.textContent.indexOf(text), end = start + text.length;
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let offset = 0, node;
        while ((node = walker.nextNode())) {
          const next = offset + node.textContent.length;
          if (start >= offset && start < next) range.setStart(node, start - offset);
          if (end > offset && end <= next) { range.setEnd(node, end - offset); break; }
          offset = next;
        }
        const rects = [...range.getClientRects()];
        const a = rects[0], b = rects.at(-1);
        return { x1: a.x + 1, y1: a.y + a.height / 2, x2: b.right - 1, y2: b.y + b.height / 2 };
      });
      await page.mouse.move(points.x1, points.y1);
      await page.mouse.down();
      await page.mouse.move(points.x2, points.y2, { steps: 4 });
      await page.mouse.up();
      const button = page.getByRole('button', { name: action.label, exact: true });
      await button.waitFor({ state: 'visible' });
      assert(await button.isEnabled());
      assert.equal(await page.getByRole('button', { name: '文字颜色', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: '下划线', exact: true }).count(), 1);
      const toggleSyntax = { bold: '**', italic: '*', strikethrough: '~~', code: '`', math: '$' };
      if (action.format in toggleSyntax)
        assert.equal(await button.getAttribute('aria-pressed'), String(source.includes(`${toggleSyntax[action.format]}选择测试文字${toggleSyntax[action.format]}`)));

      await page.evaluate(id => {
        window.nativeFormatCalls = [];
        window.expectedNativeCommand = id;
        window.originalExecuteCommand = app.commands.executeCommandById;
        const original = window.originalExecuteCommand;
        app.commands.executeCommandById = function (id) {
          if (id === window.expectedNativeCommand) {
            const editor = app.workspace.activeEditor.editor;
            window.nativeFormatCalls.push({ source: editor.getValue(), selections: editor.listSelections(), selected: editor.getSelection() });
          }
          return original.call(this, id);
        };
      }, action.id);
      try {
        await button.click();
        const actual = await page.evaluate(() => ({ source: app.workspace.activeEditor.editor.getValue(), calls: window.nativeFormatCalls }));
        assert.equal(actual.calls.length, 1, 'The floating button must execute the native command exactly once.');
        if (action.format === 'internalLink' || action.format === 'externalLink') {
          assert.equal(await page.locator('.quill-toolbar').count(), 0, 'Native links take over the interaction.');
          await page.keyboard.press('Escape');
        }
        const before = actual.calls[0];
        assert(before.selected.includes('选择测试文字'), 'Toolbar focus must preserve the selected text.');
        await page.evaluate(() => app.workspace.activeEditor.editor.focus());
        await page.keyboard.press('Control+z');
        const undoValue = await page.evaluate(() => app.workspace.activeEditor.editor.getValue());
        assert.equal(undoValue, before.source, 'One native undo must restore the original note.');
        await page.evaluate(() => app.workspace.activeEditor.editor.focus());
        await page.keyboard.press('Control+Shift+z');
        const redoValue = await page.evaluate(() => app.workspace.activeEditor.editor.getValue());
        assert.equal(redoValue, actual.source);
        // Compare against the same host command invoked directly, not our formatter.
        const expected = await page.evaluate(({ before, id }) => {
          const editor = app.workspace.activeEditor.editor;
          editor.setValue(before.source);
          editor.setSelections(before.selections);
          editor.focus();
          window.originalExecuteCommand.call(app.commands, id);
          return editor.getValue();
        }, { before, id: action.id });
        assert.equal(actual.source, expected);
        results.push({ format: action.format, source, selected: before.selected, result: actual.source, nativeCalls: 1, undo: true, redo: true, matchesHost: true });
        console.log(`Passed native ${action.format}:`, source.split('\n')[0]);
      } finally {
        await page.evaluate(() => { app.commands.executeCommandById = window.originalExecuteCommand; });
      }
    }
  }
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/obsidian-native-formatting${process.argv[4] ? '-' + process.argv[4] : ''}${process.argv[5] === 'smoke' ? '-smoke' : ''}.json`, JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ passed: results.length }));
} finally {
  await browser.close();
}
