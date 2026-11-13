// Real gestures in an independently launched, disposable Obsidian instance only.
// node tests/obsidian/underline.mjs <CDP endpoint> <disposable vault path> [case]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [endpoint, expectedVault, filter] = process.argv.slice(2);
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
  await page.bringToFront();
  const value = () => page.evaluate(() => app.workspace.activeEditor.editor.getValue());
  async function open(source) {
    await page.bringToFront();
    await page.evaluate(async source => {
      const file = await app.vault.create(`underline-${Date.now()}.md`, source);
      await app.workspace.getLeaf().openFile(file);
      await app.workspace.activeLeaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source', source: false } });
      const editor = app.workspace.activeEditor.editor;
      editor.setCursor({ line: editor.lastLine(), ch: 0 }); editor.focus();
    }, source);
    await page.waitForTimeout(150);
  }
  async function points(locator, text) {
    await locator.waitFor();
    const points = await locator.evaluate((element, text) => {
      const start = element.textContent.indexOf(text);
      if (start < 0) throw Error(`Text not found: ${text}`);
      const end = start + text.length, range = document.createRange();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let offset = 0, node;
      while ((node = walker.nextNode())) {
        const next = offset + node.textContent.length;
        if (start >= offset && start < next) range.setStart(node, start - offset);
        if (end > offset && end <= next) { range.setEnd(node, end - offset); break; }
        offset = next;
      }
      const rects = [...range.getClientRects()], a = rects[0], b = rects.at(-1);
      return { x1: a.left + 1, y1: a.top + a.height / 2, x2: b.right - 1, y2: b.top + b.height / 2 };
    }, text);
    return points;
  }
  async function drag(locator, text, endLocator = locator, endText = text) {
    const start = await points(locator, text);
    const end = endLocator === locator && endText === text ? start : await points(endLocator, endText);
    await page.mouse.move(start.x1, start.y1); await page.mouse.down();
    await page.mouse.move(end.x2, end.y2, { steps: 12 }); await page.mouse.up();
    await page.getByRole('button', { name: '下划线', exact: true }).waitFor({ state: 'visible' });
  }
  const button = () => page.getByRole('button', { name: '下划线', exact: true });
  const line = text => page.locator('.workspace-leaf.mod-active .cm-line').filter({ hasText: text }).first();
  async function undoRedo(before, after) {
    await page.evaluate(() => app.workspace.activeEditor.editor.focus());
    await page.keyboard.press('Control+z'); assert.equal(await value(), before, 'One undo restores the note');
    await page.keyboard.press('Control+Shift+z'); assert.equal(await value(), after, 'One redo restores the result');
  }
  const cases = {
    async basic() {
      const before = '正文 甲乙丙丁 结束。\n\n另一段落。', after = '正文 甲<u>乙丙</u>丁 结束。\n\n另一段落。';
      await open(before); await drag(line('甲乙丙丁'), '乙丙');
      assert(await button().isEnabled()); await button().click(); assert.equal(await value(), after);
      assert.equal(await page.evaluate(() => app.workspace.activeEditor.editor.getSelection()), '乙丙');
      assert.equal(await button().getAttribute('aria-pressed'), 'true');
      await button().click(); assert.equal(await value(), before);
      await undoRedo(after, before);
      results.push({ case: 'basic', selectionPreserved: true, consecutiveToggleUndo: true });
    },
    async rendered() {
      const before = '正文 <u>甲乙丙丁</u> 结束。\n\n另一段落。', after = '正文 <u>甲</u>乙丙<u>丁</u> 结束。\n\n另一段落。';
      await open(before); await drag(page.locator('.workspace-leaf.mod-active .cm-html-embed u'), '乙丙');
      assert.equal(await page.evaluate(() => app.workspace.activeEditor.editor.getSelection()), '乙丙');
      assert.equal(await button().getAttribute('aria-pressed'), 'true');
      await button().click(); assert.equal(await value(), after); await undoRedo(before, after);
      results.push({ case: 'rendered', partialRemoval: true, undoRedo: true });
    },
    async duplicate() {
      const before = '正文 <u>甲&amp;😀乙</u> 间隔 <u>甲&amp;😀乙</u> 结束。\n\n另一段落。';
      const after = '正文 <u>甲&amp;😀乙</u> 间隔 <u>甲</u>&amp;😀<u>乙</u> 结束。\n\n另一段落。';
      await open(before);
      await drag(page.locator('.workspace-leaf.mod-active .cm-html-embed u').nth(1), '&😀');
      assert.equal(await page.evaluate(() => app.workspace.activeEditor.editor.getSelection()), '&amp;😀');
      await button().click(); assert.equal(await value(), after); await undoRedo(before, after);
      results.push({ case: 'duplicate', exactSourceIdentity: true, entitiesAndUnicode: true });
    },
    async paragraphs() {
      const before = '甲乙\n\n- 丙丁\n- [ ] 戊己\n\n另一段落。';
      const after = '<u>甲乙</u>\n\n- <u>丙丁</u>\n- [ ] <u>戊己</u>\n\n另一段落。';
      await open(before);
      await drag(line('甲乙'), '甲乙', line('戊己'), '戊己');
      await button().waitFor({ state: 'visible' }); assert(await button().isEnabled());
      await button().click(); assert.equal(await value(), after); await undoRedo(before, after);
      results.push({ case: 'paragraphs', paragraphsAndTasks: true, undoRedo: true });
    },
    async safety() {
      const before = '甲乙\n\n```js\ncode\n```\n\n末尾\n\n另一段落。';
      await open(before); await drag(line('甲乙'), '甲乙', line('末尾'), '末尾');
      assert(await button().isDisabled()); assert((await button().getAttribute('title')).includes('不支持'));
      assert.equal(await value(), before);
      results.push({ case: 'safety', entireCrossCodeBlockSelectionDisabled: true });
    },
    async mixedRendered() {
      const before = '正文 <u>甲乙丙丁</u> 结束。\n\n另一段落。';
      const after = '<u>正文 甲乙丙丁</u> 结束。\n\n另一段落。';
      await open(before);
      await drag(line('正文'), '正文 ', page.locator('.workspace-leaf.mod-active .cm-html-embed u'), '甲乙');
      await button().click(); assert.equal(await value(), after); await undoRedo(before, after);
      results.push({ case: 'mixedRendered', ordinaryToRendered: true });
    },
    async native() {
      for (const [format, label, marker, tag] of [['bold', '加粗', '**', 'strong'], ['italic', '斜体', '*', 'em']]) {
        console.log(`Starting underline native-${format}`);
        const before = '正文 <u>甲乙丙丁</u> 结束。\n\n另一段落。';
        const after = `正文 <u>甲${marker}乙丙${marker}丁</u> 结束。\n\n另一段落。`;
        await open(before); await drag(page.locator('.workspace-leaf.mod-active .cm-html-embed u'), '乙丙');
        await page.getByRole('button', { name: label, exact: true }).click(); assert.equal(await value(), after);
        await button().waitFor({ state: 'visible' });
        assert.equal(await button().getAttribute('aria-pressed'), 'true');
        await undoRedo(before, after);
        await page.evaluate(async () => {
          const view = app.workspace.activeLeaf.view;
          await view.save();
          await app.workspace.activeLeaf.setViewState({ type: 'markdown', state: { file: view.file.path, mode: 'preview' } });
        });
        await page.locator(`.workspace-leaf.mod-active .markdown-preview-view u ${tag}`).filter({ hasText: '乙丙' }).waitFor();
        results.push({ case: `native-${format}`, nativeFormatting: true, readingModeInsideUnderline: true });
      }
    },
    async persistence() {
      const before = '正文 <u>甲乙丙丁</u> 结束。\n\n另一段落。', after = '正文 <u>甲</u>乙丙<u>丁</u> 结束。\n\n另一段落。';
      await open(before); await drag(page.locator('.workspace-leaf.mod-active .cm-html-embed u'), '乙丙');
      await button().click(); assert.equal(await value(), after);
      await page.evaluate(async () => {
        const view = app.workspace.activeLeaf.view, path = view.file.path;
        await view.save();
        await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath('test.md'));
        await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(path));
        await app.workspace.activeLeaf.setViewState({ type: 'markdown', state: { file: path, mode: 'source', source: false } });
      });
      assert.equal(await value(), after);
      try {
        await page.evaluate(async () => {
          await app.plugins.disablePlugin('quill');
          const path = app.workspace.activeLeaf.view.file.path;
          await app.workspace.activeLeaf.setViewState({ type: 'markdown', state: { file: path, mode: 'preview' } });
        });
        assert.equal(await page.locator('.quill-toolbar').count(), 0);
        const underlines = page.locator('.workspace-leaf.mod-active .markdown-preview-view u');
        await underlines.first().waitFor(); assert.deepEqual(await underlines.allTextContents(), ['甲', '丁']);
      } finally {
        await page.evaluate(() => app.plugins.enablePlugin('quill'));
      }
      results.push({ case: 'persistence', savedAndReopened: true, readableWithoutPlugin: true });
    }
  };
  assert(!filter || filter in cases, 'Unknown underline case');
  for (const [name, run] of Object.entries(cases)) if (!filter || filter === name) {
    console.log(`Starting underline ${name}`); await run(); console.log(`Passed underline ${name}`);
  }
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/obsidian-underline${filter ? '-' + filter : ''}.json`, JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ passed: results.length }));
} finally { await browser.close(); }
