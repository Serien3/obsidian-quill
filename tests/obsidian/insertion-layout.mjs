// Run only against a prepared, disposable Obsidian instance with the current build.
// node tests/obsidian/insertion-layout.mjs <CDP endpoint> <disposable vault path>
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const [endpoint, expectedVault] = process.argv.slice(2);
const normalize = value => value.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
assert(endpoint && expectedVault, 'Provide a CDP endpoint and disposable vault path.');
assert(/\/quill-host-[^/]+\/vault$/.test(normalize(expectedVault)), 'Refusing a non-disposable vault.');
const browser = await chromium.connectOverCDP(endpoint);
let page, cdp;
let verified = false;
try {
  page = browser.contexts()[0].pages().find(candidate => candidate.url().startsWith('app://obsidian.md/'));
  assert(page, 'No Obsidian page found.');
  const verifyVault = async () => assert.equal(normalize(await page.evaluate(() => app.vault.adapter.getBasePath())), normalize(expectedVault));
  await verifyVault();
  assert(await page.evaluate(() => Boolean(app.plugins.plugins.quill)), 'Install and enable the current build first.');
  verified = true;
  await page.evaluate(() => {
    if (window.electronWindow.isMinimized()) window.electronWindow.restore();
    window.electronWindow.show(); window.electronWindow.focus();
  });
  await page.bringToFront();
  cdp = await page.context().newCDPSession(page);
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  const snapshot = () => page.evaluate(() => {
    const editor = app.workspace.activeEditor.editor;
    const view = editor.cm;
    return {
      text: editor.getValue(),
      lines: [...view.contentDOM.querySelectorAll('.cm-line')].map(line => {
        const rect = line.getBoundingClientRect();
        return [rect.left, rect.top, rect.width, rect.height];
      })
    };
  });
  for (const source of [true, false]) {
    await verifyVault();
    await page.evaluate(async source => {
      const text = '# 标题\n\n' + '这是一段用于观察正文居中和自动换行的文字。'.repeat(12) + '\n\n- 列表\n\n> 引用';
      const file = await app.vault.create(`insertion-layout-${Date.now()}.md`, text);
      const leaf = app.workspace.getLeaf();
      await leaf.openFile(file);
      await leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source', source } });
      const editor = app.workspace.activeEditor.editor;
      editor.setCursor({ line: 2, ch: 2 });
      editor.focus();
    }, source);
    for (const width of [1400, 700]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await settle();
      const enabled = await snapshot();
      await verifyVault();
      await page.evaluate(() => app.plugins.disablePlugin('quill'));
      await settle();
      const disabled = await snapshot();
      await page.evaluate(() => {
        if (!app.plugins.plugins.quill) return app.plugins.enablePlugin('quill');
      });
      await settle();
      const reenabled = await snapshot();
      for (const result of [disabled, reenabled]) {
        assert.equal(result.text, enabled.text, 'Toggling Quill must preserve the source.');
        assert.equal(result.lines.length, enabled.lines.length);
        result.lines.forEach((rect, index) => rect.forEach((value, axis) => {
          assert(Math.abs(value - enabled.lines[index][axis]) < 0.5, `Body layout shifted: source=${source}, width=${width}`);
        }));
      }
      // Exercise the user's actual entry path after reload, including host caret layout.
      await page.locator('.workspace-leaf.mod-active .cm-line').filter({ hasText: '这是一段用于观察正文居中和自动换行的文字。' }).click({ position: { x: 16, y: 10 } });
      await settle();
      await page.waitForTimeout(300);
      const geometry = await page.evaluate(() => {
        const view = app.workspace.activeEditor.editor.cm;
        const button = document.querySelector('.line-insert-button');
        const rect = button.getBoundingClientRect();
        const from = view.state.doc.lineAt(view.state.selection.main.head).from;
        const node = view.domAtPos(from).node;
        const line = (node.nodeType === 1 ? node : node.parentElement).closest('.cm-line');
        const columnLeft = line.getBoundingClientRect().left;
        const first = view.coordsAtPos(from);
        return { visible: getComputedStyle(button).visibility === 'visible', gap: columnLeft - rect.right,
          centerError: (rect.top + rect.bottom - first.top - first.bottom) / 2 };
      });
      if (width === 1400) assert(geometry.visible, 'The wide editor must show the paragraph entry.');
      if (geometry.visible) {
        assert(Math.abs(geometry.gap - 16) < 0.5, `Entry must sit 16px before the content column: ${JSON.stringify({ source, width, ...geometry })}`);
        assert(Math.abs(geometry.centerError) < 0.5, 'Entry must be centered on the first visual row.');
      }
      console.log('Passed insertion layout:', { source, width, ...geometry });
    }
  }
} finally {
  try {
    if (verified && normalize(await page.evaluate(() => app.vault.adapter.getBasePath())) === normalize(expectedVault)) {
      await page.evaluate(() => {
        if (!app.plugins.plugins.quill) return app.plugins.enablePlugin('quill');
      });
    }
    if (cdp) await cdp.send('Emulation.clearDeviceMetricsOverride');
  } finally {
    await browser.close();
  }
}
