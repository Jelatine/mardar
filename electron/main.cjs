const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let win, currentPath = null, dirty = false;
const filters = [{ name: 'Markdown / HTML', extensions: ['md', 'markdown', 'html', 'htm'] }];
function authorized(event) { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Untrusted sender'); }
function handle(name, fn) { ipcMain.handle(name, async (event, ...args) => { authorized(event); return fn(...args); }); }
handle('document:new', () => { currentPath = null; dirty = false; });
handle('document:open', async () => {
  const result = await dialog.showOpenDialog(win, { filters, properties: ['openFile'] });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  const content = await fs.readFile(file, 'utf8');
  currentPath = file; dirty = false;
  return { content, name: path.basename(file), base: pathToFileURL(path.dirname(file) + path.sep).href, format: /\.html?$/i.test(file) ? 'html' : 'markdown' };
});
handle('document:save', async ({ content, saveAs, format }) => {
  if (typeof content !== 'string') throw new Error('Invalid document');
  let target = currentPath;
  if (!target || saveAs) {
    const result = await dialog.showSaveDialog(win, { defaultPath: target || (format === 'html' ? '未命名.html' : '未命名.md'), filters });
    if (result.canceled) return null;
    target = result.filePath;
  }
  await fs.writeFile(target, content, 'utf8'); currentPath = target; dirty = false;
  return { name: path.basename(target), base: pathToFileURL(path.dirname(target) + path.sep).href };
});
handle('document:image', async () => {
  const result = await dialog.showOpenDialog(win, { filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }], properties: ['openFile'] });
  if (result.canceled) return null;
  const file = result.filePaths[0];
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
app.whenReady().then(() => {
  const create = () => {
    currentPath = null; dirty = false;
    win = new BrowserWindow({ width: 1440, height: 940, minWidth: 800, minHeight: 600, backgroundColor: '#f7f6f2', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('close', event => { if (dirty && dialog.showMessageBoxSync(win, { type: 'question', buttons: ['继续编辑', '放弃更改并关闭'], defaultId: 0, cancelId: 0, message: '文档尚未保存，确定关闭吗？' }) !== 1) event.preventDefault(); });
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Mardar', submenu: [{ role: 'about' }, { role: 'quit' }] }, { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: '视图', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }]));
  create(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) create(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
