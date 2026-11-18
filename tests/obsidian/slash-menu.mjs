// Real keyboard input + native command parity, only in a disposable Obsidian vault.
// node tests/obsidian/slash-menu.mjs <CDP endpoint> <disposable vault path>
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const [endpoint, expectedVault] = process.argv.slice(2);
const normalize = value => value.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
assert(endpoint && expectedVault, 'Provide a CDP endpoint and disposable vault path.');
assert(/\/quill-host-[^/]+\/vault$/.test(normalize(expectedVault)), 'Refusing a non-disposable vault.');
const browser = await chromium.connectOverCDP(endpoint);
try {
  const page = browser.contexts()[0].pages().find(page => page.url().startsWith('app://obsidian.md/'));
  assert(page, 'No Obsidian page found.');
  page.setDefaultTimeout(10000);
  const verifyVault = async () => assert.equal(normalize(await page.evaluate(() => app.vault.adapter.getBasePath())), normalize(expectedVault));
  await verifyVault();
  assert(await page.evaluate(() => Boolean(app.plugins.plugins.quill)), 'Install and enable the current build first.');
  await page.bringToFront();
  let serial = 0;
  async function open(text, source) {
    await verifyVault();
    await page.evaluate(async ({ text, source, name }) => {
      const file = await app.vault.create(name, text);
      const leaf = app.workspace.getLeaf();
      await leaf.openFile(file);
      await leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source', source } });
      const editor = app.workspace.activeEditor.editor;
      editor.setCursor(editor.offsetToPos(text.length));
      editor.focus();
    }, { text, source, name: `slash-menu-${Date.now()}-${serial++}.md` });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  const snapshot = () => page.evaluate(() => {
    const editor = app.workspace.activeEditor.editor;
    return { text: editor.getValue(), selections: editor.listSelections() };
  });
  const popup = page.locator('.line-insert-menu');
  const actions = [
    ['text', 'text', 'editor:set-heading-0'],
    ...[1, 2, 3, 4, 5, 6].map(level => [`heading${level}`, `heading ${level}`, `editor:set-heading-${level}`]),
    ['bulletList', 'bullet list', 'editor:toggle-bullet-list'],
    ['orderedList', 'ordered list', 'editor:toggle-numbered-list'],
    ['task', 'todo', 'editor:toggle-checklist-status'],
    ['code', 'codeblock', 'editor:insert-codeblock'],
    ['quote', 'blockquote', 'editor:toggle-blockquote'],
    ['callout', 'callout', 'editor:insert-callout'],
    ['math', 'equation', 'editor:insert-mathblock'],
    ['table', 'table', 'editor:insert-table'],
    ['divider', 'divider', 'editor:insert-horizontal-rule']
  ];
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  for (const source of [true, false]) {
    for (const [action, query, command] of actions) {
      const text = '现有正文 ';
      await open(text, source);
      assert(await page.evaluate(id => app.commands.executeCommandById(id), command));
      const reference = await snapshot();
      await open(text, source);
      await page.keyboard.type(`/${query}`);
      await popup.waitFor({ state: 'visible' });
      assert.equal(await popup.locator('input').count(), 0);
      assert(await page.evaluate(() => app.workspace.activeEditor.editor.cm.hasFocus));
      const before = await snapshot();
      await popup.locator(`[data-action="${action}"]`).click();
      await popup.waitFor({ state: 'detached' });
      const result = await snapshot();
      assert.deepEqual(result, reference, `${action}: slash must match the native command, including selection`);
      await page.keyboard.press(`${modifier}+z`);
      assert.deepEqual(await snapshot(), before, `${action}: one undo restores query and selection`);
      assert.equal(await popup.count(), 0, 'Undo must not reopen the menu.');
      await page.keyboard.press(`${modifier}+Shift+z`);
      assert.deepEqual(await snapshot(), result, `${action}: redo restores native result`);
      assert.equal(await popup.count(), 0);
      console.log('Passed slash/native parity and undo/redo:', { source, action });
    }

    for (const text of ['', '# ', '- ', '> ', '>']) {
      await open(text, source);
      await page.keyboard.type('/h2');
      await popup.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      assert.equal((await snapshot()).text, `${text}/h2`);
      assert.equal(await popup.count(), 0);
    }
    for (const text of ['https:', 'path', '```js\n', '$$\n', '---\nkey: ']) {
      await open(text, source);
      await page.keyboard.type('/');
      assert.equal(await popup.count(), 0, `Must not trigger after/in ${text}`);
    }
    await open('', source);
    await page.keyboard.type('/unmatched-action');
    await page.keyboard.press('Enter');
    assert.equal((await snapshot()).text, '/unmatched-action\n');
    assert.equal(await popup.count(), 0);
    await page.keyboard.type('/h2');
    await popup.waitFor({ state: 'visible' });
    await page.keyboard.press('Enter');
    assert.equal((await snapshot()).text, '/unmatched-action\n## ');

    await open('', source);
    await page.keyboard.type('/h2');
    await open('other source', source);
    assert.equal(await popup.count(), 0, 'Switching notes closes the old session.');
    console.log('Passed slash trigger/cancel/navigation scenarios:', { source });
  }
  console.log('All slash menu host scenarios passed. Real OS IME testing remains a separate manual check.');
} finally {
  await browser.close();
}
