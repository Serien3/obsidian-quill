// Actual toolbar -> Obsidian Menu -> native editor, compared with native right-click.
// node tests/obsidian/highlight-menu.mjs <CDP endpoint> <disposable vault path>
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [endpoint, expectedVault, group] = process.argv.slice(2);
assert(!group || ['colors', 'transitions', 'lifecycle'].includes(group));
const normalize = value => value.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
assert(endpoint && expectedVault);
assert(/\/quill-host-[^/]+\/vault$/.test(normalize(expectedVault)));
const browser = await chromium.connectOverCDP(endpoint);
const results = [];
try {
  const page = browser.contexts()[0].pages().find(page => page.url().startsWith('app://obsidian.md/'));
  assert(page);
  assert.equal(normalize(await page.evaluate(() => app.vault.adapter.getBasePath())), normalize(expectedVault));
  page.setDefaultTimeout(6000);
  await page.evaluate(() => {
    if (window.electronWindow.isMinimized()) window.electronWindow.restore();
    window.electronWindow.show(); window.electronWindow.focus();
  });
  await page.bringToFront();
  await page.mouse.up();
  await page.keyboard.up('Control'); await page.keyboard.up('Shift');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  assert(await page.evaluate(() => Boolean(app.plugins.plugins['quill'])));
  // A fresh view prevents an externally interrupted run's instrumentation from
  // surviving on a reused editor instance. Never patch the editor prototype.
  await page.evaluate(async () => {
    const previous = app.workspace.activeLeaf, leaf = app.workspace.getLeaf('tab');
    await leaf.openFile(app.vault.getAbstractFileByPath('test.md'));
    if (previous !== leaf) previous.detach();
  });
  const labels = ['默认', '红色', '橙色', '黄色', '绿色', '蓝色', '紫色'];
  const value = () => page.evaluate(() => app.workspace.activeEditor.editor.getValue());
  const snapshot = () => page.evaluate(() => {
    const editor = app.workspace.activeEditor.editor;
    return { source: editor.getValue(), selections: editor.listSelections(), selected: editor.getSelection() };
  });
  async function textPoints(text = '选择测试文字') {
    return await page.locator('.workspace-leaf.mod-active .cm-line').filter({ hasText: text }).first().evaluate((line, text) => {
      const start = line.textContent.indexOf(text), end = start + text.length;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT), range = document.createRange();
      let offset = 0, node;
      while ((node = walker.nextNode())) {
        const next = offset + node.textContent.length;
        if (start >= offset && start < next) range.setStart(node, start - offset);
        if (end > offset && end <= next) { range.setEnd(node, end - offset); break; }
        offset = next;
      }
      const rects = [...range.getClientRects()], a = rects[0], b = rects.at(-1);
      return { left: a.left + 1, right: b.right - 1, y: a.top + a.height / 2 };
    }, text);
  }
  async function open(source, reverse = false) {
    // CDP pointer input can wait indefinitely for a minimized Electron window.
    // This is the path-verified disposable host, never the user's working vault.
    await page.evaluate(() => {
      if (window.electronWindow.isMinimized()) window.electronWindow.restore();
      window.electronWindow.show(); window.electronWindow.focus();
    });
    await page.bringToFront();
    await page.evaluate(async source => {
      const file = await app.vault.create(`highlight-menu-${Date.now()}.md`, source);
      await app.workspace.getLeaf().openFile(file);
      await app.workspace.activeLeaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source', source: false } });
      const editor = app.workspace.activeEditor.editor;
      editor.setCursor({ line: editor.lastLine(), ch: 0 }); editor.focus();
    }, source);
    await page.waitForTimeout(120);
    console.log('  source opened');
    const points = await textPoints();
    await page.mouse.move(reverse ? points.right : points.left, points.y); await page.mouse.down();
    await page.mouse.move(reverse ? points.left : points.right, points.y, { steps: 8 }); await page.mouse.up();
    console.log('  pointer selection completed');
    await page.getByRole('button', { name: '高亮', exact: true }).waitFor({ state: 'visible' });
    return points;
  }
  async function toolbarMenu(before) {
    await page.getByRole('button', { name: '高亮', exact: true }).click();
    assert.equal(await value(), before, 'Opening the menu must not apply default highlight');
    assert.equal(await page.locator('.quill-toolbar').count(), 0);
    await page.locator('.menu-item-title').getByText('默认', { exact: true }).waitFor();
    assert.deepEqual(await page.locator('.menu-item-title:visible').allTextContents(), labels);
  }
  const scenarios = [
    ...labels.map(label => [label, '正文 选择测试文字 结束。\n\n另一段落。']),
    ['默认', '正文 ==🔴选择测试文字== 结束。\n\n另一段落。'],
    ['蓝色', '正文 ==🔴选择测试文字== 结束。\n\n另一段落。'],
    ['蓝色', '正文 ==🔵选择测试文字== 结束。\n\n另一段落。'],
    ['绿色', '正文 **选择测试文字** 结束。\n\n另一段落。'],
    ['红色', '正文 选择测试文字 结束。\n\n另一段落。', true],
    ['紫色', '正文 ==🔴选择==测试文字 结束。\n\n另一段落。']
  ];
  for (const [index, [label, source, reverse = false]] of scenarios.entries()) {
    if (group === 'lifecycle' || (group === 'colors' && index >= 7) || (group === 'transitions' && index < 7)) continue;
    console.log('Starting highlight:', label, source.split('\n')[0]);
    await open(source, reverse);
    const before = await snapshot();
    // Count only the host edge, never implement or replace its edit semantics.
    await page.evaluate(() => {
      const editor = app.workspace.activeEditor.editor, original = editor.toggleHighlight;
      window.highlightCalls = []; window.highlightOriginal = original; window.highlightEditor = editor;
      editor.toggleHighlight = function (color) { window.highlightCalls.push({ color, source: this.getValue(), selections: this.listSelections(), selected: this.getSelection() }); return original.call(this, color); };
    });
    try {
      await toolbarMenu(before.source);
      await page.locator('.menu-item-title').getByText(label, { exact: true }).click();
      await page.waitForTimeout(120);
      const actual = await snapshot();
      console.log('  toolbar choice completed');
      const calls = await page.evaluate(() => window.highlightCalls);
      assert.equal(calls.length, 1);
      const nativeInput = calls[0];
      assert.equal(await page.locator('.quill-toolbar').count(), 0);
      await page.evaluate(() => app.workspace.activeEditor.editor.focus()); await page.keyboard.press('Control+z');
      assert.equal(await value(), before.source, 'One undo restores the note');
      await page.evaluate(() => app.workspace.activeEditor.editor.focus()); await page.keyboard.press('Control+Shift+z');
      assert.equal(await value(), actual.source, 'One redo restores the result');
      // Exact host-edge replay checks selection mapping without right-click's own
      // DOM-selection normalization (which can trim visible format markers).
      await page.evaluate(input => {
        const editor = app.workspace.activeEditor.editor;
        editor.setValue(input.source); editor.focus(); editor.setSelections(input.selections);
        window.highlightOriginal.call(editor, input.color);
      }, nativeInput);
      await page.waitForTimeout(120);
      assert.deepEqual(await snapshot(), actual, 'Document and selection match native execution on identical source endpoints');
      console.log('  exact native replay completed');
      // Independently compare with the host context-menu event entry. An untrusted
      // DOM event avoids Electron system-menu/clipboard IPC blocking CDP input;
      // the formatting submenu and its callbacks are still built by Obsidian.
      await page.evaluate(before => {
        const editor = app.workspace.activeEditor.editor;
        editor.setValue(before.source); editor.setSelections(before.selections); editor.focus();
      }, before);
      await page.waitForTimeout(120);
      const referencePoints = await textPoints('测试文字');
      await page.locator('.workspace-leaf.mod-active .cm-content').evaluate((content, points) => {
        content.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2, clientX: (points.left + points.right) / 2, clientY: points.y }));
      }, referencePoints);
      await page.locator('.menu-item-title').getByText('文本格式', { exact: true }).hover();
      await page.locator('.menu-item-title').getByText('高亮', { exact: true }).hover();
      // Right-click can trim marker endpoints. Restore the recorded native input
      // before choosing so the two native callbacks receive identical ranges.
      await page.evaluate(input => app.workspace.activeEditor.editor.setSelections(input.selections), nativeInput);
      console.log('  native reference menu ready');
      await page.locator('.menu-item-title').getByText(label, { exact: true }).click();
      await page.waitForTimeout(120);
      assert.deepEqual(await snapshot(), actual, 'Native context menu matches document and selection on identical source endpoints');
      await page.evaluate(() => app.workspace.activeLeaf.view.save());
      results.push({ label, source, reverse, output: actual.source, matchesNativeMenuDocument: true, matchesNativeSelection: true, oneHostCall: true, undoRedo: true });
    } finally {
      await page.evaluate(() => { window.highlightEditor.toggleHighlight = window.highlightOriginal; });
    }
    console.log('Passed highlight:', label);
  }
  if (!group || group === 'lifecycle') {
  const plain = '正文 选择测试文字 结束。\n\n另一段落。';
  await open(plain); await toolbarMenu(plain); await page.keyboard.press('Escape');
  assert.equal(await value(), plain); assert.equal(await page.locator('.quill-toolbar').count(), 0);
  await page.locator('.menu').waitFor({ state: 'hidden' });
  results.push({ case: 'Escape', noEdit: true, noReopen: true });
  await open(plain); await toolbarMenu(plain);
  await page.evaluate(() => app.workspace.activeEditor.editor.replaceRange('外部', { line: 0, ch: 0 }));
  await page.locator('.menu').waitFor({ state: 'hidden' });
  assert.equal(await value(), '外部' + plain);
  results.push({ case: 'external-edit', menuRemoved: true, onlyExternalEdit: true });
  await open(plain); await toolbarMenu(plain);
  const outside = await page.locator('.workspace-leaf.mod-active .cm-content').boundingBox();
  await page.mouse.click(outside.x + outside.width - 5, outside.y + outside.height - 3);
  await page.locator('.menu').waitFor({ state: 'hidden' }); assert.equal(await value(), plain);
  results.push({ case: 'outside-click', menuRemoved: true, noEdit: true });
  await open(plain); await toolbarMenu(plain);
  await page.evaluate(() => app.plugins.disablePlugin('quill'));
  await page.locator('.menu').waitFor({ state: 'hidden' }); assert.equal(await value(), plain);
  await page.evaluate(() => app.plugins.enablePlugin('quill'));
  results.push({ case: 'disable', menuRemoved: true, noEdit: true });
  }
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/obsidian-highlight-menu${group ? '-' + group : ''}.json`, JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ passed: results.length }));
} finally { await browser.close(); }
