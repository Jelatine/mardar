const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let win, currentPath = null, dirty = false, darkTheme = false, modalOpen = false, closePending = false, allowClose = false, quitting = false;
// Match dialog::backdrop (rgba(30, 48, 44, 1/3)) over native controls.
const dimColor = hex => '#' + hex.slice(1).match(/../g).map((channel, i) => Math.round(parseInt(channel, 16) * 2 / 3 + [30, 48, 44][i] / 3).toString(16).padStart(2, '0')).join('');
const themeColors = () => {
  const color = darkTheme ? '#202820' : '#ffffff', symbolColor = darkTheme ? '#d9e2d4' : '#303b35';
  // Leave the header's bottom border visible below the native overlay.
  return { color: modalOpen ? dimColor(color) : color, symbolColor: modalOpen ? dimColor(symbolColor) : symbolColor, height: 47 };
};
const filters = [{ name: 'Markdown', extensions: ['md', 'markdown'] }];
function authorized(event) { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Untrusted sender'); }
function handle(name, fn) { ipcMain.handle(name, async (event, ...args) => { authorized(event); return fn(...args); }); }
handle('window:theme', dark => {
  darkTheme = dark === true; nativeTheme.themeSource = darkTheme ? 'dark' : 'light';
  if (process.platform !== 'darwin') win.setTitleBarOverlay(themeColors());
});
handle('window:modal', open => {
  modalOpen = open === true;
  if (process.platform !== 'darwin') win.setTitleBarOverlay(themeColors());
});
handle('document:new', () => { currentPath = null; dirty = false; });
const buildInfo = require('./build-info.json');
let recent = [], pending = [], rendererReady = false;
const isMarkdown = file => typeof file === 'string' && /\.(md|markdown)$/i.test(file);
async function remember(file) {
  recent = [file, ...recent.filter(x => x !== file)].slice(0, 12);
  await fs.writeFile(path.join(app.getPath('userData'), 'recent.json'), JSON.stringify(recent));
  app.addRecentDocument(file);
}
async function openFile(file) {
  if (!isMarkdown(file)) throw new Error('仅支持 Markdown 文件');
  const content = await fs.readFile(file, 'utf8');
  await remember(file); currentPath = file; dirty = false;
  return { content, name: path.basename(file), base: pathToFileURL(path.dirname(file) + path.sep).href, format: 'markdown' };
}
handle('document:open', async () => {
  const result = await dialog.showOpenDialog(win, { filters, properties: ['openFile'] });
  return result.canceled ? null : openFile(result.filePaths[0]);
});
handle('document:recent', () => recent);
handle('document:open-recent', file => { if (!recent.includes(file)) throw new Error('文件不在最近列表中'); return openFile(file); });
handle('document:pending', () => { rendererReady = true; return pending[0] || null; });
handle('document:open-pending', file => { if (!pending.includes(file)) throw new Error('无打开请求'); pending = pending.filter(x => x !== file); return openFile(file); });
handle('document:dismiss-pending', file => { pending = pending.filter(x => x !== file); });
const pkg = require('../package.json'), updater = require('./updater.cjs');
const repository = pkg.repository.url.replace(/\.git$/, '');
handle('app:about', () => ({ ...buildInfo, author: pkg.author, repository, homepage: pkg.homepage }));
handle('app:open-external', url => {
  if (typeof url !== 'string' || !(url === repository || url.startsWith(`${repository}/`) || url === pkg.homepage)) throw new Error('不允许打开该链接');
  return shell.openExternal(url);
});
handle('update:check', () => updater.check(buildInfo.version));
handle('update:download', () => updater.download(value => { if (win && !win.isDestroyed()) win.webContents.send('update:progress', value); }));
handle('update:install', async () => { await updater.install(); dirty = false; setImmediate(() => app.quit()); });
function queueFile(file) { if (!isMarkdown(file)) return; pending.push(path.resolve(file)); if (rendererReady && win && !win.isDestroyed()) win.webContents.send('document:requested'); }
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', (_event, argv) => { argv.filter(isMarkdown).forEach(queueFile); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('open-file', (event, file) => { event.preventDefault(); queueFile(file); });
process.argv.slice(1).filter(isMarkdown).forEach(queueFile);
handle('document:save', async ({ content, saveAs, format }) => {
  if (typeof content !== 'string') throw new Error('Invalid document');
  let target = currentPath;
  if (!target || saveAs) {
    const result = await dialog.showSaveDialog(win, { defaultPath: target || '未命名.md', filters });
    if (result.canceled) return null;
    target = result.filePath;
  }
  if (!isMarkdown(target)) target += '.md';
  await fs.writeFile(target, content, 'utf8'); await remember(target); currentPath = target; dirty = false;
  return { name: path.basename(target), base: pathToFileURL(path.dirname(target) + path.sep).href };
});
handle('document:image', async mode => {
  const result = await dialog.showOpenDialog(win, { filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }], properties: ['openFile'] });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  if (mode === 'path') {
    const relative = currentPath ? path.relative(path.dirname(currentPath), file) : null;
    const url = relative && !path.isAbsolute(relative) && relative.split(path.sep).filter(part => part === '..').length <= 2 ? relative.split(path.sep).map(encodeURIComponent).join('/') : pathToFileURL(file).href;
    return { name: path.basename(file), url };
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  return { name: path.basename(file), url: `data:image/${ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext};base64,${(await fs.readFile(file)).toString('base64')}` };
});
handle('document:pdf', async () => {
  const result = await dialog.showSaveDialog(win, { defaultPath: (currentPath ? path.basename(currentPath).replace(/\.[^.]+$/, '') : '未命名') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (result.canceled) return null;
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
  await fs.writeFile(result.filePath, data); return result.filePath;
});
ipcMain.on('document:dirty', (event, value) => { authorized(event); dirty = !!value; win.setDocumentEdited(dirty); });
app.whenReady().then(async () => {
  if (!lock) return;
  try { recent = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'recent.json'), 'utf8')).filter(isMarkdown).slice(0, 12); } catch {}
  const create = () => {
    closePending = false; allowClose = false; quitting = false;
    currentPath = null; dirty = false; rendererReady = false; darkTheme = false; modalOpen = false; nativeTheme.themeSource = 'light';
    win = new BrowserWindow({ icon: path.join(__dirname, '../build/icon.png'), titleBarStyle: 'hidden', ...(process.platform === 'darwin' ? {} : { titleBarOverlay: themeColors() }), width: 1440, height: 940, minWidth: 800, minHeight: 600, backgroundColor: '#ffffff', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('close', event => {
      if (allowClose || !dirty) return;
      event.preventDefault();
      if (!closePending) { closePending = true; win.webContents.send('window:close-request'); }
    });
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Mardar', submenu: [{ label: '关于 Mardar', click: () => win?.webContents.send('app:show-about', false) }, { label: '检查更新…', click: () => win?.webContents.send('app:show-about', true) }, { type: 'separator' }, { role: 'quit' }] }, { label: '编辑', submenu: [{ label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send('document:history', false) }, { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: () => win.webContents.send('document:history', true) }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: '视图', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }]));
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  create(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) create(); });
  // Quietly look for a newer release; the renderer shows a notice only when one exists.
  if (app.isPackaged) setTimeout(() => updater.check(buildInfo.version).then(result => { if (result.available && win && !win.isDestroyed()) win.webContents.send('update:available', result); }).catch(() => {}), 5000);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => { quitting = true; });
handle('window:close-response', allowed => {
  if (!closePending) return;
  closePending = false;
  if (allowed !== true) { quitting = false; return; }
  allowClose = true;
  if (quitting) app.quit(); else win.close();
});
