// Real pointer + native context-menu parity, only in a disposable Obsidian vault.
// node tests/obsidian/native-links.mjs <CDP endpoint> <Windows disposable vault path>
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [endpoint, expectedVault] = process.argv.slice(2);
const normalize = value => value.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
assert(endpoint && expectedVault);
assert(/\/quill-host-[^/]+\/vault$/.test(normalize(expectedVault)));
const browser = await chromium.connectOverCDP(endpoint);
let page, originalMarkdownLinks;
const results = [];
try {
  page = browser.contexts()[0].pages().find(page => page.url().startsWith('app://obsidian.md/'));
  assert(page);
  assert.equal(normalize(await page.evaluate(() => app.vault.adapter.getBasePath())), normalize(expectedVault));
  page.setDefaultTimeout(8000);
  await page.bringToFront();
  assert(await page.evaluate(() => Boolean(app.plugins.plugins['quill'])));
  originalMarkdownLinks = await page.evaluate(() => app.vault.getConfig('useMarkdownLinks'));
  const label = '原生链接目标';
  const source = `正文 ${label} 结束。\n\n另一段落。`;
  await page.evaluate(async label => {
    if (!app.vault.getAbstractFileByPath(`${label}.md`)) await app.vault.create(`${label}.md`, '原生链接目标笔记。');
  }, label);

  async function openSource() {
    await page.evaluate(async source => {
      const file = await app.vault.create(`native-links-${Date.now()}.md`, source);
      await app.workspace.getLeaf().openFile(file);
      await app.workspace.activeLeaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source', source: false } });
      app.workspace.activeEditor.editor.setCursor({ line: 2, ch: 0 });
      app.workspace.activeEditor.editor.focus();
    }, source);
    await page.locator('.workspace-leaf.mod-active .cm-line').filter({ hasText: '另一段落。' }).click();
    const points = await page.locator('.workspace-leaf.mod-active .cm-line').filter({ hasText: label }).first().evaluate((line, label) => {
      const start = line.textContent.indexOf(label), end = start + label.length;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let offset = 0, node;
      while ((node = walker.nextNode())) {
        const next = offset + node.textContent.length;
        if (start >= offset && start < next) range.setStart(node, start - offset);
        if (end > offset && end <= next) { range.setEnd(node, end - offset); break; }
        offset = next;
      }
      const rect = range.getBoundingClientRect();
      return { left: rect.left + 1, right: rect.right - 1, y: rect.y + rect.height / 2 };
    }, label);
    await page.mouse.move(points.left, points.y);
    await page.mouse.down();
    await page.mouse.move(points.right, points.y, { steps: 4 });
    await page.mouse.up();
    await page.getByRole('button', { name: '新增链接', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => app.workspace.activeEditor.editor.getSelection()), label);
    return points;
  }
  const snapshot = () => page.evaluate(() => {
    const editor = app.workspace.activeEditor.editor;
    return { source: editor.getValue(), selections: editor.listSelections() };
  });

  for (const useMarkdownLinks of [false, true]) {
    await page.evaluate(value => app.vault.setConfig('useMarkdownLinks', value), useMarkdownLinks);
    for (const [format, title] of [['internalLink', '新增链接'], ['externalLink', '新增外部链接']]) {
      await openSource();
      await page.getByRole('button', { name: title, exact: true }).click();
      assert.equal(await page.locator('.quill-toolbar').count(), 0);
      const toolbarCommand = await snapshot();
      if (format === 'externalLink') await page.keyboard.insertText('https://example.com/native-links');
      const toolbarFinal = await snapshot();

      // The reference is the actual right-click entry, not a reimplementation.
      const points = await openSource();
      await page.mouse.click((points.left + points.right) / 2, points.y, { button: 'right' });
      await page.locator('.menu-item-title').getByText(title, { exact: true }).click();
      const menuCommand = await snapshot();
      assert.deepEqual(toolbarCommand, menuCommand, 'Toolbar and native menu must produce the same document and cursor.');
      if (format === 'externalLink') await page.keyboard.insertText('https://example.com/native-links');
      const menuFinal = await snapshot();
      assert.deepEqual(toolbarFinal, menuFinal);

      await page.keyboard.press('Escape');
      await page.evaluate(() => app.workspace.activeEditor.editor.focus());
      await page.keyboard.press('Control+z');
      assert.notEqual((await snapshot()).source, menuFinal.source);
      await page.evaluate(() => app.workspace.activeEditor.editor.focus());
      await page.keyboard.press('Control+Shift+z');
      assert.equal((await snapshot()).source, menuFinal.source);
      if (format === 'internalLink') {
        await page.locator('.workspace-leaf.mod-active .cm-line').filter({ hasText: '另一段落。' }).click();
        await page.locator('.workspace-leaf.mod-active .cm-hmd-internal-link').filter({ hasText: label }).first().click({ modifiers: ['Control'] });
        await page.waitForFunction(label => app.workspace.activeEditor?.file?.path === `${label}.md`, label);
      } else {
        assert(menuFinal.source.includes(`[${label}](https://example.com/native-links)`));
      }
      results.push({ format, useMarkdownLinks, matchesContextMenu: true, cursorMatches: true, typingOrNavigation: true, undoRedo: true, result: menuFinal.source });
      console.log('Passed native link workflow:', format, { useMarkdownLinks });
    }
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/obsidian-native-links.json', JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ passed: results.length }));
} finally {
  if (page && originalMarkdownLinks !== undefined)
    await page.evaluate(value => app.vault.setConfig('useMarkdownLinks', value), originalMarkdownLinks);
  await browser.close();
}
