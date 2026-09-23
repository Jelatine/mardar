import './style.css';
import { setupSearch } from './search';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './print.css';
import { renderDocument, sourceBlocks, assignHeadingIds } from './render';
import { formulaTemplates, chartTemplates } from './templates';
import appIcon from '../build/icon.svg';
const api = window.desktop;
if (api) document.body.classList.add(/Mac/.test(navigator.platform) ? 'desktop-mac' : 'desktop-overlay');
const $ = s => document.querySelector(s);
let name = '未命名.md', base = '', saved = '', format = 'markdown', version = 0, rendering = Promise.resolve(), timer;
// Older versions persisted drafts; every launch now starts with a clean document.
try { localStorage.removeItem('mardar-draft'); } catch {}
$('#app').innerHTML = `<aside class="sidebar"><button class="new" id="new">＋ 新建文档 <kbd>⌘ N</kbd></button><button class="open" id="open"><svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1"/><path d="M3 10h18a1 1 0 0 1 .96 1.28l-2 7A2 2 0 0 1 18 20H6a2 2 0 0 1-1.96-1.6L2 11.2A1 1 0 0 1 3 10Z"/></svg>打开本地文件</button><div class="actions"><button id="save">保存</button><button id="save-as">另存为</button><button class="primary" id="pdf">↓ 导出 PDF</button></div><details id="recent"><summary>最近打开</summary><div id="recent-list"></div></details><div class="outline-header">文档大纲 <span>≡</span></div><nav id="outline"></nav><div class="sidebar-footer"><span class="online"></span> 本地优先 · 自由创作<button id="about">关于 Mardar</button></div></aside><main><header class="titlebar"><button id="toggle-sidebar" title="隐藏左侧工具栏" aria-label="隐藏左侧工具栏" aria-expanded="true">☰</button><div class="breadcrumb"><b id="name"></b><i id="dirty" aria-label="未保存"></i></div></header><section class="toolbar"><div class="format-tools"><button id="undo" title="撤销">↶</button><button id="redo" title="重做">↷</button><span class="divider"></span><button data-wrap="**" title="粗体">B</button><button data-wrap="*" title="斜体"><i>I</i></button><button id="heading" title="标题">H ▾</button><span class="divider"></span><button data-prefix="> " title="引用">❞</button><button data-prefix="- " title="列表">☷</button><button id="link" title="插入链接">↗</button><button id="image" title="插入图片">▧ ▾</button><button id="table" title="插入表格">▦</button><button id="code" title="代码块">&lt;/&gt; ▾</button><button id="math" title="数学公式">ƒx ▾</button><button id="chart" title="Mermaid 图表">◇ ▾</button></div><div class="toolbar-end"><div class="view-tools"><button class="selected" data-view="live">即时编辑</button><button data-view="edit">编辑</button><button data-view="split">分栏</button><button data-view="read">阅读</button></div><div class="toolbar-actions"><button id="theme" title="切换深色主题" aria-label="切换深色主题"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z"/></svg></button></div></div></section><section class="panes" data-view="live"><div id="live" class="prose"></div><div class="editor-pane"><div class="pane-label">源文档 <span>纯粹书写，自由表达</span></div><textarea id="editor" spellcheck="false" aria-label="文档编辑器"></textarea></div><div class="preview-pane"><div class="pane-label">实时预览 <span>✦ 所见即所得</span></div><div id="preview"></div></div></section><footer><span id="status">准备就绪</span><span><button id="update-notice" hidden></button><span id="count"></span><span class="footer-divider">|</span>UTF-8<span class="footer-divider">|</span><span id="position">行 1，列 1</span></span></footer></main><input type="file" id="file" accept=".md,.markdown" hidden><input type="file" id="image-file" accept="image/*" hidden><dialog id="confirm"><h2>保存当前更改？</h2><p>离开当前文档前，可以保存你的写作内容。</p><div><button data-choice="cancel">取消</button><button data-choice="discard">不保存</button><button class="primary" data-choice="save">保存</button></div></dialog>`;
if (!/Mac/.test(navigator.platform)) $('.new kbd').textContent = 'Ctrl N';
// Native title controls sit above the DOM backdrop; keep their colors in sync.
if (api) {
  let modalOpen = false;
  new MutationObserver(() => {
    const open = !!document.querySelector('dialog:modal');
    if (open !== modalOpen) { modalOpen = open; api.modal(open); }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
}
const editor = $('#editor'); editor.value = ''; editor.placeholder = '开始写作…';
const refreshSearch = setupSearch(editor);

function status(text) { $('#status').textContent = text; }
function metadata() { $('#name').textContent = name; $('#dirty').textContent = editor.value !== saved ? '●' : ''; document.title = `${editor.value !== saved ? '● ' : ''}${name} · Mardar`; api?.dirty(editor.value !== saved); $('#count').textContent = `${editor.value.replace(/\s/g, '').length.toLocaleString()} 字符`; }
function render() { const id = ++version; rendering = renderDocument(editor.value, format, base).then(root => { if (id !== version) return; $('#preview').replaceChildren(root); $('#outline').replaceChildren(); root.querySelectorAll('h1,h2,h3').forEach(h => { const b = document.createElement('button'); b.textContent = h.textContent; b.className = h.tagName.toLowerCase(); b.onclick = () => { if ($('.panes').dataset.view === 'live') { const headings = [...$('#live').querySelectorAll('h1,h2,h3')]; headings[[...root.querySelectorAll('h1,h2,h3')].indexOf(h)]?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } else h.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; $('#outline').append(b); }); refreshSearch(); }); return rendering; }
let history = [''], historyIndex = 0, editGroup = null;
function breakHistoryGroup() { editGroup = null; }
function changed(event) {
  if (history[historyIndex] !== editor.value) {
    const now = performance.now(), target = event?.target;
    const type = event?.isComposing ? 'composition' : event?.inputType;
    const continuous = ['insertText', 'insertCompositionText', 'composition', 'deleteContentBackward', 'deleteContentForward'].includes(type);
    const caret = target?.selectionStart;
    const adjacent = editGroup && Math.abs(caret - editGroup.caret) <= Math.max(1, event?.data?.length || 0);
    const merge = continuous && editGroup?.target === target && editGroup.type === type && adjacent && now - editGroup.time < 900 && historyIndex === history.length - 1;
    if (merge) history[historyIndex] = editor.value;
    else { history.splice(++historyIndex); history.push(editor.value); }
    editGroup = continuous ? { target, type, caret, time: now } : null;
  }
  $('#undo').disabled = historyIndex === 0; $('#redo').disabled = historyIndex === history.length - 1; metadata(); clearTimeout(timer); timer = setTimeout(() => render().catch(e => status(e.message)), 220); }
editor.addEventListener('input', changed);
editor.addEventListener('keyup', () => { const lines = editor.value.slice(0, editor.selectionStart).split('\n'); $('#position').textContent = `行 ${lines.length}，列 ${lines.at(-1).length + 1}`; });
function insert(text, suffix = '', replaceSelection = false) {
  breakHistoryGroup();
  const start = editor.selectionStart, end = editor.selectionEnd;
  editor.setRangeText(text + (replaceSelection ? '' : editor.value.slice(start, end)) + suffix, start, end, 'end');
  changed();
  if ($('.panes').dataset.view === 'live') renderLive(editor.selectionEnd); else editor.focus();
}
function insertHeading(level) {
  const start = editor.value.lastIndexOf('\n', editor.selectionStart - 1) + 1;
  const end = editor.value.indexOf('\n', start);
  const line = editor.value.slice(start, end < 0 ? editor.value.length : end);
  editor.setSelectionRange(start, start + (line.match(/^#{1,6}\s+/)?.[0].length || 0));
  insert('#'.repeat(level) + ' ', '', true);
}
document.querySelectorAll('[data-wrap]').forEach(b => b.onclick = () => insert(b.dataset.wrap, b.dataset.wrap));
document.querySelectorAll('[data-prefix]').forEach(b => b.onclick = () => insert(b.dataset.prefix));
$('#link').onclick = () => insert('[', '](https://example.com)');
async function setView(view) {
  breakHistoryGroup();
  $('.panes').dataset.view = view;
  document.querySelectorAll('.view-tools [data-view]').forEach(button => button.classList.toggle('selected', button.dataset.view === view));
  if (view === 'live') await renderLive(editor.value.trim() ? undefined : 0);
  refreshSearch();
}
document.querySelectorAll('.view-tools [data-view]').forEach(button => { button.onclick = () => setView(button.dataset.view); });
$('#toggle-sidebar').onclick = () => { const hidden = $('#app').classList.toggle('sidebar-hidden'); $('#toggle-sidebar').setAttribute('aria-expanded', String(!hidden)); $('#toggle-sidebar').title = $('#toggle-sidebar').ariaLabel = hidden ? '展开左侧工具栏' : '隐藏左侧工具栏'; };
$('#theme').onclick = async () => { const dark = document.body.classList.toggle('dark'); liveCache.clear(); await Promise.all([render(), renderLive(), api?.theme(dark)]); };
$('#undo').onclick = () => undoRedo(); $('#redo').onclick = () => undoRedo(true);
$('#undo').disabled = $('#redo').disabled = true;
editor.addEventListener('blur', breakHistoryGroup);
document.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) breakHistoryGroup(); });
document.addEventListener('pointerdown', breakHistoryGroup);

function download(content, filename, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
async function save(saveAs = false) { breakHistoryGroup(); try { const content = editor.value; const result = api ? await api.save(content, saveAs, format) : { name }; if (!result) return false; if (!api) download(content, name, 'text/plain;charset=utf-8'); name = result.name; base = result.base || ''; saved = content; metadata(); await render(); await refreshRecent(); status('文档已保存'); return true; } catch (e) { status(`保存失败：${e.message}`); return false; } }
let leavePending;
function mayLeave(closing = false) {
  if (leavePending) return leavePending;
  if (editor.value === saved) return Promise.resolve(true);
  leavePending = (async () => {
    const d = $('#confirm');
    d.querySelector('h2').textContent = closing ? '关闭前保存更改？' : '保存当前更改？';
    d.querySelector('p').textContent = `“${name}”有未保存的更改。保存后可继续使用；不保存将丢失这些更改。`;
    d.querySelector('[data-choice=save]').textContent = closing ? '保存并关闭' : '保存';
    d.querySelector('[data-choice=discard]').textContent = closing ? '不保存并关闭' : '不保存';
    const choice = await new Promise(resolve => {
      d.showModal(); d.querySelector('[data-choice=save]').focus();
      d.oncancel = e => { e.preventDefault(); d.close(); resolve('cancel'); };
      d.querySelectorAll('button').forEach(b => b.onclick = () => { d.close(); resolve(b.dataset.choice); });
    });
    return choice === 'discard' || (choice === 'save' && await save() && editor.value === saved);
  })().finally(() => { leavePending = null; });
  return leavePending;
}
api?.onCloseRequest?.(async () => { const allowed = await mayLeave(true); await api.closeResponse(allowed); });

async function load(doc, view = 'read') { breakHistoryGroup(); editor.value = doc.content; history = [editor.value]; historyIndex = 0; saved = editor.value; name = doc.name; base = doc.base || ''; format = 'markdown';  changed(); await setView(view); await render(); await refreshRecent(); }
$('#save').onclick = () => save(); $('#save-as').onclick = () => save(true);
$('#new').onclick = async () => { if (!await mayLeave()) return; await api?.newDocument(); await load({ content: '', name: '未命名.md', format: 'markdown' }, 'live'); };
$('#open').onclick = async () => { if (!await mayLeave()) return; try { if (api) { const doc = await api.open(); if (doc) await load(doc); } else $('#file').click(); } catch (e) { status(`打开失败：${e.message}`); } };
let openingLink = false;
async function openDocumentLink(event) {
  const link = event.target.closest('a[href]');
  if (!link || !(event.ctrlKey || event.metaKey) || (event.type === 'click' && event.button !== 0)) return;
  const href = link.getAttribute('href');
  if (!href || href.startsWith('#') || /^(?!file:)[a-z][a-z\d+.-]*:|^\/\//i.test(href)) return;
  event.preventDefault();
  if (openingLink) return;
  openingLink = true;
  try {
    if (!api) throw new Error('请在桌面版中打开本地文件链接');
    if (!base && !/^file:\/\//i.test(href)) throw new Error('请先保存当前文档，再打开相对路径链接');
    // Resolve before saving: Save As may change the current document directory.
    const url = new URL(href, base || undefined);
    if (url.protocol !== 'file:') throw new Error('仅支持本地 Markdown 文件');
    if (!await mayLeave()) return;
    await load(await api.openLink(url.href));
    if (url.hash) {
      let id;
      try { id = decodeURIComponent(url.hash.slice(1)); } catch { return; }
      [...$('#preview').querySelectorAll('[id]')].find(node => node.id === id)?.scrollIntoView({ block: 'start' });
    }
    status('已打开链接文件');
  } catch (e) { status(`打开失败：${e.message}`); }
  finally { openingLink = false; }
}
for (const host of [$('#preview'), $('#live')]) {
  host.addEventListener('click', openDocumentLink);
  // macOS reports Control-click as a context-menu event.
  host.addEventListener('contextmenu', event => { if (event.ctrlKey) openDocumentLink(event); });
}
$('#file').onchange = async e => { const f = e.target.files[0]; if (f) await load({ content: await f.text(), name: f.name, format: 'markdown' }); e.target.value = ''; };
let imageFormat = 'markdown';
function addImage(item, kind = imageFormat) { insert(kind === 'html' ? `<img src="${item.url.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" alt="图片" width="600" />` : `![图片](<${item.url}>)`); }
function readImage(file) { const kind = imageFormat, reader = new FileReader(); reader.onload = () => addImage({ url: reader.result }, kind); reader.readAsDataURL(file); }
async function chooseImage(kind) { imageFormat = kind; try { if (api) { const item = await api.image(kind === 'base64' ? 'base64' : 'path'); if (item) addImage(item); } else $('#image-file').click(); } catch (e) { status(e.message); } };
function insertImagePath(kind = 'markdown') {
  const d = document.createElement('dialog'); d.className = 'image-path-dialog';
  d.innerHTML = `<form><h2>${kind === 'url' ? '网络 URL' : kind === 'html' ? 'HTML 图片' : 'Markdown 图片'}</h2><label>图片路径或网址<input name="path" placeholder="images/photo.png 或 https://…" required></label><p>本地图片优先使用相对路径；向上超过两级或文档未保存时使用绝对路径。</p><div><button type="button" data-browse>选择本地图片</button><button type="button" data-cancel>取消</button><button class="primary" type="submit">插入</button></div></form>`;
  const input = d.querySelector('input');
  d.querySelector('[data-browse]').hidden = !api || kind === 'url';
  if (kind === 'url') input.placeholder = 'https://example.com/photo.png';
  input.oninput = () => input.setCustomValidity('');
  d.querySelector('[data-browse]').onclick = async () => { try { const item = await api.image('path'); if (item) input.value = item.url; } catch (e) { status(e.message); } };
  d.querySelector('[data-cancel]').onclick = () => d.close();
  d.querySelector('form').onsubmit = e => {
    e.preventDefault(); let url = input.value.trim().replaceAll('\\', '/');
    if (!url) return;
    if (kind === 'url' && !/^https?:\/\/[^/\s]+/i.test(url)) { input.setCustomValidity('请输入有效的 HTTP 或 HTTPS 图片网址'); input.reportValidity(); return; }
    if (/^[a-z]:\//i.test(url)) url = 'file:///' + url;
    else if (url.startsWith('//')) url = 'file:' + url;
    // Angle-delimited destinations support parentheses; escape whitespace and delimiters.
    url = url.replace(/[ <>\r\n]/g, c => encodeURIComponent(c));
    d.close(); addImage({ url }, kind);
  };
  d.onclose = () => d.remove(); document.body.append(d); d.showModal(); input.focus();
}
$('#image-file').onchange = e => { if (e.target.files[0]) readImage(e.target.files[0]); e.target.value = ''; };
let openingDrop = false;
document.addEventListener('dragover', e => {
  if (!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = openingDrop || document.querySelector('dialog[open]') ? 'none' : 'copy';
});
document.addEventListener('drop', async e => {
  const files = [...e.dataTransfer.files];
  if (!files.length) return;
  e.preventDefault();
  if (openingDrop || document.querySelector('dialog[open]')) return;
  const documents = files.filter(file => /\.(md|markdown)$/i.test(file.name));
  if (!documents.length) {
    const images = files.filter(file => file.type.startsWith('image/'));
    if (e.target === editor && images.length) images.forEach(readImage);
    else status('请拖入 Markdown 文件（.md 或 .markdown）');
    return;
  }
  if (documents.length > 1) { status('请一次拖入一个 Markdown 文件'); return; }
  openingDrop = true;
  try {
    if (!await mayLeave()) return;
    const file = documents[0];
    await load(api ? await api.openDropped(file) : { content: await file.text(), name: file.name });
    status('文档已打开');
  } catch (e) { status(`打开失败：${e.message}`); }
  finally { openingDrop = false; }
});
editor.addEventListener('paste', e => { const images = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (images.length) { e.preventDefault(); images.forEach(readImage); } });
$('#pdf').onclick = async () => { const button = $('#pdf'); button.disabled = true; status('正在排版 PDF…'); try { clearTimeout(timer); await render(); await document.fonts.ready; await Promise.all([...$('#preview').querySelectorAll('img')].map(img => img.decode().catch(() => {}))); if (api) { const path = await api.pdf(); status(path ? `PDF 已导出：${path}` : '已取消导出'); } else { window.print(); status('已打开打印对话框，请选择保存为 PDF'); } } catch (e) { status(`导出失败：${e.message}`); } finally { button.disabled = false; } };
document.addEventListener('keydown', e => { if (!(e.metaKey || e.ctrlKey) || e.target.closest('.search-bar')) return; const key = e.key.toLowerCase(); if (key === 'z' || key === 'y') { e.preventDefault(); undoRedo(key === 'y' || e.shiftKey); return; } if (['s', 'o', 'n', 'b', 'i'].includes(key)) { e.preventDefault(); if (key === 's') save(e.shiftKey); if (key === 'o') $('#open').click(); if (key === 'n') $('#new').click(); if (key === 'b') document.querySelectorAll('[data-wrap]')[0].click(); if (key === 'i') document.querySelectorAll('[data-wrap]')[1].click(); } });
window.addEventListener('beforeunload', e => { if (!api && editor.value !== saved) { e.preventDefault(); e.returnValue = ''; } });
metadata(); render().catch(e => status(e.message));

async function refreshRecent() {
  if (!api) return;
  const list = $('#recent-list'); list.replaceChildren();
  for (const file of await api.recent()) { const b = document.createElement('button'); b.textContent = file.split(/[\\/]/).pop(); b.title = file; b.onclick = async () => { if (!await mayLeave()) return; try { await load(await api.openRecent(file)); } catch (e) { status(`打开失败：${e.message}`); } }; list.append(b); }
}
let updateInfo = null;
function openExternal(url) { if (api) api.openExternal(url).catch(e => status(e.message)); else window.open(url, '_blank', 'noopener'); }
function noticeUpdate() { const b = $('#update-notice'); b.hidden = !updateInfo; b.textContent = updateInfo ? `新版本 ${updateInfo.tag} 可用` : ''; }
async function showAbout(checkNow = false) {
  document.querySelector('dialog.about')?.close();
  const info = api ? await api.about() : { tag: '开发预览', builtAt: '—', commit: '—', author: 'Jelatine', repository: 'https://github.com/Jelatine/mardar' };
  const d = document.createElement('dialog'); d.className = 'about';
  d.innerHTML = `<div class="about-head"><img src="${appIcon}" alt=""><div><h2>Mardar</h2><p>跨平台 Markdown 写作与阅读工具</p></div></div><dl><dt>版本</dt><dd data-info="tag"></dd><dt>作者</dt><dd data-info="author"></dd><dt>仓库</dt><dd><a></a></dd><dt>编译日期</dt><dd data-info="builtAt"></dd><dt>提交哈希</dt><dd><code data-info="commit"></code></dd></dl><p class="update-status" role="status"></p><progress max="1" hidden></progress><div><button data-action="check">检查更新</button><button class="primary" data-action="update" hidden></button><button data-action="close">关闭</button></div>`;
  d.querySelectorAll('[data-info]').forEach(el => { el.textContent = info[el.dataset.info] || '—'; });
  const link = d.querySelector('a'); link.href = info.repository; link.textContent = info.repository.replace(/^https:\/\//, ''); link.onclick = e => { e.preventDefault(); openExternal(info.repository); };
  const note = d.querySelector('.update-status'), progress = d.querySelector('progress'), check = d.querySelector('[data-action=check]'), action = d.querySelector('[data-action=update]');
  d.querySelector('[data-action=close]').onclick = () => d.close(); d.onclose = () => d.remove();
  check.onclick = async () => {
    if (!api) { openExternal(`${info.repository}/releases/latest`); return; }
    check.disabled = true; action.hidden = progress.hidden = true; note.textContent = '正在检查更新…';
    try {
      const result = await api.checkUpdate(); updateInfo = result.available ? result : null; noticeUpdate();
      note.textContent = result.available ? `发现新版本 ${result.tag}（当前 ${info.tag}）` : `当前已是最新版本（${info.tag}）`;
      action.hidden = !result.available; action.textContent = result.installable ? '下载并安装' : '前往下载';
    } catch (e) { note.textContent = `检查更新失败：${e.message}`; } finally { check.disabled = false; }
  };
  action.onclick = async () => {
    if (!updateInfo?.installable) { openExternal(updateInfo?.url || `${info.repository}/releases/latest`); return; }
    check.disabled = action.disabled = true; progress.hidden = false; progress.removeAttribute('value'); note.textContent = `正在下载 ${updateInfo.tag}…`;
    try {
      await api.downloadUpdate(); progress.value = 1; note.textContent = '下载完成，已通过 SHA-256 校验。';
      if (!await mayLeave()) { note.textContent = '更新已下载，处理好当前文档后可继续安装。'; action.textContent = '安装并重启'; return; }
      note.textContent = '正在安装，Mardar 即将重启…'; await api.installUpdate();
    } catch (e) { note.textContent = `更新失败：${e.message}`; progress.hidden = true; } finally { check.disabled = action.disabled = false; }
  };
  document.body.append(d); d.showModal();
  if (checkNow) check.click();
}
$('#about').onclick = () => showAbout();
$('#update-notice').onclick = () => showAbout(true);
api?.onShowAbout?.(checkNow => showAbout(checkNow));
api?.onUpdateAvailable?.(result => { updateInfo = result; noticeUpdate(); });
api?.onUpdateProgress?.(value => { const bar = document.querySelector('dialog.about progress'); if (!bar) return; bar.value = value; bar.parentElement.querySelector('.update-status').textContent = `正在下载 ${Math.round(value * 100)}%`; });
function undoRedo(redo = false) {
  breakHistoryGroup();
  const next = historyIndex + (redo ? 1 : -1);
  if (next < 0 || next >= history.length) return;
  const active = $('#live textarea'); if (active) active.onblur = null;
  historyIndex = next; editor.value = history[next]; metadata(); render(); $('#undo').disabled = historyIndex === 0; $('#redo').disabled = historyIndex === history.length - 1;
  if ($('.panes').dataset.view === 'live') renderLive();
}
editor.addEventListener('beforeinput', e => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); undoRedo(e.inputType === 'historyRedo'); } });
api?.onHistory?.(undoRedo);
let liveGeneration = 0, liveBlocks = [], liveCache = new Map();
const livePlaceholder = '开始写作… 支持 Markdown，例如 # 标题、**粗体**、- 列表';
const contentEnd = text => text.replace(/\s+$/, '').length;
// Re-render the live document, reusing blocks whose source is unchanged, then
// optionally continue editing at a source offset.
async function renderLive(focus) {
  const generation = ++liveGeneration, host = $('#live'), entries = [], cache = new Map(), empty = !editor.value.trim();
  for (const block of sourceBlocks(editor.value)) {
    const key = `${document.body.classList.contains('dark')}\n${base}\n${block.text}`;
    let view = liveCache.get(key)?.find(candidate => !entries.some(entry => entry.view === candidate));
    if (!view && empty) { view = document.createElement('p'); view.className = 'live-placeholder'; view.textContent = livePlaceholder; }
    if (!view) { view = await renderDocument(block.text, 'markdown', base); if (generation !== liveGeneration) return; }
    cache.set(key, [...(cache.get(key) || []), view]);
    const item = document.createElement('div'); item.className = 'live-block'; item.tabIndex = 0;
    const entry = { block, item, view };
    item.onkeydown = e => { if (e.target === item && e.key === 'Enter') { e.preventDefault(); activateLive(entry, contentEnd(block.text)); } };
    entries.push(entry);
  }
  if (generation !== liveGeneration) return;
  const scroll = host.scrollTop; liveCache = cache; liveBlocks = entries;
  // Replacing a focused textarea can synchronously fire blur on Windows.
  // Disable its handler before committing so it cannot start a competing render.
  const active = host.querySelector('textarea'); if (active) active.onblur = null;
  entries.forEach(entry => entry.item.append(entry.view));
  host.replaceChildren(...entries.map(entry => entry.item)); assignHeadingIds(host); host.scrollTop = scroll; refreshSearch();
  if (focus != null) { const entry = entries.findLast(x => x.block.start <= focus) || entries[0]; activateLive(entry, focus - entry.block.start); }
}
function activateLive(entry, caret) {
  const { block, item } = entry, host = $('#live');
  if (item.querySelector('textarea')) return;
  // Edit only the paragraph's content; its trailing blank-line separator stays in the source.
  const separator = block.text.slice(contentEnd(block.text));
  const input = document.createElement('textarea'); input.value = block.text.slice(0, block.text.length - separator.length); input.placeholder = livePlaceholder; input.rows = 1; input.setAttribute('aria-label', '当前段落 Markdown');
  if (/^\s*(?:```|~~~|\$\$|<|\|)/.test(block.text)) input.classList.add('source-code');
  item.classList.add('editing'); item.replaceChildren(input);
  const fit = () => { const scroll = host.scrollTop; input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; host.scrollTop = scroll; };
  const sync = () => editor.setSelectionRange(block.start + input.selectionStart, block.start + input.selectionEnd);
  // Leave editing and continue at another source offset (offsets survive the re-render).
  const move = offset => { input.onblur = null; breakHistoryGroup(); renderLive(offset); };
  fit(); caret = Math.max(0, Math.min(caret, input.value.length));
  input.focus({ preventScroll: true }); input.setSelectionRange(caret, caret); sync(); item.scrollIntoView({ block: 'nearest' });
  input.onbeforeinput = e => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); undoRedo(e.inputType === 'historyRedo'); } };
  input.onselect = input.onkeyup = input.onclick = sync;
  input.oninput = event => {
    const text = input.value + separator, delta = text.length - block.text.length;
    editor.value = editor.value.slice(0, block.start) + text + editor.value.slice(block.start + block.text.length);
    for (const other of liveBlocks) if (other.block.start > block.start) other.block.start += delta;
    block.text = text; sync(); changed(event); fit();
  };
  // Switching windows keeps the paragraph open; only a real focus change renders it.
  input.onblur = () => { if (document.activeElement === input || !input.isConnected) return; breakHistoryGroup(); renderLive(); };
  input.onkeydown = e => {
    if (e.key === 'Escape') { input.blur(); return; }
    if (e.isComposing || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || input.selectionStart !== input.selectionEnd) return;
    const index = liveBlocks.indexOf(entry), at = input.selectionStart, previous = liveBlocks[index - 1]?.block, next = liveBlocks[index + 1]?.block;
    if (at === 0 && previous && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { e.preventDefault(); move(previous.start + contentEnd(previous.text)); }
    else if (next && ((e.key === 'ArrowDown' && !input.value.slice(at).trim()) || (e.key === 'ArrowRight' && at === input.value.length))) { e.preventDefault(); move(next.start); }
    else if (at === 0 && previous && e.key === 'Backspace') {
      // Join with the previous block by deleting the separator before this paragraph.
      e.preventDefault(); breakHistoryGroup(); input.onblur = null;
      editor.value = editor.value.slice(0, block.start - 1) + editor.value.slice(block.start); changed(); breakHistoryGroup(); renderLive(block.start - 1);
    }
  };
}
// Map a point in a rendered block to its Markdown source by matching visible characters.
function caretFromPoint({ block, view }, x, y) {
  const text = block.text, position = document.caretPositionFromPoint?.(x, y), range = position ? null : document.caretRangeFromPoint?.(x, y);
  const node = position?.offsetNode ?? range?.startContainer, offset = position?.offset ?? range?.startOffset;
  if (!node || !view.contains(node) || view.classList.contains('live-placeholder')) return contentEnd(text);
  const before = document.createRange(); before.selectNodeContents(view); before.setEnd(node, offset);
  const prefix = before.toString(), visible = prefix.replace(/\s/g, '');
  if (!visible) return text.match(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?/)[0].length;
  let i = 0;
  for (let matched = 0; matched < visible.length; i++) { if (i >= text.length) return contentEnd(text); if (text[i] === visible[matched]) matched++; }
  if (/\s$/.test(prefix)) while (/[^\S\n]/.test(text[i] || '')) i++;
  return i;
}
$('#live').addEventListener('mousedown', e => {
  const host = e.currentTarget, bounds = host.getBoundingClientRect();
  if (e.button !== 0 || e.target.closest('textarea, a') || e.clientX >= bounds.left + host.clientWidth || !liveBlocks.length) return;
  e.preventDefault();
  let entry = liveBlocks.find(x => x.item.contains(e.target)), caret;
  const active = $('#live textarea');
  if (!entry && active) { active.blur(); return; }
  if (entry && active && entry.item.contains(active)) { active.focus(); return; }
  if (!entry && e.clientY > liveBlocks.at(-1).item.getBoundingClientRect().bottom) { entry = liveBlocks.at(-1); caret = contentEnd(entry.block.text); }
  else {
    // Clicks in margins or gaps target the nearest paragraph at the same height.
    entry ||= liveBlocks.find(x => e.clientY <= x.item.getBoundingClientRect().bottom) || liveBlocks.at(-1);
    const rect = entry.item.getBoundingClientRect(), clamp = (value, min, max) => Math.max(min, Math.min(value, max));
    caret = caretFromPoint(entry, clamp(e.clientX, rect.left + 12, rect.right - 2), clamp(e.clientY, rect.top + 1, rect.bottom - 1));
  }
  if (active) active.onblur = null;
  breakHistoryGroup(); renderLive(entry.block.start + caret);
});
let processingOpen = false;
async function openRequested() { if (processingOpen) return; processingOpen = true; try { let file; while ((file = await api.pending())) { if (!await mayLeave()) { await api.dismissPending(file); continue; } await load(await api.openPending(file)); } } catch (e) { status(`打开失败：${e.message}`); } finally { processingOpen = false; } }
api?.onOpenRequest(openRequested); refreshRecent(); if (api) openRequested();

renderLive(editor.value.trim() ? undefined : 0).catch(e => status(e.message));

let sourceMeasurements = new Map(), measurementKey = '';
// Measure wrapped source lines using the same typography and width as the textarea.
function sourceY(line) {
  const key = `${version}:${editor.clientWidth}`; if (key !== measurementKey) { sourceMeasurements.clear(); measurementKey = key; }
  if (sourceMeasurements.has(line)) return sourceMeasurements.get(line);
  const mirror = document.createElement('div'), css = getComputedStyle(editor);
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${editor.clientWidth}px`, font: css.font, padding: css.padding, boxSizing: 'border-box', tabSize: css.tabSize });
  mirror.textContent = editor.value.split('\n').slice(0, line).join('\n') + (line ? '\n' : '');
  const marker = document.createElement('span'); marker.textContent = '\u200b'; mirror.append(marker); document.body.append(mirror);
  const y = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top; mirror.remove(); sourceMeasurements.set(line, y); return y;
}
function mappedNodes() { return [...$('#preview').querySelectorAll('[data-source-line]')]; }
function markSource(node) { $('#preview .source-active')?.classList.remove('source-active'); node?.classList.add('source-active'); }
function syncCaret() {
  if ($('.panes').dataset.view !== 'split') return;
  const line = editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
  const node = mappedNodes().filter(n => +n.dataset.sourceLine <= line && +n.dataset.sourceEnd > line).at(-1);
  markSource(node); node?.scrollIntoView({ block: 'nearest' });
}
editor.addEventListener('click', syncCaret); editor.addEventListener('keyup', syncCaret);
$('#preview').addEventListener('click', e => {
  if ($('.panes').dataset.view !== 'split' || e.target.closest('a')) return;
  const node = e.target.closest('[data-source-line]'); if (!node) return;
  const line = +node.dataset.sourceLine;
  const offset = editor.value.split('\n').slice(0, line).reduce((n, s) => n + s.length + 1, 0);
  editor.focus(); editor.setSelectionRange(offset, offset); editor.scrollTop = Math.max(0, sourceY(line) - editor.clientHeight / 3); markSource(node);
  $('#position').textContent = `行 ${line + 1}，列 1`;
});
let scrollOwner = null, scrollRelease;
function syncScroll(from, to, reverse) {
  if ($('.panes').dataset.view !== 'split' || (scrollOwner && scrollOwner !== from)) return;
  scrollOwner = from; clearTimeout(scrollRelease);
  const preview = $('#preview'), rect = preview.getBoundingClientRect();
  const points = [{ source: 0, preview: 0 }];
  for (const node of mappedNodes()) {
    const point = { source: sourceY(+node.dataset.sourceLine), preview: node.getBoundingClientRect().top - rect.top + preview.scrollTop };
    if (point.source > points.at(-1).source && point.preview > points.at(-1).preview) points.push(point);
  }
  const key = reverse ? 'preview' : 'source', target = reverse ? 'source' : 'preview';
  points.push({ source: editor.scrollHeight, preview: preview.scrollHeight });
  let i = points.findIndex(p => p[key] > from.scrollTop); if (i < 1) i = points.length - 1;
  const a = points[i - 1], b = points[i];
  to.scrollTop = from.scrollTop >= from.scrollHeight - from.clientHeight - 1 ? to.scrollHeight - to.clientHeight : a[target] + (b[target] - a[target]) * (from.scrollTop - a[key]) / Math.max(1, b[key] - a[key]);
  scrollRelease = setTimeout(() => { scrollOwner = null; }, 100);
}
editor.addEventListener('scroll', () => syncScroll(editor, $('#preview'), false));
$('#preview').addEventListener('scroll', () => syncScroll($('#preview'), editor, true));

// A shared, keyboard-accessible chooser for insertion templates.
function attachMenu(id, options) {
  const trigger = $('#' + id), menu = document.createElement('div');
  menu.className = 'insert-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
  document.body.append(menu);
  const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  options.forEach(([label, action]) => {
    const button = document.createElement('button'); button.textContent = label; button.setAttribute('role', 'menuitem');
    button.onclick = () => { close(); action(); }; menu.append(button);
  });
  trigger.onclick = () => {
    const opening = menu.hidden; document.querySelectorAll('.insert-menu').forEach(el => { el.hidden = true; });
    document.querySelectorAll('[aria-haspopup=menu]').forEach(el => el.setAttribute('aria-expanded', 'false'));
    if (!opening) return;
    menu.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    const rect = trigger.getBoundingClientRect(); menu.style.left = `${Math.min(rect.left, innerWidth - menu.offsetWidth - 12)}px`; menu.style.top = `${rect.bottom + 6}px`; menu.firstElementChild.focus();
  };
  menu.onkeydown = e => {
    const items = [...menu.children], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); trigger.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    if (e.key === 'Tab') close();
  };
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target) && !trigger.contains(e.target)) close(); });
}
attachMenu('heading', Array.from({ length: 6 }, (_, i) => [`H${i + 1} · ${i + 1} 级标题`, () => insertHeading(i + 1)]));
attachMenu('code', ['plaintext', 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'bash', 'sql', 'json', 'yaml', 'html', 'css'].map(language => [language === 'plaintext' ? '纯文本' : language, () => insert('\n```' + language + '\n', '\n```\n')]));
attachMenu('math', formulaTemplates.map(([label, value]) => [label, () => insert('\n$$\n' + value + '\n$$\n')]));
attachMenu('chart', chartTemplates.map(([label, value]) => [label, () => insert('\n```mermaid\n' + value + '\n```\n')]));
attachMenu('image', [['Markdown 图片', () => insertImagePath('markdown')], ['HTML <img>（可调整宽度）', () => insertImagePath('html')], ['网络 URL', () => insertImagePath('url')], ['Base64 嵌入图片', () => chooseImage('base64')]]);

$('#table').onclick = () => {
  const d = document.createElement('dialog'); d.className = 'image-path-dialog';
  d.innerHTML = `<form><h2>插入表格</h2><label>列数<input name="columns" type="number" min="1" max="20" value="3" required></label><label>数据行数<input name="rows" type="number" min="1" max="100" value="3" required></label><p>包含一行表头，可在插入后编辑内容。</p><div><button type="button">取消</button><button type="submit" class="primary">插入</button></div></form>`;
  d.querySelector('button').onclick = () => d.close();
  d.querySelector('form').onsubmit = e => {
    e.preventDefault(); const columns = +d.querySelector('[name=columns]').value, rows = +d.querySelector('[name=rows]').value;
    if (!Number.isInteger(columns) || columns < 1 || columns > 20 || !Number.isInteger(rows) || rows < 1 || rows > 100) return;
    const row = cells => '| ' + cells.join(' | ') + ' |';
    const text = [row(Array.from({ length: columns }, (_, i) => `列 ${i + 1}`)), row(Array(columns).fill('---')), ...Array.from({ length: rows }, () => row(Array(columns).fill('内容')))];
    d.close(); insert('\n\n' + text.join('\n') + '\n\n', '', true);
  };
  d.onclose = () => d.remove(); document.body.append(d); d.showModal();
};
