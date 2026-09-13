import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
let app, page, folder;
test.beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'mardar-test-'));
  app = await electron.launch({ executablePath: process.env.MARDAR_APP_PATH, args: [...(process.env.MARDAR_APP_PATH ? [] : ['.']), `--user-data-dir=${folder}/profile`, '--no-sandbox'] });
  page = await app.firstWindow();
  await expect(page.locator('#preview h1')).toHaveText('让想法，跃然纸上');
});
test.afterEach(async () => { if (app) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())); await app.close(); } });
async function chooseOpen(file) { await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file); }
async function chooseSave(file) { await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, file); }
test('renders math, diagram, code and switches reading mode', async () => {
  await expect(page.locator('#preview .katex').first()).toBeVisible();
  await expect(page.locator('#preview .mermaid svg')).toBeVisible();
  await expect(page.locator('#preview .mermaid svg')).toContainText('捕捉灵感');
  const scriptPosition = await page.locator('#preview .katex').first().evaluate(el => {
    const script = el.querySelector('.msupsub');
    return { scriptY: script.querySelector('.mord').getBoundingClientRect().y, baseY: script.previousElementSibling.getBoundingClientRect().y };
  });
  expect(scriptPosition.scriptY).toBeLessThan(scriptPosition.baseY);
  await expect(page.locator('#preview .hljs-keyword').first()).toBeVisible();
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
  const pdf = path.join(folder, 'document.pdf'); await chooseSave(pdf);
  await page.locator('#pdf').click(); await expect(page.locator('#status')).toContainText('PDF 已导出');
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
test('unsaved edits can cancel new document and recover after restart', async () => {
  await page.locator('#editor').fill('# 未保存的草稿');
  await page.locator('#new').click(); await expect(page.locator('#confirm')).toBeVisible();
  await page.locator('[data-choice=cancel]').click(); await expect(page.locator('#editor')).toHaveValue('# 未保存的草稿');
  await page.reload(); await expect(page.locator('#editor')).toHaveValue('# 未保存的草稿');
  await page.locator('#new').click(); await page.locator('[data-choice=discard]').click(); await expect(page.locator('#editor')).toHaveValue('');
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
  await chooseOpen(image); await page.locator('#image').click();
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
