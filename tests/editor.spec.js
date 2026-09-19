import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { sample } from '../src/sample.js';
import { formulaTemplates, chartTemplates } from '../src/templates.js';
let app, page, folder, updateServer, release;
// A local stand-in for the GitHub releases API keeps update checks offline and deterministic.
test.beforeAll(async () => {
  updateServer = createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(release)); });
  await new Promise(resolve => updateServer.listen(0, '127.0.0.1', resolve));
});
test.afterAll(() => new Promise(resolve => updateServer.close(resolve)));
test.beforeEach(async ({}, testInfo) => {
  release = { tag_name: 'v0.0.1', html_url: 'https://github.com/Jelatine/mardar/releases/tag/v0.0.1', assets: [] };
  folder = await mkdtemp(path.join(tmpdir(), 'mardar-test-'));
  const startup = testInfo.title === 'cold launch opens the requested file without a save prompt';
  const startupFile = path.join(folder, 'cold.md');
  if (startup) await writeFile(startupFile, '# 冷启动\r\n');
  app = await electron.launch({ executablePath: process.env.MARDAR_APP_PATH, args: [...(process.env.MARDAR_APP_PATH ? [] : ['.']), `--user-data-dir=${folder}/profile`, '--no-sandbox', ...(startup ? [startupFile] : [])], env: { ...process.env, MARDAR_UPDATE_FEED: `http://127.0.0.1:${updateServer.address().port}/releases/latest` } });
  page = await app.firstWindow();
  await expect(page.locator('#editor')).toHaveValue(startup ? '# 冷启动\n' : '');
  await expect(page.locator('#dirty')).toBeEmpty();
  await expect(page.locator('.panes')).toHaveAttribute('data-view', startup ? 'read' : 'live');
  if (!startup) await page.locator('button[data-view=split]').click();
});
test.afterEach(async () => {
  if (!app) return;
  try {
    // Closing the last window quits the process on Windows/Linux. Only ask a
    // running window's process to discard edits; close() also handles exited apps.
    if (app.windows().length) {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy()));
    }
  } finally {
    await app.close();
    app = undefined;
  }
});
async function chooseOpen(file) { await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file); }
async function chooseSave(file) { await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, file); }
test('renders math, diagram, code and switches reading mode', async () => {
  await page.locator('#editor').fill(sample);
  await expect(page.locator('#preview .katex').first()).toBeVisible();
  await expect(page.locator('#preview .mermaid svg')).toBeVisible();
  await expect(page.locator('#preview .mermaid svg')).toContainText('捕捉灵感');
  const scriptPosition = await page.locator('#preview .katex').first().evaluate(el => {
    const script = el.querySelector('.msupsub');
    return { scriptY: script.querySelector('.mord').getBoundingClientRect().y, baseY: script.previousElementSibling.getBoundingClientRect().y };
  });
  expect(scriptPosition.scriptY).toBeLessThan(scriptPosition.baseY);
  await expect(page.locator('#preview .hljs-keyword').first()).toBeVisible();
  const radical = page.locator('#preview .sqrt svg');
  expect(await radical.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(10);
  await page.locator('button[data-view=read]').click();
  await expect(page.locator('#editor')).toBeHidden();
  await page.locator('button[data-view=split]').click();
  await expect(page.locator('#editor')).toBeVisible();
  await page.screenshot({ path: 'test-results/welcome.png', fullPage: true });
  await chooseSave(path.join(folder, 'welcome.pdf'));
  await page.locator('#pdf').click();
  await expect(page.locator('#status')).toContainText('PDF 已导出');
  await copyFile(path.join(folder, 'welcome.pdf'), 'test-results/welcome.pdf');
  console.log(`PDF visual QA: ${path.join(folder, 'welcome.pdf')}`);
});
test('opens markdown with relative image, saves changes, exports PDF', async () => {
  const file = path.join(folder, 'document.md');
  await writeFile(path.join(folder, 'pixel.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="green"/></svg>');
  await writeFile(file, '# 文件测试\n\n![本地图片](pixel.svg)\n\n$E=mc^2$\n\n```mermaid\ngraph LR\nA-->B\n```');
  await chooseOpen(file); await page.locator('#open').click();
  await expect(page.locator('#preview h1')).toHaveText('文件测试');
  await expect.poll(() => page.locator('#preview img').evaluate(img => img.naturalWidth)).toBe(100);
  await expect(page.locator('.panes')).toHaveAttribute('data-view', 'read');
  await expect(page.locator('button[data-view=read]')).toHaveClass('selected');
  await page.locator('button[data-view=split]').click();
  await page.locator('#editor').fill('# 已保存\n\n$E=mc^2$\n\n![本地图片](pixel.svg)\n\n```mermaid\ngraph LR\nA-->B\n```');
  await page.locator('#save').click();
  await expect.poll(() => readFile(file, 'utf8')).toContain('# 已保存');
  await expect(page.locator('#status')).toHaveText('文档已保存');
  const pdf = path.join(folder, 'document.pdf'); await chooseSave(pdf);
  await page.locator('#pdf').click(); await expect(page.locator('#status')).toContainText('PDF 已导出', { timeout: 30000 });
  const bytes = await readFile(pdf); expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect(bytes.length).toBeGreaterThan(5000);
  await copyFile(pdf, 'test-results/document.pdf');
  await page.screenshot({ path: 'test-results/editor.png', fullPage: true });
});
test('embedded HTML keeps image zoom and sanitizes scripts', async () => {
  const file = path.join(folder, 'embedded.md');
  await writeFile(file, '# HTML 片段\n\n<img src="missing.png" style="zoom:60%;position:fixed" onerror="window.hacked=true" />\n\n<script>window.hacked=true</script>');
  await chooseOpen(file); await page.locator('#open').click();
  await expect(page.locator('#preview h1')).toHaveText('HTML 片段');
  expect(await page.locator('#preview img').evaluate(img => img.style.zoom)).toBe('60%');
  expect(await page.locator('#preview img').evaluate(img => img.style.position)).toBe('');
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  await page.locator('#recent summary').click();
  await expect(page.locator('#recent-list')).toContainText('embedded.md');
  await page.locator('#about').click(); await expect(page.locator('dialog[open]')).toContainText('提交哈希');
});
test('live editing preserves Markdown and supports save', async () => {
  await page.locator('#editor').fill('# 标题\n\n正文 **粗体**\n');
  await page.locator('button[data-view=live]').click();
  await expect(page.locator('#live strong')).toHaveText('粗体');
  await page.locator('#live h1').click();
  await page.locator('#live textarea').fill('# 新标题');
  await page.locator('#live textarea').press('Escape');
  await expect(page.locator('#live h1')).toHaveText('新标题');
  const file = path.join(folder, 'live.md'); await chooseSave(file); await page.locator('#save').click();
  await expect.poll(() => readFile(file, 'utf8')).toBe('# 新标题\n\n正文 **粗体**\n');
});
test('unsaved edits protect switching but startup ignores legacy drafts', async () => {
  await page.locator('#editor').fill('# 未保存的草稿');
  await page.locator('#new').click(); await expect(page.locator('#confirm')).toBeVisible();
  await page.locator('[data-choice=cancel]').click(); await expect(page.locator('#editor')).toHaveValue('# 未保存的草稿');
  await page.evaluate(() => localStorage.setItem('mardar-draft', JSON.stringify({ content: '# 旧草稿', name: '旧文档.md' })));
  await page.reload(); await expect(page.locator('#editor')).toHaveValue('');
  await expect(page.locator('#name')).toHaveText('未命名.md');
  await expect(page.locator('#dirty')).toBeEmpty();
});
test('invalid chart is contained and preview recovers', async () => {
  await page.locator('#editor').fill('# 保留正文\n\n```mermaid\nnot-a-valid-diagram !!!\n```');
  await expect(page.locator('#preview .diagram-error')).toContainText('图表语法有误');
  await expect(page.locator('#preview h1')).toHaveText('保留正文');
  await page.locator('#editor').fill('# 修复后\n\n```mermaid\ngraph TD\nA-->B\n```');
  await expect(page.locator('#preview .mermaid svg')).toBeVisible();
});
test('new document embeds selected image and handles save cancellation', async () => {
  await page.locator('button[data-view=read]').click();
  await page.locator('#new').click();
  await expect(page.locator('.panes')).toHaveAttribute('data-view', 'live');
  await expect(page.locator('button[data-view=live]')).toHaveClass('selected');
  await expect(page.locator('#live textarea')).toBeFocused();
  await page.locator('button[data-view=split]').click();
  await page.locator('#editor').fill('# 图片笔记\n\n');
  const image = path.join(folder, 'picture.svg');
  await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="70" height="40"><rect width="70" height="40" fill="blue"/></svg>');
  await page.locator('#editor').press('ControlOrMeta+End');
  await chooseOpen(image); await page.locator('#image').click(); await page.getByRole('menuitem', { name: 'Base64 嵌入图片', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue(/data:image\/svg\+xml;base64,/);
  await expect.poll(() => page.locator('#preview img').evaluate(img => img.naturalWidth)).toBe(70);
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
  await page.locator('#save').click(); await expect(page.locator('#dirty')).toHaveText('●');
  const file = path.join(folder, 'images.md'); await chooseSave(file); await page.locator('#save').click();
  await expect.poll(() => readFile(file, 'utf8')).toContain('data:image/svg+xml;base64,');
  await expect(page.locator('#dirty')).toBeEmpty();
});
test('file drop protects edits and keeps the native save path', async () => {
  const file = path.join(folder, '拖入.MD'); await writeFile(file, '# 拖入文档');
  await page.locator('#file').setInputFiles(file);
  await expect(page.locator('#editor')).toHaveValue('# 拖入文档');
  // Use a separate input to obtain a real disk-backed File without invoking open.
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'drop-test'; document.body.append(input); });
  await page.locator('#drop-test').setInputFiles(file);
  const drop = () => page.evaluate(() => {
    const dataTransfer = new DataTransfer(); dataTransfer.items.add(document.querySelector('#drop-test').files[0]);
    document.querySelector('.sidebar').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  await page.locator('button[data-view=split]').click();
  await page.locator('#editor').fill('# 保留编辑');
  await drop(); await expect(page.locator('#confirm')).toBeVisible();
  await page.locator('[data-choice=cancel]').click();
  await expect(page.locator('#editor')).toHaveValue('# 保留编辑');
  await drop(); await page.locator('[data-choice=discard]').click();
  await expect(page.locator('#preview h1')).toHaveText('拖入文档');
  await expect(page.locator('#dirty')).toBeEmpty();
  expect(await page.evaluate(() => window.desktop.recent())).toContain(file);
  await page.locator('button[data-view=split]').click();
  await page.locator('#editor').fill('# 拖入后保存'); await page.locator('#save').click();
  await expect.poll(() => readFile(file, 'utf8')).toBe('# 拖入后保存');
});

test('OS open request protects unsaved edits and opens in the same window', async () => {
  const file = path.join(folder, 'external.md'); await writeFile(file, '# 系统打开');
  await page.locator('#editor').fill('# 尚未保存');
  await app.evaluate(({ app }, file) => app.emit('second-instance', {}, ['mardar', file]), file);
  await expect(page.locator('#confirm')).toBeVisible();
  await page.locator('[data-choice=cancel]').click();
  await expect(page.locator('#editor')).toHaveValue('# 尚未保存');
  await expect.poll(() => page.evaluate(() => window.desktop.pending())).toBeNull();
  await app.evaluate(({ app }, file) => app.emit('second-instance', {}, ['mardar', file]), file);
  await expect(page.locator('#confirm')).toBeVisible();
  await page.locator('[data-choice=discard]').click();
  await expect(page.locator('#preview h1')).toHaveText('系统打开');
  expect(app.windows().length).toBe(1);
});

test('CRLF files and fully reverted edits stay clean when switching and closing', async () => {
  const file = path.join(folder, 'windows.md');
  await writeFile(file, '# Windows\r\n\r\n正文\r\n');
  await chooseOpen(file); await page.locator('#open').click();
  const original = '# Windows\n\n正文\n';
  await expect(page.locator('#editor')).toHaveValue(original);
  await expect(page.locator('#dirty')).toBeEmpty();
  await page.locator('button[data-view=split]').click();
  await page.locator('#editor').fill(original + '修改');
  await expect(page.locator('#dirty')).toHaveText('●');
  await page.locator('#editor').fill(original);
  await expect(page.locator('#dirty')).toBeEmpty();
  await page.locator('#new').click();
  await expect(page.locator('#editor')).toHaveValue('');
  await expect(page.locator('#live textarea')).toBeFocused();
  await page.locator('button[data-view=split]').click();
  await page.locator('#editor').pressSequentially('temporary');
  for (let i = 0; i < 9 && await page.locator('#editor').inputValue(); i++) {
    await page.locator('#editor').press('ControlOrMeta+z');
  }
  await expect(page.locator('#editor')).toHaveValue('');
  await expect(page.locator('#dirty')).toBeEmpty();
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => { throw new Error('Unexpected save prompt'); }; });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(() => app.windows().length).toBe(0);
});
test('system open immediately after startup does not ask to save', async () => {
  const file = path.join(folder, 'startup.md'); await writeFile(file, '# 直接打开\r\n');
  await app.evaluate(({ app }, file) => app.emit('open-file', { preventDefault() {} }, file), file);
  await expect(page.locator('#preview h1')).toHaveText('直接打开');
  await expect(page.locator('#confirm')).not.toBeVisible();
  await expect(page.locator('#dirty')).toBeEmpty();
});

test('cold launch opens the requested file without a save prompt', async () => {
  await expect(page.locator('#preview h1')).toBeVisible();
  await expect(page.locator('button[data-view=read]')).toHaveClass('selected');
  await expect(page.locator('#preview h1')).toHaveText('冷启动');
  await expect(page.locator('#confirm')).not.toBeVisible();
});

test('cleanup handles an application that has already exited', async () => {
  await app.close();
  expect(app.windows()).toHaveLength(0);
});

test('live document scroll stays contained and history survives paragraph blur', async () => {
  await page.locator('#editor').fill(Array.from({ length: 100 }, (_, i) => `## Heading ${i}\n\nParagraph ${i}\n`).join('\n'));
  await page.locator('button[data-view=live]').click();
  const bounds = await page.locator('#live').evaluate(el => ({ right: el.getBoundingClientRect().right, windowRight: innerWidth, scrolls: el.scrollHeight > el.clientHeight }));
  expect(bounds.right).toBe(bounds.windowRight);
  expect(bounds.scrolls).toBe(true);
  await page.locator('#live h2').first().click();
  await page.locator('#live textarea').fill('## Changed');
  await page.locator('#live textarea').press('Escape');
  await expect(page.locator('#live h2').first()).toHaveText('Changed');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#live h2').first()).toHaveText('Heading 0');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('#live h2').first()).toHaveText('Changed');
  await page.locator('#live').evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await expect(page.locator('footer')).toBeInViewport();
  await expect(page.locator('.toolbar')).toBeInViewport();
  await page.locator('#toggle-sidebar').click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.locator('#toggle-sidebar').click();
  await expect(page.locator('.sidebar')).toBeVisible();
});
test('split preview and source locate the same paragraph', async () => {
  await page.locator('#editor').fill('# First\n\nSecond paragraph\n\n## Third\n');
  await page.locator('#preview h2').click();
  expect(await page.locator('#editor').evaluate(el => el.selectionStart)).toBe(27);
  await page.locator('#editor').evaluate(el => el.setSelectionRange(1, 1));
  await page.locator('#editor').press('ArrowLeft');
  await expect(page.locator('#preview h1')).toHaveClass(/source-active/);
});

test('split scrolling follows in both directions', async () => {
  await page.locator('#editor').fill(Array.from({ length: 80 }, (_, i) => `## Section ${i}\n\nText ${i} with **formatting**.\n`).join('\n'));
  await expect(page.locator('#preview h2')).toHaveCount(80);
  await page.locator('#editor').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => page.locator('#preview').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
  await page.waitForTimeout(150);
  await page.locator('#preview').evaluate(el => { el.scrollTop = 0; });
  await expect.poll(() => page.locator('#editor').evaluate(el => el.scrollTop)).toBe(0);
});

test('continuous live typing undoes as a group with pause and paragraph boundaries', async () => {
  await page.locator('button[data-view=live]').click();
  await page.locator('.live-block').click();
  await page.locator('#live textarea').pressSequentially('first phrase');
  await page.waitForTimeout(1000);
  await page.locator('#live textarea').pressSequentially(' second phrase');
  await page.locator('#live textarea').press('Escape');
  await page.locator('#undo').click();
  await expect(page.locator('#editor')).toHaveValue('first phrase');
  await page.locator('#undo').click();
  await expect(page.locator('#editor')).toHaveValue('');
  await page.locator('#redo').click();
  await expect(page.locator('#editor')).toHaveValue('first phrase');
  await page.locator('.live-block').click();
  await page.locator('#live textarea').pressSequentially('replacement');
  await expect(page.locator('#redo')).toBeDisabled();
});
test('insertion menus offer headings, languages, formulas, charts and HTML images', async () => {
  await page.locator('#heading').click();
  await page.getByRole('menuitem', { name: 'H3 · 3 级标题', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('### ');
  await page.locator('#heading').click();
  await page.getByRole('menuitem', { name: 'H2 · 2 级标题', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('## ');
  await page.locator('#code').click();
  await page.getByRole('menuitem', { name: 'python', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue(/```python/);
  await page.locator('#math').click();
  await page.getByRole('menuitem', { name: '矩阵', exact: true }).click();
  await expect(page.locator('#preview .katex')).toHaveCount(1);
  await page.locator('#chart').click();
  await page.getByRole('menuitem', { name: '时序图', exact: true }).click();
  await expect(page.locator('#preview .mermaid svg')).toBeVisible();
  const image = path.join(folder, 'html.svg');
  await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="70" height="40"><rect width="70" height="40" fill="blue"/></svg>');
  await chooseOpen(image); await page.locator('#image').click();
  await page.getByRole('menuitem', { name: 'HTML <img>（可调整宽度）', exact: true }).click();
  await page.getByRole('button', { name: '选择本地图片', exact: true }).click();
  await page.getByRole('button', { name: '插入', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue(/<img src="file:/);
  await expect.poll(() => page.locator('#preview img').evaluate(el => el.naturalWidth)).toBe(70);
});
test('native title controls follow theme and PDF canvas stays white', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win.setTitleBarOverlay) return;
    const original = win.setTitleBarOverlay.bind(win);
    win.setTitleBarOverlay = options => { globalThis.lastOverlay = options; return original(options); };
  });
  await page.locator('#theme').click();
  await expect(page.locator('body')).toHaveClass(/dark/);
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
  if (process.platform !== 'darwin') expect(await app.evaluate(() => globalThis.lastOverlay.color)).toBe('#202820');
  await expect(page.locator('body')).toHaveCSS('color-scheme', 'dark');
  await page.locator('#editor').fill('Text `inline code`');
  await expect(page.locator('#preview p code')).toHaveCSS('color', 'rgb(228, 237, 221)');
  await expect(page.locator('#preview p code')).toHaveCSS('background-color', 'rgb(54, 67, 48)');
  await page.locator('#about').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  if (process.platform !== 'darwin') {
    await expect.poll(() => app.evaluate(() => globalThis.lastOverlay.color)).toBe('#1f2b24');
    expect(await app.evaluate(() => globalThis.lastOverlay.height)).toBe(47);
  }
  await page.keyboard.press('Escape');
  if (process.platform !== 'darwin') await expect.poll(() => app.evaluate(() => globalThis.lastOverlay.color)).toBe('#202820');
  await page.locator('#editor').fill('# White page\n\nBody text.');
  const pdf = path.join(folder, 'dark-theme.pdf'); await chooseSave(pdf); await page.locator('#pdf').click();
  await expect(page.locator('#status')).toContainText('PDF 已导出');
  await copyFile(pdf, 'test-results/dark-theme.pdf');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor())).toMatch(/#(?:ff)?ffffff/i);
  await page.locator('#theme').click();
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light');
  if (process.platform !== 'darwin') expect(await app.evaluate(() => globalThis.lastOverlay.color)).toBe('#ffffff');
  await expect(page.locator('.active-doc')).toHaveCount(0);
  await expect(page.locator('.sidebar-footer #about')).toBeVisible();
  await page.screenshot({ path: 'test-results/toolbar-light.png', animations: 'disabled' });
  await page.locator('#theme').click();
  await page.locator('#math').click();
  await page.screenshot({ path: 'test-results/toolbar-dark.png', animations: 'disabled' });
});

test('all built-in chart and formula templates render without errors', async () => {
  for (const [label] of chartTemplates) {
    const previousId = await page.locator('#preview .mermaid svg').evaluateAll(nodes => nodes[0]?.id);
    await page.locator('#editor').fill('');
    await page.locator('#chart').click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page.locator('#preview .mermaid svg')).toBeVisible();
    if (previousId) await expect(page.locator('#preview .mermaid svg')).not.toHaveAttribute('id', previousId);
    await expect(page.locator('#preview .diagram-error')).toHaveCount(0);
  }
  for (const [label, formula] of formulaTemplates) {
    await page.locator('#editor').fill('');
    await page.locator('#math').click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page.locator('#preview .katex')).toHaveCount(1);
    await expect(page.locator('#preview annotation')).toHaveText(formula);
    await expect(page.locator('#preview .katex-error')).toHaveCount(0);
  }
});
test('live insertion preserves selected text and current editing mode', async () => {
  await page.locator('#editor').fill('first\n\nsecond paragraph');
  await page.locator('button[data-view=live]').click();
  await page.locator('.live-block').last().click();
  await page.locator('#live textarea').selectText();
  await page.locator('[data-wrap="**"]').click();
  await expect(page.locator('.panes')).toHaveAttribute('data-view', 'live');
  await expect(page.locator('#editor')).toHaveValue('first\n\n**second paragraph**');
  await page.locator('#undo').click();
  await expect(page.locator('#editor')).toHaveValue('first\n\nsecond paragraph');
});
test('empty live document is editable from anywhere in the page', async () => {
  await page.locator('button[data-view=live]').click();
  await expect(page.locator('#live textarea')).toBeFocused();
  await page.locator('#live textarea').press('Escape');
  await expect(page.locator('#live .live-placeholder')).toBeVisible();
  const box = await page.locator('#live').boundingBox();
  await page.mouse.click(box.x + box.width - 40, box.y + box.height - 40);
  await expect(page.locator('#live textarea')).toBeFocused();
  await page.keyboard.type('# 标题');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.keyboard.type('第一段');
  await expect(page.locator('#editor')).toHaveValue('# 标题\n\n第一段');
  await page.locator('#new').click();
  await page.locator('[data-choice=discard]').click();
  await expect(page.locator('#live textarea')).toBeFocused();
});
test('live clicks place the caret and arrows move between paragraphs', async () => {
  await page.locator('#editor').fill('# Title\n\nHello **bold** world\n\nLast line');
  await page.locator('button[data-view=live]').click();
  const word = page.locator('#live strong');
  const box = await word.boundingBox();
  await page.mouse.click(box.x + 1, box.y + box.height / 2);
  await expect(page.locator('#live textarea')).toBeFocused();
  expect(await page.locator('#live textarea').evaluate(el => el.value.slice(0, el.selectionStart))).toMatch(/^Hello \*{0,2}b?$/);
  await page.locator('#live textarea').evaluate(el => el.setSelectionRange(0, 0));
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#live textarea')).toHaveValue('# Title');
  expect(await page.locator('#live textarea').evaluate(el => el.selectionStart)).toBe(7);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#live textarea')).toHaveValue('Hello **bold** world');
  expect(await page.locator('#live textarea').evaluate(el => el.selectionStart)).toBe(0);
  const pane = await page.locator('#live').boundingBox();
  await page.mouse.click(pane.x + pane.width / 2, pane.y + pane.height - 20);
  await expect(page.locator('#live textarea')).toHaveCount(0);
  await page.mouse.click(pane.x + pane.width - 30, pane.y + pane.height - 30);
  await expect(page.locator('#live textarea')).toHaveValue('Last line');
  expect(await page.locator('#live textarea').evaluate(el => el.selectionStart)).toBe(9);
  await page.locator('#live textarea').evaluate(el => el.setSelectionRange(0, 0));
  await page.keyboard.press('Backspace');
  await expect(page.locator('#editor')).toHaveValue('# Title\n\nHello **bold** world\nLast line');
  await expect(page.locator('#live textarea')).toBeFocused();
});
test('about shows author and repository and checks for updates', async () => {
  await page.locator('#about').click();
  const about = page.locator('dialog.about[open]');
  await expect(about).toContainText('Jelatine');
  await expect(about.locator('a')).toHaveText('github.com/Jelatine/mardar');
  await about.getByRole('button', { name: '检查更新' }).click();
  await expect(about.locator('.update-status')).toContainText('当前已是最新版本');
  release = { tag_name: 'v99.0.0', html_url: 'https://github.com/Jelatine/mardar/releases/tag/v99.0.0', assets: [] };
  await about.getByRole('button', { name: '检查更新' }).click();
  await expect(about.locator('.update-status')).toContainText('发现新版本 v99.0.0');
  await expect(about.getByRole('button', { name: '前往下载' })).toBeVisible();
  await expect(page.locator('#update-notice')).toHaveText('新版本 v99.0.0 可用');
  await app.evaluate(({ shell }) => { shell.openExternal = async url => { globalThis.openedUrl = url; }; });
  await about.getByRole('button', { name: '前往下载' }).click();
  await expect.poll(() => app.evaluate(() => globalThis.openedUrl)).toBe('https://github.com/Jelatine/mardar/releases/tag/v99.0.0');
  expect(await page.evaluate(() => window.desktop.openExternal('https://example.com').then(() => 'opened', e => e.message))).toContain('不允许');
});

test('system open replaces a focused live paragraph without blanking the document', async () => {
  await page.locator('button[data-view=live]').click();
  await expect(page.locator('#live textarea')).toBeFocused();
  const file = path.join(folder, 'live-open.md');
  await writeFile(file, '# 系统文件\n\n正文内容');
  await app.evaluate(({ app }, file) => app.emit('second-instance', {}, ['mardar', file]), file);
  await expect(page.locator('#live h1')).toHaveText('系统文件');
  await expect(page.locator('#live')).toContainText('正文内容');
  await expect(page.locator('#live textarea')).toHaveCount(0);
});
test('image paths support manual entry, cancellation and relative local files', async () => {
  const file = path.join(folder, 'paths.md'), image = path.join(folder, '图 (1).svg');
  await writeFile(file, '');
  await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"></svg>');
  await chooseOpen(file); await page.locator('#open').click();
  const openPath = async () => { await page.locator('#image').click(); await page.getByRole('menuitem', { name: 'Markdown 图片', exact: true }).click(); };
  await openPath(); await page.locator('.image-path-dialog input').fill('unused.png');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('');
  await openPath(); await chooseOpen(image);
  await page.getByRole('button', { name: '选择本地图片', exact: true }).click();
  await expect(page.locator('.image-path-dialog input')).toHaveValue(encodeURIComponent('图 (1).svg'));
  await page.getByRole('button', { name: '插入', exact: true }).click();
  await expect(page.locator('#preview img')).toBeVisible();
  await expect.poll(() => page.locator('#preview img').evaluate(img => img.naturalWidth)).toBe(30);
  await openPath(); await page.locator('.image-path-dialog input').fill('https://example.com/photo (2).png');
  await page.getByRole('button', { name: '插入', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue(/https:\/\/example.com\/photo%20\(2\).png/);
});

test('unsaved live documents insert and render absolute image paths', async () => {
  const image = path.join(folder, 'absolute #1.svg');
  await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>');
  await page.locator('button[data-view=live]').click();
  await page.locator('#image').click();
  await page.getByRole('menuitem', { name: 'Markdown 图片', exact: true }).click();
  await chooseOpen(image); await page.getByRole('button', { name: '选择本地图片', exact: true }).click();
  await expect(page.locator('.image-path-dialog input')).toHaveValue(/^file:\/\//);
  await page.getByRole('button', { name: '插入', exact: true }).click();
  await page.locator('#live textarea').press('Escape');
  await expect.poll(() => page.locator('#live img').evaluate(img => img.naturalWidth)).toBe(40);
  await expect(page.locator('.panes')).toHaveAttribute('data-view', 'live');
});

test('close confirmation cancels, survives canceled saving and saves before closing', async () => {
  await page.locator('#editor').fill('# 未保存的关闭测试');
  const close = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await close(); await expect(page.locator('#confirm')).toContainText('关闭前保存更改');
  await close(); await page.locator('[data-choice=cancel]').click();
  await expect(page.locator('#editor')).toHaveValue('# 未保存的关闭测试');
  await close();
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
  await page.locator('[data-choice=save]').click();
  await expect(page.locator('#confirm')).not.toBeVisible();
  await expect(page.locator('#dirty')).toHaveText('●');
  const file = path.join(folder, 'closed.md'); await chooseSave(file); await close();
  await page.locator('[data-choice=save]').click();
  await expect.poll(() => readFile(file, 'utf8')).toBe('# 未保存的关闭测试');
  await expect.poll(() => app.windows().length).toBe(0);
});
test('table inserts at the live caret and undo restores the document', async () => {
  await page.locator('#editor').fill('# 表格测试');
  await page.locator('button[data-view=live]').click(); await page.locator('#live h1').click();
  await page.locator('#live textarea').press('End');
  await page.locator('#table').click();
  await page.locator('[name=columns]').fill('2'); await page.locator('[name=rows]').fill('4');
  await page.getByRole('button', { name: '插入', exact: true }).click();
  await page.locator('#live textarea').press('Escape');
  await expect(page.locator('#live th')).toHaveCount(2); await expect(page.locator('#live tbody tr')).toHaveCount(4);
  await page.locator('#undo').click(); await expect(page.locator('#editor')).toHaveValue('# 表格测试');
});
test('URL images reject non-network schemes', async () => {
  await page.locator('#image').click(); await page.getByRole('menuitem', { name: '网络 URL', exact: true }).click();
  await page.locator('.image-path-dialog input').fill('javascript:alert(1)');
  await page.getByRole('button', { name: '插入', exact: true }).click();
  await expect(page.locator('.image-path-dialog')).toBeVisible();
  await page.locator('.image-path-dialog input').fill('https://example.com/image.png');
  await page.getByRole('button', { name: '插入', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('![图片](<https://example.com/image.png>)');
});

test('near image paths are relative and distant paths are absolute', async () => {
  const directory = path.join(folder, 'a', 'b', 'c'); await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'note.md'); await writeFile(file, '');
  await chooseOpen(file); await page.locator('#open').click();
  const near = path.join(folder, 'a', 'near.svg'), far = path.join(folder, 'far.svg');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>';
  await writeFile(near, svg); await writeFile(far, svg);
  for (const [image, expected] of [[near, '../../near.svg'], [far, pathToFileURL(far).href]]) {
    await chooseOpen(image);
    const result = await page.evaluate(() => window.desktop.image('path'));
    expect(result.url).toBe(expected);
  }
});
test('discard closes a dirty window without writing a file', async () => {
  await page.locator('#editor').fill('# 放弃修改');
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showSaveDialog = async () => { throw new Error('Unexpected save'); };
    BrowserWindow.getAllWindows()[0].close();
  });
  await page.locator('[data-choice=discard]').click();
  await expect.poll(() => app.windows().length).toBe(0);
});

test('Ctrl click opens local Markdown links and protects unsaved edits', async () => {
  const notes = path.join(folder, 'notes'), docs = path.join(folder, 'docs');
  await mkdir(notes); await mkdir(docs);
  const sourceFile = path.join(notes, 'index.md'), target = path.join(docs, '政策 部署.md');
  const source = '[部署](../docs/政策%20部署.md#目标)\n\n[缺失](missing.md)\n\n[绝对链接](' + pathToFileURL(target).href + ')';
  await writeFile(sourceFile, source); await writeFile(target, '# 目标\n\n部署说明');
  for (const mode of ['read', 'split', 'live']) {
    await chooseOpen(sourceFile); await page.locator('#open').click();
    await page.locator(`button[data-view=${mode}]`).click();
    const host = mode === 'live' ? '#live' : '#preview';
    await page.locator(host).getByRole('link', { name: '部署', exact: true }).click();
    await expect(page.locator('#name')).toHaveText('index.md');
    await page.locator(host).getByRole('link', { name: '部署', exact: true }).click({ modifiers: ['Control'] });
    await expect(page.locator('#name')).toHaveText('政策 部署.md');
    await expect(page.locator('#editor')).toHaveValue('# 目标\n\n部署说明');
  }
  await chooseOpen(sourceFile); await page.locator('#open').click();
  await page.locator('#preview').getByRole('link', { name: '缺失', exact: true }).click({ modifiers: ['Control'] });
  await expect(page.locator('#status')).toContainText('打开失败');
  await expect(page.locator('#name')).toHaveText('index.md');
  await page.locator('button[data-view=split]').click();
  await page.locator('#editor').fill(source + '\n\n未保存');
  const link = page.locator('#preview').getByRole('link', { name: '绝对链接', exact: true });
  await link.click({ modifiers: ['Control'] });
  await page.locator('[data-choice=cancel]').click();
  await expect(page.locator('#editor')).toHaveValue(source + '\n\n未保存');
  await link.click({ modifiers: ['Control'] });
  await page.locator('[data-choice=discard]').click();
  await expect(page.locator('#name')).toHaveText('政策 部署.md');
});

test('document anchors scroll in reading, split and live modes', async () => {
  const source = '- [1. 简介](#1-简介)\n- [重复](#1-简介-1)\n- [深层](#深层)\n\n' + '占位段落。\n\n'.repeat(45) + '# 1. 简介\n\n正文\n\n# 1. 简介\n\n###### 深层\n\n' + '结尾\n\n'.repeat(20);
  await page.locator('#editor').fill(source);
  await expect(page.locator('#preview h1').first()).toHaveAttribute('id', '1-简介');
  for (const mode of ['read', 'split', 'live']) {
    await page.locator(`button[data-view=${mode}]`).click();
    const host = mode === 'live' ? '#live' : '#preview';
    await expect(page.locator(`${host} h1`).nth(1)).toHaveAttribute('id', '1-简介-1');
    for (const label of ['1. 简介', '重复', '深层']) {
      await page.locator(host).evaluate(el => { el.style.scrollBehavior = 'auto'; el.scrollTop = 0; });
      await page.locator(host).getByRole('link', { name: label, exact: true }).click();
      await expect.poll(() => page.locator(host).evaluate(el => el.scrollTop)).toBeGreaterThan(500);
      if (mode === 'live') await expect(page.locator('#live textarea')).toHaveCount(0);
    }
  }
});

test('Mermaid follows light and dark themes in preview and live mode', async () => {
  await page.locator('#editor').fill('```mermaid\nflowchart LR\n A[开始] --> B[完成]\n```');
  const node = page.locator('#preview .mermaid .node rect').first();
  await expect(node).toBeVisible();
  const light = await node.evaluate(el => getComputedStyle(el).fill);
  await page.locator('button[data-view=live]').click();
  await expect(page.locator('#live .mermaid svg')).toBeVisible();
  await page.locator('#theme').click();
  await expect.poll(() => node.evaluate(el => getComputedStyle(el).fill)).not.toBe(light);
  await expect.poll(() => page.locator('#live .mermaid .node rect').first().evaluate(el => getComputedStyle(el).fill)).not.toBe(light);
  await page.locator('#theme').click();
  await expect.poll(() => node.evaluate(el => getComputedStyle(el).fill)).toBe(light);
  await expect.poll(() => page.locator('#live .mermaid .node rect').first().evaluate(el => getComputedStyle(el).fill)).toBe(light);
});

test('text search supports options, navigation and invalid regex', async () => {
  await page.locator('#editor').fill('Cat cat scatter cat. a+b\n猫 猫咪\n123 456');
  await page.keyboard.press('Control+f');
  const query = page.locator('#search-query'), count = page.locator('#search-count');
  await query.fill('cat');
  await expect(count).toHaveText('1 / 4');
  await query.press('Enter'); await expect(count).toHaveText('2 / 4');
  await query.press('Shift+Enter'); await expect(count).toHaveText('1 / 4');
  await page.locator('#search-word').check(); await expect(count).toHaveText('1 / 3');
  await page.locator('#search-case').check(); await expect(count).toHaveText('1 / 2');
  await query.fill('猫'); await expect(count).toHaveText('1 / 1');
  await page.locator('#search-word').uncheck();
  await query.fill('a+b'); await expect(count).toHaveText('1 / 1');
  await page.locator('#search-regex').check();
  await query.fill('\\d+'); await expect(count).toHaveText('1 / 2');
  await query.fill('['); await expect(count).toHaveText('正则表达式无效');
  await query.fill('(?=cat)'); await expect(count).toHaveText('1 / 3');
  await query.press('Escape'); await expect(query).toBeHidden();
  await expect(page.locator('#editor')).toHaveValue('Cat cat scatter cat. a+b\n猫 猫咪\n123 456');
});

test('text search highlights rendered text in reading and live views', async () => {
  await page.locator('#editor').fill('# Heading\n\nHello **world** and world.');
  await expect(page.locator('#preview strong')).toHaveText('world');
  for (const view of ['read', 'live']) {
    await page.locator(`button[data-view=${view}]`).click();
    await page.keyboard.press('Control+f');
    await page.locator('#search-query').fill('world');
    await expect(page.locator('#search-count')).toHaveText('1 / 2');
    expect(await page.evaluate(() => CSS.highlights.get('search-results').size)).toBe(2);
    await page.locator('#search-query').press('Escape');
    expect(await page.evaluate(() => CSS.highlights.has('search-results'))).toBe(false);
  }
});

test('text search refreshes after edits and stops expensive regex', async () => {
  await page.locator('#editor').fill('hello');
  await page.keyboard.press('Control+f');
  await page.locator('#search-query').fill('hello');
  await expect(page.locator('#search-count')).toHaveText('1 / 1');
  await page.locator('#editor').fill('hello hello');
  await expect(page.locator('#search-count')).toHaveText('1 / 2');
  await page.locator('#editor').fill('a'.repeat(100) + '!');
  await page.locator('#search-regex').check();
  await page.locator('#search-query').fill('(a+)+$');
  await expect(page.locator('#search-count')).toHaveText('搜索耗时过长，请简化表达式');
  await page.locator('#search-query').fill('!');
  await expect(page.locator('#search-count')).toHaveText('1 / 1');
});

for (const view of ['split', 'edit']) {
  test(`text search keeps source matches highlighted in ${view} view`, async () => {
    await page.locator(`button[data-view=${view}]`).click();
    const editor = page.locator('#editor'), overlay = page.locator('.source-search-overlay');
    await editor.fill('hello\t你好 ' + 'wrapped text '.repeat(30) + '\n' + 'line\n'.repeat(80) + 'hello <b>');
    await page.locator('#search-toggle').click();
    await page.locator('#search-query').fill('hello');
    await expect(page.locator('#search-count')).toHaveText('1 / 2');
    await expect(page.locator('#search-query')).toBeFocused();
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('mark')).toHaveCount(2);
    await expect(overlay.locator('mark').first()).toHaveClass('search-current');
    expect(await overlay.locator('mark').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(239, 157, 54)');
    await page.locator('#search-query').press('Enter');
    await expect(overlay.locator('mark').last()).toHaveClass('search-current');
    await expect.poll(() => page.evaluate(() => {
      const input = document.querySelector('#editor'), layer = document.querySelector('.source-search-overlay');
      const mark = layer.querySelector('.search-current').getBoundingClientRect(), bounds = input.getBoundingClientRect();
      return input.scrollTop > 0 && Math.abs(input.scrollTop - layer.scrollTop) < 1 && mark.top >= bounds.top && mark.bottom <= bounds.bottom;
    })).toBe(true);
    await editor.fill('hello updated');
    await expect(page.locator('#search-count')).toHaveText('1 / 1');
    await expect(overlay.locator('mark')).toHaveCount(1);
    await page.locator('#search-query').fill('missing');
    await expect(page.locator('#search-count')).toHaveText('无匹配结果');
    await expect(overlay).toBeHidden();
    await page.locator('#search-query').fill('hello');
    await expect(overlay).toBeVisible();
    await page.locator('#search-query').press('Escape');
    await expect(overlay).toBeHidden();
  });
}
