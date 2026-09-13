import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sample } from '../src/sample.js';
import { formulaTemplates, chartTemplates } from '../src/templates.js';
let app, page, folder;
test.beforeEach(async ({}, testInfo) => {
  folder = await mkdtemp(path.join(tmpdir(), 'mardar-test-'));
  const startup = testInfo.title === 'cold launch opens the requested file without a save prompt';
  const startupFile = path.join(folder, 'cold.md');
  if (startup) await writeFile(startupFile, '# 冷启动\r\n');
  app = await electron.launch({ executablePath: process.env.MARDAR_APP_PATH, args: [...(process.env.MARDAR_APP_PATH ? [] : ['.']), `--user-data-dir=${folder}/profile`, '--no-sandbox', ...(startup ? [startupFile] : [])] });
  page = await app.firstWindow();
  await expect(page.locator('#editor')).toHaveValue(startup ? '# 冷启动\n' : '');
  await expect(page.locator('#dirty')).toBeEmpty();
  await expect(page.locator('.panes')).toHaveAttribute('data-view', 'live');
  await page.locator('button[data-view=split]').click();
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
  await page.locator('#live textarea').fill('# 新标题\n\n');
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
  await page.locator('#new').click();
  await page.locator('#editor').fill('# 图片笔记\n\n');
  const image = path.join(folder, 'picture.svg');
  await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="70" height="40"><rect width="70" height="40" fill="blue"/></svg>');
  await page.locator('#editor').press('ControlOrMeta+End');
  await chooseOpen(image); await page.locator('#image').click(); await page.getByRole('menuitem', { name: 'Markdown 图片', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue(/data:image\/svg\+xml;base64,/);
  await expect.poll(() => page.locator('#preview img').evaluate(img => img.naturalWidth)).toBe(70);
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
  await page.locator('#save').click(); await expect(page.locator('#dirty')).toHaveText('●');
  const file = path.join(folder, 'images.md'); await chooseSave(file); await page.locator('#save').click();
  await expect.poll(() => readFile(file, 'utf8')).toContain('data:image/svg+xml;base64,');
  await expect(page.locator('#dirty')).toBeEmpty();
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
  await page.locator('#editor').fill(original + '修改');
  await expect(page.locator('#dirty')).toHaveText('●');
  await page.locator('#editor').fill(original);
  await expect(page.locator('#dirty')).toBeEmpty();
  await page.locator('#new').click();
  await expect(page.locator('#editor')).toHaveValue('');
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
  await page.locator('#live h2').first().click();
  await page.locator('#live textarea').fill('## Changed\n\n');
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
  await page.getByRole('menuitem', { name: 'HTML 图片（可调整宽度）', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue(/<img src="data:image/);
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
